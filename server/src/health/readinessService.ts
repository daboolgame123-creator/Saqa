import { getSharedPool } from '../database';
import { config } from '../config';
import { TechnicalLogger } from '../logging';
import { LifecycleState } from '../utils';

/**
 * فحص الجاهزية (Readiness).
 *
 * الفرق عن Health (الخطة §41):
 * - Health: هل العملية تعمل؟
 * - Readiness: هل النظام جاهز لاستقبال الطلبات؟
 *
 * Phase 10: أُضيف فحص قاعدة البيانات. في Phase 8/9 كان `DATABASE_URL`
 * اختيارياً، لكن مع وجود مسارات /api التي تقرأ من القاعدة لم يعد ذلك
 * صحيحاً: خادم بلا قاعدة لا يستطيع خدمة طلب بيانات.
 *
 * قاعدة التشغيل: `DATABASE_URL` فارغ ⇒ غير جاهز (بوضوح، لا صمت)،
 * ومضبوط لكن يتعذّر الاتصال ⇒ غير جاهز مع سبب الخطأ.
 *
 * الفحص بمهلة قصيرة: فحص الجاهزية يجب ألا يعلّق طلب /health/ready.
 */
const DATABASE_CHECK_TIMEOUT_MS = 2000;

/** نتيجة فحص جاهزية واحد. */
export interface ReadinessCheck {
  /** اسم الفحص (تقني). */
  name: string;
  ready: boolean;
  /** سبب عدم الجاهزية عند وجوده. */
  message?: string;
}

/** استجابة فحص الجاهزية. */
export interface ReadinessStatus {
  status: 'ready' | 'not-ready';
  checks: ReadinessCheck[];
  timestamp: string;
}

export class ReadinessService {
  /** يبني استجابة الجاهزية من كل الفحوص المسجّلة. */
  static async getStatus(now: Date = new Date()): Promise<ReadinessStatus> {
    const checks = await Promise.all(ReadinessService.runChecks());
    const ready = checks.every((check) => check.ready);

    return {
      status: ready ? 'ready' : 'not-ready',
      checks,
      timestamp: now.toISOString(),
    };
  }

  /** lifecycle متزامن لكن يُغلَّف في Promise ليجتمع مع فحص القاعدة غير المتزامن. */
  private static runChecks(): Promise<ReadinessCheck>[] {
    return [
      Promise.resolve(ReadinessService.checkLifecycle()),
      ReadinessService.checkDatabase(),
    ];
  }

  /** جاهز فقط عندما يكون الخادم في مرحلة الاستقبال الفعلي للطلبات. */
  private static checkLifecycle(): ReadinessCheck {
    const phase = LifecycleState.getPhase();
    if (phase === 'ready') {
      return { name: 'lifecycle', ready: true };
    }
    return {
      name: 'lifecycle',
      ready: false,
      message: `حالة الخادم الحالية لا تسمح باستقبال الطلبات: ${phase}`,
    };
  }

  /**
   * فحص اتصال قاعدة البيانات بمهلة قصيرة.
   *
   * `DATABASE_URL` فارغ ⇐ غير جاهز: مسار /api بلا قاعدة يجعل الخادم
   * غير قادر على الخدمة، والإبلاغ هنا أوضح من 500 عند أول طلب.
   * قيمة الرابط لا تُطبع أبداً (مفتاح حساس في logTypes) — فقط اسم السبب.
   */
  private static async checkDatabase(): Promise<ReadinessCheck> {
    if (config.databaseUrl === '') {
      return {
        name: 'database',
        ready: false,
        message: 'DATABASE_URL غير مهيأ — لا يمكن خدمة مسارات /api.',
      };
    }

    try {
      const pool = getSharedPool();
      const query = pool.query('SELECT 1');
      const timeout = new Promise<never>((_resolve, reject) => {
        setTimeout(() => reject(new Error('انتهت مهلة فحص قاعدة البيانات.')), DATABASE_CHECK_TIMEOUT_MS)
          .unref();
      });
      await Promise.race([query, timeout]);
      return { name: 'database', ready: true };
    } catch (error) {
      // الرسالة فنّية للتشخيص، ولا تحتوي بيانات اتصال.
      const message = error instanceof Error ? error.message : String(error);
      TechnicalLogger.warn('database readiness check failed', {
        source: 'health',
        data: { error: message },
      });
      return { name: 'database', ready: false, message };
    }
  }
}
