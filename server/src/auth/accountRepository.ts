/**
 * مستودع الحسابات (Phase 11) — `users` وحالاتها ورموزها السرية.
 *
 * ملاحظات تصميم:
 * - علاقة واحدة بلا تكرار: الدخول برقم الباج (= `username`) أو بالهاتف،
 *   والهاتف لا يُنسخ إلى `users` بل يُقرأ عبر `employees.phone` —
 *   مصدر واحد للهوية كما في §7.2 (الهاتف من حقول الموظف).
 * - لا حذف ولا تعديل عريض هنا: التفعيل، التجميد، عدّاد المحاولات،
 *   وتغيير الرمز — كلها تعديلات أعمدة محددة.
 * - كل استعلام مجزّأ بمعاملات (parameterized) بلا دمج نص.
 */
import type { Queryable } from '../database';
import type { AccountRecord, AccountStatus, SessionRevokeReason } from './authTypes';

/** أعمدة الحساب كما تُقرأ من القاعدة (aliased لتطابق السجل مباشرة). */
const ACCOUNT_COLUMNS = `
  id, employee_id AS "employeeId", username, display_name AS "displayName", role,
  status, secret_ciphertext AS "secretCiphertext", secret_iv AS "secretIv",
  secret_auth_tag AS "secretAuthTag", secret_key_id AS "secretKeyId",
  must_change_secret AS "mustChangeSecret",
  failed_login_attempts AS "failedLoginAttempts", frozen_until AS "frozenUntil",
  activated_at AS "activatedAt", last_login_at AS "lastLoginAt",
  created_at AS "createdAt"
`;

/**
 * نفس الأعمدة مُسبوقةً بالجدول `u`.
 *
 * لازمة في استعلام واحد فقط: `findByEmployeePhone` ينضمّ إلى `employees`،
 * فيصبح `id` و`created_at` و`updated_at` مجهولَ الجدول ويرفض PostgreSQL
 * الاستعلام («column reference "id" is ambiguous»). نسخ القائمة بادئة
 * أوضح من إعادة كتابتها يدوياً لكل عمود.
 */
const ACCOUNT_COLUMNS_JOINED = `
  u.id, u.employee_id AS "employeeId", u.username, u.display_name AS "displayName", u.role,
  u.status, u.secret_ciphertext AS "secretCiphertext", u.secret_iv AS "secretIv",
  u.secret_auth_tag AS "secretAuthTag", u.secret_key_id AS "secretKeyId",
  u.must_change_secret AS "mustChangeSecret",
  u.failed_login_attempts AS "failedLoginAttempts", u.frozen_until AS "frozenUntil",
  u.activated_at AS "activatedAt", u.last_login_at AS "lastLoginAt",
  u.created_at AS "createdAt"
`;

/** صف خام كما يعيده `pg` قبل التحويل. */
interface AccountRow {
  id: string;
  employeeId: string | null;
  username: string;
  displayName: string;
  role: string;
  status: AccountStatus;
  secretCiphertext: string | null;
  secretIv: string | null;
  secretAuthTag: string | null;
  secretKeyId: string | null;
  mustChangeSecret: boolean;
  failedLoginAttempts: number;
  frozenUntil: string | null;
  activatedAt: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

function toRecord(row: AccountRow): AccountRecord {
  return {
    id: row.id,
    employeeId: row.employeeId,
    username: row.username,
    displayName: row.displayName,
    role: row.role,
    status: row.status,
    secretCiphertext: row.secretCiphertext,
    secretIv: row.secretIv,
    secretAuthTag: row.secretAuthTag,
    secretKeyId: row.secretKeyId,
    mustChangeSecret: row.mustChangeSecret,
    failedLoginAttempts: row.failedLoginAttempts,
    frozenUntil: row.frozenUntil,
    activatedAt: row.activatedAt,
    lastLoginAt: row.lastLoginAt,
    createdAt: row.createdAt,
  };
}

/** القيم المشفّرة للرمز السري كما تُخزَّن. */
export interface EncryptedSecretFields {
  ciphertext: string;
  iv: string;
  authTag: string;
  keyId: string;
}

/** إدخال إنشاء حساب مفعّل. */
export interface CreateAccountInput {
  /** رقم الباج — هو نفسه `username` (مفتاح الدخول الأول في §11.2). */
  username: string;
  displayName: string;
  employeeId: string;
  secret: EncryptedSecretFields;
  /** مطلوب تغيير الرمز عند أول دخول — إعادة الضبط الإداري (§11.7). */
  mustChangeSecret?: boolean;
}

/** مستودع الحسابات: قراءة الحالة وإدارة الرمز السري ومحاولات الدخول. */
export class AccountRepository {
  constructor(private readonly db: Queryable) {}

  async findById(id: string): Promise<AccountRecord | null> {
    const result = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM users WHERE id = $1`,
      [id],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** الدخول برقم الباج/الرقم الوظيفي (§11.2). */
  async findByUsername(username: string): Promise<AccountRecord | null> {
    const result = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM users WHERE username = $1`,
      [username],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /**
   * الدخول برقم الهاتف (§11.2) عبر الموظف المرتبط بالحساب.
   * الهاتف عمود في `employees` لا في `users`، فالبحث يمرّ بالعلاقة.
   * عند تعدّد الموظفين بالهاتف نفسه يُعتمد أول نتيجة بترتيب حتمي.
   */
  async findByEmployeePhone(phone: string): Promise<AccountRecord | null> {
    const result = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS_JOINED} FROM users u
       JOIN employees e ON e.id = u.employee_id
       WHERE e.phone = $1
       ORDER BY u.created_at ASC, u.id ASC
       LIMIT 1`,
      [phone],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** خطوة الاستعلام الأولى في التسجيل (§11.1): رقم الباج + الهاتف المسجل. */
  async findEmployeeByBadgeAndPhone(
    badgeNumber: string,
    phone: string,
  ): Promise<{ id: string; name: string } | null> {
    const result = await this.db.query<{ id: string; name: string }>(
      `SELECT id, name FROM employees
       WHERE badge_number = $1 AND phone = $2 AND status = 'active'
       LIMIT 1`,
      [badgeNumber, phone],
    );
    return result.rows[0] ?? null;
  }

  /** هل لهذا الموظف حساب بالفعل؟ (يمنع إعادة التسجيل دون كشف ذلك) */
  async findByEmployeeId(employeeId: string): Promise<AccountRecord | null> {
    const result = await this.db.query<AccountRow>(
      `SELECT ${ACCOUNT_COLUMNS} FROM users WHERE employee_id = $1`,
      [employeeId],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /**
   * ينشئ حساباً مفعّلاً (§11.1: «تفعيل الحساب» آخر خطوة في التدفق).
   * المعرّف تولّده القاعدة، والدور يبقى القيمة الموروثة من قيد CHECK
   * في Phase 9: سياسة إسناد الأدوار ليست من نطاق Phase 11.
   */
  async createActive(input: CreateAccountInput): Promise<AccountRecord> {
    const result = await this.db.query<AccountRow>(
      `INSERT INTO users (
         username, display_name, role, employee_id, status,
         secret_ciphertext, secret_iv, secret_auth_tag, secret_key_id,
         must_change_secret, activated_at
       ) VALUES ($1, $2, 'employee', $3, 'active', $4, $5, $6, $7, $8, now())
       RETURNING ${ACCOUNT_COLUMNS}`,
      [
        input.username,
        input.displayName,
        input.employeeId,
        input.secret.ciphertext,
        input.secret.iv,
        input.secret.authTag,
        input.secret.keyId,
        input.mustChangeSecret ?? false,
      ],
    );
    return toRecord(result.rows[0]);
  }

  /** يبدّل القيم المشفّرة للرمز السري ويعيد ضبط عدّاد المحاولات. */
  async setSecret(
    id: string,
    secret: EncryptedSecretFields,
    options: { mustChangeSecret: boolean },
  ): Promise<AccountRecord | null> {
    const result = await this.db.query<AccountRow>(
      `UPDATE users
       SET secret_ciphertext = $2, secret_iv = $3, secret_auth_tag = $4, secret_key_id = $5,
           must_change_secret = $6, failed_login_attempts = 0, frozen_until = NULL
       WHERE id = $1
       RETURNING ${ACCOUNT_COLUMNS}`,
      [id, secret.ciphertext, secret.iv, secret.authTag, secret.keyId, options.mustChangeSecret],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** يزيد عدّاد المحاولات الفاشلة (§11.4) ويعيد السجل المحدَّث. */
  async incrementFailedAttempts(id: string): Promise<AccountRecord | null> {
    const result = await this.db.query<AccountRow>(
      `UPDATE users SET failed_login_attempts = failed_login_attempts + 1
       WHERE id = $1 RETURNING ${ACCOUNT_COLUMNS}`,
      [id],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** يصفر عدّاد المحاولات بعد دخول ناجح. */
  async resetFailedAttempts(id: string): Promise<AccountRecord | null> {
    const result = await this.db.query<AccountRow>(
      `UPDATE users SET failed_login_attempts = 0 WHERE id = $1 RETURNING ${ACCOUNT_COLUMNS}`,
      [id],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }


  /**
   * يجمّد الحساب مؤقتاً حتى لحظة معيّنة (§11.4: المحاولة الخامسة →
   * تجميد 15 دقيقة). الحالة تصبح `frozen` ومعها تاريخ انتهاء.
   */
  async freeze(id: string, untilIso: string): Promise<AccountRecord | null> {
    const result = await this.db.query<AccountRow>(
      `UPDATE users SET status = 'frozen', frozen_until = $2
       WHERE id = $1 RETURNING ${ACCOUNT_COLUMNS}`,
      [id, untilIso],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** يُعيد حساباً منتهية مدة تجميده إلى `active` (تجميد مؤقت في §11.4). */
  async unfreeze(id: string): Promise<AccountRecord | null> {
    const result = await this.db.query<AccountRow>(
      `UPDATE users SET status = 'active', frozen_until = NULL, failed_login_attempts = 0
       WHERE id = $1 RETURNING ${ACCOUNT_COLUMNS}`,
      [id],
    );
    return result.rows[0] === undefined ? null : toRecord(result.rows[0]);
  }

  /** يضبط حالة الحساب صراحةً (حالات النظام والاختبارات). */
  async setStatus(id: string, status: AccountStatus, frozenUntil: string | null): Promise<void> {
    await this.db.query(`UPDATE users SET status = $2, frozen_until = $3 WHERE id = $1`, [
      id,
      status,
      frozenUntil,
    ]);
  }

  /** يسجّل وقت آخر دخول ناجح. */
  async touchLastLogin(id: string): Promise<void> {
    await this.db.query(`UPDATE users SET last_login_at = now() WHERE id = $1`, [id]);
  }

  /**
   * يبطل كل جلسات الحساب.
   * يستدعيه: التجميد (§11.3: «تبطل الجلسات النشطة للحساب فورًا») و
   * إعادة الضبط الإداري (§11.7: الرمز القديم والجلسات القديمة تبطل).
   */
  async revokeAllSessions(userId: string, reason: SessionRevokeReason): Promise<number> {
    const result = await this.db.query(
      `UPDATE auth_sessions SET revoked_at = now(), revoke_reason = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [userId, reason],
    );
    return result.rowCount ?? 0;
  }
}
