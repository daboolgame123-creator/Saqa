import { LifecycleState } from '../utils';

/**
 * فحص الجاهزية (Readiness).
 *
 * الفرق عن Health (الخطة §41):
 * - Health: هل العملية تعمل؟
 * - Readiness: هل النظام جاهز لاستقبال الطلبات؟
 *
 * Phase 8: لا توجد متطلبات خارجية (لا PostgreSQL ولا تخزين ملفات)،
 * فالفحص الوحيد هو حالة دورة حياة الخادم.
 */

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
  static getStatus(now: Date = new Date()): ReadinessStatus {
    const checks = ReadinessService.runChecks();
    const ready = checks.every((check) => check.ready);

    return {
      status: ready ? 'ready' : 'not-ready',
      checks,
      timestamp: now.toISOString(),
    };
  }

  private static runChecks(): ReadinessCheck[] {
    return [ReadinessService.checkLifecycle()];
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
}
