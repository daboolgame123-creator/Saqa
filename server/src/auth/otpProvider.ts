/**
 * مزوّد الرمز السري OTP (Phase 11) — واجهة فقط.
 *
 * ما تقرره الخطة صراحةً في §27:
 * - «يُبنى `OtpProvider` كواجهة.»
 * - «في الاختبار يستخدم Fake/Test Provider.»
 * - «لا يختار Cline مزود SMS تجاريًا من نفسه.»
 * - «اختيار المزود الفعلي يبقى إعداد نشر لاحق ما لم يقرر المستخدم غير ذلك.»
 *
 * لذلك لا يوجد هنا أي رمز شبكة أو مزوّد تجاري. التنفيذان:
 * - `createTestOtpProvider()` — يُبقي الرمز في الذاكرة للاختبار.
 * - `createLogOtpProvider()` — مزوّد تطوير مؤقت قبل اختيار مزوّد فعلي.
 */
import { config } from '../config';
import { TechnicalLogger } from '../logging';
import type { OtpPurpose } from './authTypes';

/** طلب إرسال رمز سري — ما يراه المزوّد ولا يرى غيره. */
export interface OtpDelivery {
  /** الهاتف الهدف (كما مُدخَل، لم يُشتق منه شيء). */
  phone: string;
  /** الرمز السري نفسه — يُسلَّم للمزوّد ولا يُخزَّن إلا مجزّأً. */
  code: string;
  /** الغرض: تسجيل حساب جديد أو استعادة. */
  purpose: OtpPurpose;
}

/** عقد المزوّد — نقطة الفصل الوحيدة عن أي مزوّد فعلي. */
export interface OtpProvider {
  /** اسم المزوّد للتسجيل التقني. */
  readonly name: string;
  /** يرسل الرمز. يرمي استثناءً عند الفشل (يُسجَّل، ولا يُكشف للعميل). */
  send(delivery: OtpDelivery): Promise<void>;
}

/** مزوّد الاختبار: يلتقط عمليات التسليم في الذاكرة بلا شبكة. */
export interface TestOtpProvider extends OtpProvider {
  /** كل عمليات التسليم بالترتيب. */
  readonly deliveries: OtpDelivery[];
  /** آخر رمز أُرسل لهذا الهاتف والغرض، أو null. */
  lastCodeFor(phone: string, purpose: OtpPurpose): string | null;
}

/** ينشئ مزوّد اختبار — تستعمله ملفات الاختبار (`.test.ts`) فقط. */
export function createTestOtpProvider(): TestOtpProvider {
  const deliveries: OtpDelivery[] = [];
  return {
    name: 'test',
    deliveries,
    lastCodeFor: (phone, purpose) => {
      for (let index = deliveries.length - 1; index >= 0; index -= 1) {
        const item = deliveries[index];
        if (item.phone === phone && item.purpose === purpose) {
          return item.code;
        }
      }
      return null;
    },
    send: async (delivery) => {
      deliveries.push(delivery);
    },
  };
}

/**
 * مزوّد التطوير: يكتب الرمز في السجل التقني ليصل إلى المطوّر.
 *
 * تحذير أمني مقصود: الرمز يُطبع هنا **عمداً** — لولا ذلك لا تكتمل
 * تدفّقات التسجيل والاستعادة أثناء التطوير قبل اختيار مزوّد فعلي.
 * لذلك لا يُبنى هذا المزوّد في بيئة الإنتاج أبداً (انظر
 * `createOtpProvider`)، والاختبارات تلتقط الرمز من
 * `TestOtpProvider` لا من قراءة السجل.
 */
export function createLogOtpProvider(): OtpProvider {
  return {
    name: 'log',
    send: async (delivery) => {
      TechnicalLogger.info('otp issued by the development provider (no SMS gateway configured)', {
        source: 'auth',
        data: {
          phone: delivery.phone,
          purpose: delivery.purpose,
          devOtpCode: delivery.code,
        },
      });
    },
  };
}

/**
 * يختار المزوّد الفعلي حسب البيئة.
 *
 * `AUTH_OTP_PROVIDER` غير مهيأ ⇒ مزوّد التطوير. أي قيمة أخرى ترفض
 * صريحاً: اختيار مزوّد فعلي قرار نشر (§27)، فلا يُخمَّن هنا ولا
 * يُضاف مزوّد SMS تجاري من تلقاء نفسه.
 */
export function createOtpProvider(env: NodeJS.ProcessEnv = process.env): OtpProvider {
  const configured = (env.AUTH_OTP_PROVIDER ?? '').trim().toLowerCase();
  if (configured === '' || configured === 'log') {
    if (config.isProduction) {
      throw new Error(
        'AUTH_OTP_PROVIDER غير مهيأ في الإنتاج — اختيار مزوّد OTP قرار نشر (§27) ولا يُخمَّن.',
      );
    }
    return createLogOtpProvider();
  }
  throw new Error(
    `AUTH_OTP_PROVIDER غير مدعوم: "${configured}". المزوّد المتاح الآن هو "log" (تطوير فقط).`,
  );
}