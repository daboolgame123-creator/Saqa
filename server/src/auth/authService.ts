/**
 * خدمة المصادقة (Phase 11) — منطق §11 و§27 في مكان واحد.
 *
 * كل الأرقام المستخدمة هنا آتية من `authTypes.ts` المنقول عن الخطة،
 * فلا قاعدة عمل مكتوبة يدوياً في الكود.
 *
 * ما تفعله الخدمة:
 * - تسجيل حساب لأول مرة (رقم باج + هاتف ← OTP ← رمز سرّي ← تفعيل).
 * - دخول معتاد برقم الباج أو الهاتف مع الرمز السري، بعدد محاولات
 *   وتجميد مؤقت.
 * - استعادة الرمز السري بالهاتف + OTP.
 * - إدارة الجلسات: إنشاء، تحقّق، خمول 30 دقيقة، إبطال، خروج.
 * - إعادة ضبط إدارية برمز مؤقت، وكشف الرمز الحالي لمسؤول مسجَّل.
 *
 * ما لا تفعله عمداً (خارج نطاق Phase 11):
 * - **لا RBAC ولا Access Scope**: من يملك أي صلاحية على أي مورد هو
 *   Phase 12 وPhase 13. مسارا «إعادة الضبط» و«كشف الرمز» يطلبان جلسة
 *   صحيحة فقط، لأن التحقق من الدور مرحلة لاحقة.
 * - **لا اختيار مزوّد SMS**: يُستدعى `OtpProvider` المُمرَّر فقط.
 */
import type { Pool } from 'pg';
import { getSharedPool, withTransaction, type Queryable } from '../database';
import { isPool } from '../repositories/shared';
import { TechnicalLogger } from '../logging';
import { AccountRepository, type EncryptedSecretFields } from './accountRepository';
import { OtpRepository } from './otpRepository';
import { SessionRepository } from './sessionRepository';
import { recordAuthEvent } from './authAudit';
import { createOtpProvider } from './otpProvider';
import type { OtpProvider } from './otpProvider';
import {
  AccountBlockedError,
  AccountFrozenError,
  AccountIntegrityError,
  AccountNotFoundError,
  AuthenticationRequiredError,
  InvalidCredentialsError,
  OtpInvalidError,
  OtpRateLimitedError,
  SecretChangeRequiredError,
  SecretUnavailableError,
} from './authErrors';
import { generateOtpCode, generateSecret, generateSessionToken, hashToken, safeEquals } from './crypto';
import { decryptSecret, encryptSecret } from './secretVault';
import {
  LOGIN_DELAY_AT_ATTEMPT,
  LOGIN_DELAY_MS,
  LOGIN_FREEZE_AT_ATTEMPT,
  LOGIN_FREEZE_MINUTES,
  OTP_MAX_FAILED_ATTEMPTS,
  OTP_MAX_REQUESTS,
  OTP_RATE_BLOCK_MINUTES,
  OTP_RATE_WINDOW_MINUTES,
  OTP_TTL_MINUTES,
  SESSION_IDLE_MS,
  SESSION_REVOKE_REASONS,
  type AccountRecord,
  type AuthenticatedIdentity,
  type OtpPurpose,
  type OtpRecord,
} from './authTypes';

/** تبعيات الخدمة — تُحقَّن (قاعدة اختبار أو Pool مشترك). */
export interface AuthServiceDependencies {
  db: Queryable;
  otpProvider: OtpProvider;
}

/** نتيجة-neutral لطلبات OTP: لا تكشف وجود الحساب ولا نجاح المطابقة. */
export interface OtpRequestAccepted {
  accepted: true;
}

/** نتيجة إنشاء جلسة بعد دخول ناجح. */
export interface LoginResult {
  account: AccountSummary;
  /** الرفعة — تُعاد مرة واحدة وتُخزَّن مجزّأةً فقط. */
  sessionToken: string;
  sessionId: string;
  mustChangeSecret: boolean;
}

/** ملخّص الحساب الآمن للعرض — لا رمز سري ولا تجزئة ولا مفتاح. */
export interface AccountSummary {
  id: string;
  employeeId: string | null;
  username: string;
  displayName: string;
  role: string;
  status: AccountRecord['status'];
  mustChangeSecret: boolean;
}

function toSummary(account: AccountRecord): AccountSummary {
  return {
    id: account.id,
    employeeId: account.employeeId,
    username: account.username,
    displayName: account.displayName,
    role: account.role,
    status: account.status,
    mustChangeSecret: account.mustChangeSecret,
  };
}

/** تاريخ ISO بعد عدد مللي ثانية من الآن. */
function isoFromNow(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

/** تأخير بملي ثانية (يُستخدم لتأخير المحاولة الرابعة §11.4). */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * الخدمة المشتركة على الـPool المشترك — تُبنى عند أول استدعاء.
 *
 * البناء عند أول استيراد مقصود: لا مصادقة بلا قاعدة ولا مزوّد (§11).
 */
let sharedService: AuthService | null = null;

/** يعيد الخدمة المشتركة وينشئها عند أول استدعاء. */
export function getSharedAuthService(): AuthService {
  if (sharedService === null) {
    sharedService = new AuthService({
      db: getSharedPool(),
      otpProvider: createOtpProvider(),
    });
  }
  return sharedService;
}

/** يبني خدمة على Pool صريح — للاختبارات وCLI. */
export function createAuthServiceOnPool(pool: Pool, otpProvider: OtpProvider): AuthService {
  return new AuthService({ db: pool, otpProvider });
}


/** مدخلات طلب رمز تسجيل. */
export interface RegistrationOtpRequest {
  badgeNumber: string;
  phone: string;
}

/** مدخلات التحقق من رمز OTP مع إنشاء/استبدال الرمز السري. */
export interface VerifyOtpRequest {
  phone: string;
  code: string;
  secret: string;
}

/** مدخلات الدخول المعتاد. */
export interface LoginRequest {
  /** رقم الباج/الرقم الوظيفي أو رقم الهاتف (§11.2). */
  identifier: string;
  secret: string;
}

/** مدخلات تغيير الرمز السري للحساب نفسه. */
export interface ChangeOwnSecretRequest {
  currentSecret: string;
  newSecret: string;
}

/** مُعرِّف فاعل مُصادَق لعمليات الإدارة. */
export interface ActorRef {
  userId: string;
  employeeId: string | null;
}

/** المستودعات الثلاثة على اتصال واحد (يُستخدم في `durable` و`inTransaction`). */
interface AuthRepos {
  accounts: AccountRepository;
  sessions: SessionRepository;
  otp: OtpRepository;
}

/** خدمة المصادقة. */
export class AuthService {
  private readonly db: Queryable;
  private readonly otpProvider: OtpProvider;

  constructor(dependencies: AuthServiceDependencies) {
    this.db = dependencies.db;
    this.otpProvider = dependencies.otpProvider;
  }

  /** يبني المستودعات على اتصال محدّد (Pool أو Client داخل معاملة). */
  private repos(db: Queryable): AuthRepos {
    return {
      accounts: new AccountRepository(db),
      sessions: new SessionRepository(db),
      otp: new OtpRepository(db),
    };
  }

  /** ينفّذ ضمن معاملة واحدة إن كان الاتصال Pool؛ وإلا ينفّذ مباشرة. */
  /**
   * ينفّذ ضمن معاملة واحدة إن كان الاتصال Pool؛ وإلا ينفّذ مباشرة.
   *
   * تُحجز لـ**النواة الذرّية فقط** (إنشاء الحساب، إنشاء الجلسة، إبطال
   * الجلسات مع التجميد). أما ما يجب أن يبقى بعد الفشل فيُكتب عبر
   * `durable` أدناه ولا يمرّ من هنا أبداً.
   */
  private async inTransaction<T>(operation: (db: Queryable) => Promise<T>): Promise<T> {
    if (isPool(this.db)) {
      return withTransaction(this.db as Pool, operation);
    }
    return operation(this.db);
  }

  /**
   * كتابة أمنية **دائمة** — خارج أي معاملة للعملية.
   *
   * لماذا هذا الفصل ضروري (خطأ حقيقي سبّبه الخلط):
   * §11.4 يشترط «كل المحاولات تسجل» و§11.5 يشترط «طلبات OTP تسجل».
   * فلو كُتبت هذه السجلات **داخل** معاملة العملية، لرجعتها الـROLLBACK
   * في اللحظة نفسها التي يجب أن تُحفظ فيها — لأن الفشل هو ما يرمي
   * الاستثناء. النتيجة: محاولات الدخول وOTP الفاشلة بلا أثر، أي مسار
   * تدقيق أمني مثقوب.
   *
   * لذلك: كل ما هو «سجل يجب أن يبقى» يُكتب هنا مباشرةً على `this.db`
   * (commit تلقائي لكل عبارة)، ثم تُرمى الاستثناءات بعده.
   *
   * ملاحظة عن الجمود: الكتابة تتم على نفس الـPool، فلا يوجد اتصال ثانٍ
   * ينتظر قفلاً تحتفظ به معاملة أخرى — وهذا ما كان سيحوّل الإصلاح إلى
   * جمود (deadlock) عند قيود المفاتيح الأجنبية على `audit_logs`.
   *
   * أي فشل في الكتابة **يُرمى ولا يُبتلع**: لا تمرّ بصمت.
   */
  private async durable<T>(operation: (repos: AuthRepos, db: Queryable) => Promise<T>): Promise<T> {
    return operation(this.repos(this.db), this.db);
  }

  // ── §11.5: طلب الرمز السري ───────────────────────────────────────

  /**
   * طلب رمز تسجيل (§11.1): يقابل رقم الباج + الهاتف المسجَّل.
   *
   * «لا يكشف النظام أي معلومة عن الحقل الصحيح/الخاطئ» — لذلك تُعاد
   * النتيجة نفسها في الحالتين: يُصدر الرمز عند المطابقة أو لا يحدث شيء
   * يُكشف. الاستجابة `{ accepted: true }` دائماً.
   *
   * يُبطل أي رمز حيّ سابق (§11.5: «OTP جديد يبطل السابق»).
   */
  async requestRegistrationOtp(request: RegistrationOtpRequest): Promise<OtpRequestAccepted> {
    const { badgeNumber, phone } = request;

    // خارج المعاملة: «طلبات OTP تسجل» (§11.5) يجب أن يبقى مسجَّلاً
    // حتى لو أُلغي الطلب لاحقاً أو فشلت خطوة لاحقة.
    return this.durable(async ({ accounts, otp }, db) => {
      await this.assertOtpQuota(db, otp, phone, 'registration');

      const employee = await accounts.findEmployeeByBadgeAndPhone(badgeNumber, phone);
      if (employee === null) {
        // لا حساب مطابق: نسجّل الطلب كـ«غير مطابق» ولا نكشف شيئاً.
        await recordAuthEvent(db, {
          eventKind: 'otp_event',
          details: { purpose: 'registration', outcome: 'no_match' },
        });
        return { accepted: true } as const;
      }

      const existing = await accounts.findByEmployeeId(employee.id);
      if (existing !== null) {
        // الحساب موجود أصلاً: لا يُكشف ذلك، ولا يُعاد إصدار رمز.
        await recordAuthEvent(db, {
          eventKind: 'otp_event',
          targetUserId: existing.id,
          details: { purpose: 'registration', outcome: 'already_registered' },
        });
        return { accepted: true } as const;
      }

      await otp.invalidateActiveForPhone(phone, 'registration');
      await this.issueOtp(otp, db, {
        userId: null,
        employeeId: employee.id,
        phone,
        purpose: 'registration',
      });
      return { accepted: true } as const;
    });
  }

  /**
   * طلب رمز استعادة (§11.6): يقابل رقم الهاتف وحده.
   * محايد تماماً — لا يكشف وجود الحساب من عدمه (§11.5).
   */
  async requestRecoveryOtp(phone: string): Promise<OtpRequestAccepted> {
    // خارج المعاملة — نفس سبب التسجيل: (§11.5) «لا يكشف النظام وجود
    // الحساب» و«طلبات OTP تسجل»، كلاهما يجب أن يصمدا بعد أي فشل لاحق.
    return this.durable(async ({ accounts, otp }, db) => {
      await this.assertOtpQuota(db, otp, phone, 'recovery');

      const account = await accounts.findByEmployeePhone(phone);
      if (account === null || account.status !== 'active') {
        await recordAuthEvent(db, {
          eventKind: 'otp_event',
          details: { purpose: 'recovery', outcome: 'no_match' },
        });
        return { accepted: true } as const;
      }

      await otp.invalidateActiveForPhone(phone, 'recovery');
      await this.issueOtp(otp, db, {
        userId: account.id,
        employeeId: account.employeeId,
        phone,
        purpose: 'recovery',
      });
      return { accepted: true } as const;
    });
  }

  /**
   * يفرض حد الطلبات (§11.5): 5 طلبات لكل هاتف خلال 15 دقيقة، والطلب
   * السادس يُسجَّل حظراً لمدة 15 دقيقة. يرمي `OtpRateLimitedError` عند
   * وجود حظر ساري أو عند تجاوز الحد.
   */
  private async assertOtpQuota(
    db: Queryable,
    otp: OtpRepository,
    phone: string,
    purpose: OtpPurpose,
  ): Promise<void> {
    const activeBlock = await otp.findActiveBlock(phone);
    if (activeBlock !== null) {
      await recordAuthEvent(db, {
        eventKind: 'otp_event',
        details: { purpose, outcome: 'rate_limited' },
      });
      throw new OtpRateLimitedError(activeBlock);
    }

    const windowStart = isoFromNow(-OTP_RATE_WINDOW_MINUTES * 60 * 1000);
    const recent = await otp.countRequestsSince(phone, windowStart);
    if (recent >= OTP_MAX_REQUESTS) {
      const until = isoFromNow(OTP_RATE_BLOCK_MINUTES * 60 * 1000);
      await otp.blockRequests(phone, until);
      await recordAuthEvent(db, {
        eventKind: 'otp_event',
        details: { purpose, outcome: 'rate_limited', blockUntil: until },
      });
      throw new OtpRateLimitedError(until);
    }
  }

  /** يصدر رمزاً سرياً: يحفظ التجزئة، يبطل السابق، ثم يسلّم للمزوّد. */
  private async issueOtp(
    otp: OtpRepository,
    db: Queryable,
    target: { userId: string | null; employeeId: string | null; phone: string; purpose: OtpPurpose },
  ): Promise<void> {
    const code = generateOtpCode();
    await otp.insert({
      userId: target.userId,
      employeeId: target.employeeId,
      phone: target.phone,
      purpose: target.purpose,
      codeHash: hashToken(code),
      expiresAt: isoFromNow(OTP_TTL_MINUTES * 60 * 1000),
    });
    await this.otpProvider.send({ phone: target.phone, code, purpose: target.purpose });
    await recordAuthEvent(db, {
      eventKind: 'otp_event',
      actorUserId: target.userId,
      targetUserId: target.userId,
      details: { purpose: target.purpose, outcome: 'issued' },
    });
  }

  // ── §11.5: التحقق من الرمز السري ─────────────────────────────────

  /**
   * يتحقق من رمز OTP مقابل سجله الحيّ.
   *
   * القواعد المطبَّقة هنا:
   * - **استخدام واحد**: عند النجاح **لا يُستهلك هنا** — بل داخل معاملة
   *   العملية نفسها (استهلاك + تفعيل الحساب ذرّياً). استهلاكه هنا
   *   على اتصال منفصل كان سيجعل الاستهلاك ينجح ثم يرجع إن فشلت العملية.
   * - **انتهاء الصلاحية** (5 دقائق): يُبطَل ولا يُقبل.
   * - **خمس محاولات خاطئة**: الخامسة تُبطل الرمز وتلزم طلباً جديداً.
   * - الرسالة واحدة في كل الفشل حتى لا يُكشف أيّها (§11.5).
   *
   * **كل ما يجب أن يبقى** (عدّاد المحاولات، الإبطال، حدث التدقيق) يُكتب
   * عبر `durable` أي **خارج معاملة العملية**، ثم يُرمى الاستثناء بعده.
   * لو كُتب داخل معاملة العملية لأعاده الـROLLBACK فوراً — لأن الفشل هو
   * ما يرميه — فتفقد المحاولات الخاطئة أثرها contrary لقاعدة §11.5.
   */
  private async verifyOtpCode(
    phone: string,
    purpose: OtpPurpose,
    code: string,
  ): Promise<OtpRecord> {
    const record = await this.durable(async ({ otp }, db) => {
      const found = await otp.findActive(phone, purpose);
      if (found === null) {
        throw new OtpInvalidError();
      }

      if (found.expiresAt <= new Date().toISOString()) {
        await otp.invalidate(found.id);
        throw new OtpInvalidError();
      }

      // الشفرة تُقارن بالتجزئة بمقارنة ثابتة الزمن (لا مقارنة نصية).
      if (!safeEquals(found.codeHash, hashToken(code))) {
        const updated = await otp.incrementAttempts(found.id);
        const attempts = updated?.attempts ?? found.attempts + 1;
        if (attempts >= OTP_MAX_FAILED_ATTEMPTS) {
          // §11.5: خمس محاولات خاطئة تبطل الرمز وتتطلب إصداراً جديداً.
          await otp.invalidate(found.id);
        }
        await recordAuthEvent(db, {
          eventKind: 'otp_event',
          actorUserId: found.userId,
          targetUserId: found.userId,
          details: { purpose, outcome: 'invalid_attempt' },
        });
        throw new OtpInvalidError();
      }

      return found;
    });
    return record;
  }

  // ── §11.1: إنشاء الحساب لأول مرة ────────────────────────────────

  /**
   * يتحقق من رمز التسجيل ثم ينشئ الرمز السري ويُفعّل الحساب (§11.1).
   *
   * ملاحظة: التفعيل **لا يُنشئ جلسة**. الخطة تنهي تدفّق التسجيل بـ«تفعيل
   * الحساب» ولا تذكر دخولاً تلقائياً، فلا يُضاف سلوك غير موثّق.
   */
  async verifyRegistrationOtp(request: VerifyOtpRequest): Promise<AccountSummary> {
    const { phone, code, secret } = request;

    // 1) التحقق من الرمز — **خارج المعاملة** حتى تبقى محاولات الخطأ
    //    وسجلّها في التدقيق (§11.5) لو فشل التحقق.
    const record = await this.verifyOtpCode(phone, 'registration', code);
    if (record.employeeId === null) {
      throw new OtpInvalidError();
    }

    // 2) هل الحساب موجود مسبقاً؟ — يُسجَّل تدقيقاً **دائماً** ثم يُرفض.
    const existing = await this.durable(async ({ accounts }, db) => {
      const found = await accounts.findByEmployeeId(record.employeeId as string);
      if (found !== null) {
        await recordAuthEvent(db, {
          eventKind: 'otp_event',
          details: { purpose: 'registration', outcome: 'already_registered' },
        });
      }
      return found;
    });
    if (existing !== null) {
      // حساب موجود: لا يُكشف ذلك ولا يُعاد الإنشاء.
      throw new OtpInvalidError();
    }

    // 3) استهلاك الرمز + إنشاء الحساب — ذرّياً في معاملة واحدة.
    return this.inTransaction(async (db) => {
      const { accounts, otp } = this.repos(db);

      // استخدام واحد (§11.5): الاستهلاك مع التفعيل في نفس المعاملة،
      // فلا يُستهلك رمز ولا يُفعَّل حساب إن فشل أحدهما.
      await otp.consume(record.id);

      // username = رقم الباج (مفتاح الدخول الأول في §11.2)،
      // display_name = اسم الموظف، والحالة `active` عند التفعيل.
      const account = await this.createAccountForEmployee(
        accounts,
        record.employeeId as string,
        secret,
      );

      await recordAuthEvent(db, {
        eventKind: 'otp_event',
        actorUserId: account.id,
        actorEmployeeId: account.employeeId,
        targetUserId: account.id,
        details: { purpose: 'registration', outcome: 'activated' },
      });
      return toSummary(account);
    });
  }

  /** ينشئ حساباً مفعّلاً لموظف برقم باج واسم من سجله. */
  private async createAccountForEmployee(
    accounts: AccountRepository,
    employeeId: string,
    secret: string,
    options: { mustChangeSecret?: boolean } = {},
  ): Promise<AccountRecord> {
    const identity = await this.employeeIdentityFor(employeeId);
    if (identity === null) {
      throw new OtpInvalidError();
    }
    return accounts.createActive({
      username: identity.badgeNumber,
      displayName: identity.name,
      employeeId,
      secret: this.encrypt(secret),
      mustChangeSecret: options.mustChangeSecret ?? false,
    });
  }

  /** يقرأ رقم الباج واسم الموظف — أساس `username` و`display_name`. */
  private async employeeIdentityFor(
    employeeId: string,
  ): Promise<{ badgeNumber: string; name: string } | null> {
    const result = await this.db.query<{ badgeNumber: string | null; name: string }>(
      `SELECT badge_number AS "badgeNumber", name FROM employees WHERE id = $1`,
      [employeeId],
    );
    const row = result.rows[0];
    if (row === undefined || row.badgeNumber === null) {
      return null;
    }
    return { badgeNumber: row.badgeNumber, name: row.name };
  }

  // ── §11.6: الاستعادة ─────────────────────────────────────────────

  /**
   * تدفّق الاستعادة: رقم الهاتف ← OTP ← رمز جديد (§11.6).
   *
   * «لا يحتاج المستخدم إلى الرمز القديم للاستعادة» — لذلك لا يُطلب الرمز
   * القديم إطلاقاً، ويُستبدل الرمز مباشرةً ويُبطَل كل الجلسات القائمة
   * (كتغيير بيانات اعتماد: استمرار جلسة على سرّ لم يعد صحيحاً يخلّ
   * بالمعنى الأمني نفسِه الذي أبطلتْه §11.7 في إعادة الضبط الإداري).
   */
  async verifyRecoveryOtp(request: VerifyOtpRequest): Promise<AccountSummary> {
    const { phone, code, secret } = request;

    // التحقق من الرمز خارج المعاملة — تبقى محاولات الخطأ مسجّلة (§11.5).
    const record = await this.verifyOtpCode(phone, 'recovery', code);
    if (record.userId === null) {
      throw new OtpInvalidError();
    }

    // استبدال الرمز + إبطال الجلسات — ذرّياً في معاملة واحدة.
    return this.inTransaction(async (db) => {
      const { accounts, sessions, otp } = this.repos(db);

      await otp.consume(record.id);

      const account = await accounts.setSecret(record.userId as string, this.encrypt(secret), {
        mustChangeSecret: false,
      });
      if (account === null) {
        throw new OtpInvalidError();
      }

      // تغيير الاعتماد يُبطل الجلسات القائمة.
      await sessions.revokeAllForUser(account.id, SESSION_REVOKE_REASONS.ownSecretChange);

      await recordAuthEvent(db, {
        eventKind: 'otp_event',
        actorUserId: account.id,
        actorEmployeeId: account.employeeId,
        targetUserId: account.id,
        details: { purpose: 'recovery', outcome: 'secret_replaced' },
      });
      return toSummary(account);
    });
  }

  // ── §11.2 و§11.4: الدخول المعتاد ─────────────────────────────────

  /**
   * الدخول المعتاد (§11.2): برقم الباج/الرقم الوظيفي **أو** رقم الهاتف،
   * مع الرمز السري. لا يُطلب OTP في كل دخول (§11.2).
   *
   * «لا يكشف النظام هل الخطأ في الرقم أم الرمز» (§11.4): الحساب غير
   * الموجود والرمز الخاطئ يعطيان الخطأ نفسه `InvalidCredentialsError`
   * بالرسالة نفسها، فلا يُستدلّ على وجود الحساب.
   *
   * تسلسل المحاولات (§11.4): 1–3 بلا تأخير، الرابعة تأخير 5 ثوانٍ،
   * الخامسة تجميد 15 دقيقة **مع إبطال كل الجلسات القائمة** (§11.3).
   */
  async login(request: LoginRequest): Promise<LoginResult> {
    const { identifier, secret } = request;

    // ── مرحلة 1: الفحص والتسجيل — خارج المعاملة (بلا قفل مطوّل) ────────
    // كل ما هنا «يجب أن يبقى» حتى عند الرمي: عدّاد المحاولات، أحداث
    // الدخول الفاشل، والتجميد. رجعته الـROLLBACK كان يمحوه (§11.4).
    const account = await this.durable(async ({ accounts }, db) => {
      const found = await this.findAccountByIdentifier(accounts, identifier);
      if (found === null) {
        // حساب غير موجود: نفس رسالة الرمز الخاطئ — لا تسريب لوجوده،
        // ومع ذلك تُسجَّل المحاولة (§11.4: «كل المحاولات تسجل»).
        await recordAuthEvent(db, {
          eventKind: 'login',
          details: { outcome: 'invalid_credentials' },
        });
        throw new InvalidCredentialsError();
      }
      return this.assertLoginAllowed(found);
    });

    if (!safeEquals(this.readStoredSecret(account), secret)) {
      return this.handleFailedLogin(account);
    }

    // ── مرحلة 2: دخول ناجح — ذرّي في معاملة واحدة ──────────────────────
    return this.inTransaction(async (db) => {
      const { accounts, sessions } = this.repos(db);

      // دخول ناجح: يُصفَّر العدّاد وتُسجَّل الجلسة.
      await accounts.resetFailedAttempts(account.id);
      await accounts.touchLastLogin(account.id);
      const sessionToken = generateSessionToken();
      const session = await sessions.create(account.id, hashToken(sessionToken));

      await recordAuthEvent(db, {
        eventKind: 'login',
        actorUserId: account.id,
        actorEmployeeId: account.employeeId,
        targetUserId: account.id,
        entityKind: 'user_account',
        entityId: account.id,
        details: { outcome: 'success', sessionId: session.id },
      });

      return {
        account: toSummary(account),
        sessionToken,
        sessionId: session.id,
        mustChangeSecret: account.mustChangeSecret,
      };
    });
  }

  /** يجد الحساب برقم الباج أولاً ثم برقم الهاتف (§11.2 يقبل كليهما). */
  private async findAccountByIdentifier(
    accounts: AccountRepository,
    identifier: string,
  ): Promise<AccountRecord | null> {
    const byBadge = await accounts.findByUsername(identifier);
    if (byBadge !== null) {
      return byBadge;
    }
    return accounts.findByEmployeePhone(identifier);
  }

  /**
   * يتحقق من سماح حالة الحساب بالدخول (§11.3): غير المفعّل والمجمّد
   * والمحظور كلها تمنع الدخول. التجميد المؤقت الذي انتهت مدته يعود
   * تلقائياً إلى نشط.
   */
  private async assertLoginAllowed(account: AccountRecord): Promise<AccountRecord> {
    if (account.status === 'inactive') {
      throw new AuthenticationRequiredError('الحساب غير مفعّل.');
    }
    if (account.status === 'blocked') {
      await this.durable(async (_repos, db) => {
        await recordAuthEvent(db, {
          eventKind: 'login',
          targetUserId: account.id,
          details: { outcome: 'blocked' },
        });
      });
      throw new AccountBlockedError();
    }
    if (account.status === 'frozen') {
      // تجميد مؤقت انتهت مدته ⇒ يعود الحساب نشطاً (§11.4: 15 دقيقة).
      const until = account.frozenUntil;
      if (until !== null && until <= new Date().toISOString()) {
        const restored = await this.durable(async ({ accounts }) =>
          accounts.unfreeze(account.id),
        );
        if (restored !== null) {
          return restored;
        }
      }
      await this.durable(async (_repos, db) => {
        await recordAuthEvent(db, {
          eventKind: 'login',
          targetUserId: account.id,
          details: { outcome: 'frozen' },
        });
      });
      throw new AccountFrozenError(until ?? '');
    }
    return account;
  }

  /**
   * يعالج محاولة دخول فاشلة (§11.4): يزيد العدّاد، ويُجمّد عند الخامسة
   * مع إبطال كل الجلسات (§11.3).
   *
   * **كل الكتابات هنا دائمة** (عبر `durable`) — أي خارج معاملة العملية،
   * لأن الاستثناء المرمي هو ما كان يعيدها قبلاً. بعد التسجيل:
   * - المحاولة الرابعة: تأخير 5 ثوانٍ **خارج أي قفل** (§11.4).
   * - ثم يُرمى الخطأ نفسه لكل الحالات، فلا يُميّز في الاستجابة (§11.4).
   */
  private async handleFailedLogin(account: AccountRecord): Promise<never> {
    const { attempts, until } = await this.durable(async ({ accounts, sessions }, db) => {
      // 1) عدّاد المحاولات — دائم (§11.4).
      const updated = await accounts.incrementFailedAttempts(account.id);
      const count = updated?.failedLoginAttempts ?? account.failedLoginAttempts + 1;

      // 2) حدث المحاولة الفاشلة — دائم، يُكتب قبل أي رمي (لا يبتلع فشلَه).
      await recordAuthEvent(db, {
        eventKind: 'login',
        targetUserId: account.id,
        details: { outcome: 'invalid_credentials', attempts: count },
      });

      if (count < LOGIN_FREEZE_AT_ATTEMPT) {
        return { attempts: count, until: null as string | null };
      }

      // 3) المحاولة الخامسة: تجميد 15 دقيقة **و** إبطال كل الجلسات في
      //    معاملة واحدة — 둘 لا ينفصلان: حساب مجمّد وبه جلسات حيّة
      //    يناقض §11.3 («تبطل الجلسات النشطة للحساب فورًا»).
      const frozenUntil = isoFromNow(LOGIN_FREEZE_MINUTES * 60 * 1000);
      await this.inTransaction(async (txDb) => {
        const repos = this.repos(txDb);
        await repos.accounts.freeze(account.id, frozenUntil);
        await repos.sessions.revokeAllForUser(account.id, SESSION_REVOKE_REASONS.freeze);
      });
      return { attempts: count, until: frozenUntil };
    });

    // 4) حدث التجميد — دائم بعد نجاح المعاملة أعلاه.
    if (until !== null) {
      await this.durable(async (_repos, db) => {
        await recordAuthEvent(db, {
          eventKind: 'login',
          targetUserId: account.id,
          details: { outcome: 'frozen', until },
        });
      });
    }

    // 5) المحاولة الرابعة: تأخير 5 ثوانٍ — خارج أي قفل (§11.4).
    if (attempts === LOGIN_DELAY_AT_ATTEMPT) {
      await sleep(LOGIN_DELAY_MS);
    }

    // 6) خطأ واحد لكل الحالات: لا يميّز الرقم عن الرمز (§11.4).
    throw new InvalidCredentialsError();
  }

  // ── §11.9: الجلسات ───────────────────────────────────────────────

  /**
   * يحلّ رفعة جلسة إلى هوية (§11.9)، ويطبّق كل قيود صلاحيتها:
   * - الرمز مجزّأ في القاعدة ولا يُقبل إلا ما يطابق تجزئته.
   * - مهلة خمول 30 دقيقة: انقضاؤها يُبطل الجلسة ولا يجدّدها.
   * - `must_change_secret` يمنع المرور: يُطلب تغيير الرمز المؤقت عند
   *   أول دخول (§11.7) قبل أي وصول لموارد أخرى.
   * - التجميد/الحظر يُبطل الجلسة فوراً حتى لو كانت قائمة (§11.3).
   * - كل طلب ناجح يعيد ضبط مؤقّت الخمول (§11.9).
   */
  async resolveSession(sessionToken: string): Promise<AuthenticatedIdentity> {
    const { accounts, sessions } = this.repos(this.db);
    const session = await sessions.findByTokenHash(hashToken(sessionToken));
    if (session === null || session.revokedAt !== null) {
      throw new AuthenticationRequiredError();
    }

    const idleLimit = isoFromNow(-SESSION_IDLE_MS);
    if (session.lastActivityAt <= idleLimit) {
      await sessions.revokeById(session.id, SESSION_REVOKE_REASONS.idle);
      throw new AuthenticationRequiredError();
    }

    const account = await accounts.findById(session.userId);
    if (account === null) {
      throw new AuthenticationRequiredError();
    }

    // الحساب المجمّد/المحظور لا تُقبل جلسته القائمة (§11.3).
    if (account.status === 'frozen' || account.status === 'blocked') {
      await sessions.revokeAllForUser(
        account.id,
        account.status === 'frozen' ? SESSION_REVOKE_REASONS.freeze : SESSION_REVOKE_REASONS.block,
      );
      throw new AuthenticationRequiredError();
    }

    // كل نشاط يعيد ضبط المؤقّت (§11.9).
    await sessions.touch(session.id);

    // ملاحظة: `must_change_secret` **لا** يُرفع هنا. §11.7 يفرض تغيير
    // الرمز المؤقت «عند أول دخول»، إذن مسار تغيير الرمز نفسه
    // (`POST /api/auth/secret`) يجب أن يبقى مفتوحاً، وإلا صار الحساب
    // محبوساً على رمز لا يستطيع تبديله. الفرض يكون في طبقة الموارد
    // عبر `requireChangedSecret` — لا في طبقة الهوية.

    return {
      userId: account.id,
      employeeId: account.employeeId,
      sessionId: session.id,
      username: account.username,
      displayName: account.displayName,
      role: account.role,
      mustChangeSecret: account.mustChangeSecret,
    };
  }

  /** تسجيل الخروج: يهدم الجلسة **الحالية فقط** (§11.9). */
  async logout(identity: AuthenticatedIdentity): Promise<void> {
    const { sessions } = this.repos(this.db);
    await sessions.revokeById(identity.sessionId, SESSION_REVOKE_REASONS.logout);
    await recordAuthEvent(this.db, {
      eventKind: 'logout',
      actorUserId: identity.userId,
      actorEmployeeId: identity.employeeId,
      targetUserId: identity.userId,
      details: { sessionId: identity.sessionId },
    });
  }

  // ── §11.7: إعادة الضبط الإدارية ──────────────────────────────────

  /**
   * إعادة ضبط إدارية (§11.7): يُبطل الرمز القديم والجلسات، ويُنشأ رمز
   * مؤقت جديد يُعرض للمسؤولين، ويُلزم تغييره عند أول دخول.
   *
   * ملاحظة نطاق: هذا المسار يتطلّب **جلسة صالحة فقط**. فحص «من يحق له
   * إعادة الضبط» عملية إدارية ضمن Phase 12 (RBAC) — لا يُخمَّن هنا.
   */
  async adminResetAccountSecret(
    actor: ActorRef,
    targetUserId: string,
  ): Promise<{ account: AccountSummary; temporarySecret: string }> {
    return this.inTransaction(async (db) => {
      const { accounts, sessions } = this.repos(db);

      const target = await accounts.findById(targetUserId);
      if (target === null) {
        throw new AccountNotFoundError(targetUserId);
      }

      const temporarySecret = generateSecret();
      const updated = await accounts.setSecret(target.id, this.encrypt(temporarySecret), {
        mustChangeSecret: true,
      });
      if (updated === null) {
        throw new AccountNotFoundError(targetUserId);
      }

      // الرمز القديم يبطل مع كل الجلسات القائمة (§11.7).
      await sessions.revokeAllForUser(target.id, SESSION_REVOKE_REASONS.adminReset);

      await recordAuthEvent(db, {
        eventKind: 'update',
        actorUserId: actor.userId,
        actorEmployeeId: actor.employeeId,
        targetUserId: target.id,
        details: { action: 'admin_secret_reset' },
      });

      return { account: toSummary(updated), temporarySecret };
    });
  }

  /**
   * تغيير المستخدم رمزه السري بنفسه — الخطوة التي يطلبها
   * `must_change_secret` عند أول دخول (§11.7). يتحقق من الرمز الحالي
   * قبل الاستبدال.
   */
  async changeOwnSecret(
    identity: AuthenticatedIdentity,
    request: ChangeOwnSecretRequest,
  ): Promise<AccountSummary> {
    return this.inTransaction(async (db) => {
      const { accounts, sessions } = this.repos(db);
      const account = await accounts.findById(identity.userId);
      if (account === null) {
        throw new AuthenticationRequiredError();
      }

      if (!safeEquals(this.readStoredSecret(account), request.currentSecret)) {
        throw new InvalidCredentialsError();
      }

      const updated = await accounts.setSecret(account.id, this.encrypt(request.newSecret), {
        mustChangeSecret: false,
      });
      if (updated === null) {
        throw new AccountIntegrityError();
      }

      await sessions.revokeAllForUser(account.id, SESSION_REVOKE_REASONS.ownSecretChange);
      await recordAuthEvent(db, {
        eventKind: 'update',
        actorUserId: account.id,
        actorEmployeeId: account.employeeId,
        targetUserId: account.id,
        details: { action: 'own_secret_change' },
      });
      return toSummary(updated);
    });
  }

  // ── §11.8: رؤية الرمز السري للمسؤولين (الاستثناء المعتمد) ────────

  /**
   * يكشف الرمز السري الحالي لحساب — الاستثناء الوظيفي المعتمد في §11.8
   * الذي يتيح لمسؤولي السقاية رؤية الرمز السري للمنتسب.
   *
   * الضوابط المطبَّقة:
   * - **`reversible encryption`** لا hash: يُخزَّن مشفّراً ويُفكّ
   *   بـAES-256-GCM بمفتاح منفصل عن قاعدة البيانات.
   * - **كل عملية كشف تسجّل Audit Log** (`admin_secret_reveal`) بفاعلها.
   * - **فشل المفتاح ⇒ إعادة الضبط**: `decryptSecret` يرمي، ونحوّله إلى
   *   `SecretUnavailableError`؛ لا تجاوز للتشفير ولا قيمة مهترئة.
   *
   * ملاحظة نطاق: فحص صلاحية الفاعل Phase 12؛ هنا يتطلّب جلسة صالحة فقط.
   */
  async revealAccountSecret(
    actor: ActorRef,
    targetUserId: string,
  ): Promise<{ account: AccountSummary; secret: string }> {
    return this.inTransaction(async (db) => {
      const { accounts } = this.repos(db);

      const target = await accounts.findById(targetUserId);
      if (target === null) {
        throw new AccountNotFoundError(targetUserId);
      }

      let secret: string;
      try {
        secret = this.readStoredSecret(target);
      } catch (error) {
        TechnicalLogger.error('failed to decrypt account secret — admin reset required', {
          source: 'auth',
          data: {
            targetUserId,
            reason: error instanceof Error ? error.message : String(error),
          },
        });
        // لا تجاوز للتشفير: الطريق الوحيد هو إعادة الضبط الإداري.
        throw new SecretUnavailableError();
      }

      await recordAuthEvent(db, {
        eventKind: 'admin_secret_reveal',
        actorUserId: actor.userId,
        actorEmployeeId: actor.employeeId,
        targetUserId: target.id,
        entityKind: 'user_account',
        entityId: target.id,
        details: { outcome: 'revealed' },
      });

      return { account: toSummary(target), secret };
    });
  }

  // ── أدوات التشفير الداخلية ───────────────────────────────────────

  /** يشفّر رمزاً سرياً قبل حفظه (نفس خزنة §11.8). */
  private encrypt(secret: string): EncryptedSecretFields {
    const encrypted = encryptSecret(secret);
    return {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      authTag: encrypted.authTag,
      keyId: encrypted.keyId,
    };
  }

  /**
   * يفكّ الرمز السري المخزَّن للمقارنة. يرمي `AccountIntegrityError`
   * إن كان الحقل ناقصاً، و`SecretUnavailableError` إن فشل المفتاح.
   */
  private readStoredSecret(account: AccountRecord): string {
    if (
      account.secretCiphertext === null ||
      account.secretIv === null ||
      account.secretAuthTag === null
    ) {
      throw new AccountIntegrityError();
    }
    try {
      return decryptSecret({
        ciphertext: account.secretCiphertext,
        iv: account.secretIv,
        authTag: account.secretAuthTag,
      });
    } catch {
      throw new SecretUnavailableError();
    }
  }
}
