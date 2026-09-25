/**
 * حالة دورة حياة الـBackend.
 *
 * تُستخدم للتمييز بين «العملية تعمل» (Health) و«النظام جاهز لاستقبال الطلبات» (Readiness)
 * كما تنص الخطة (§41 — Readiness: فرق واضح بين service is running و system is ready).
 *
 * في Phase 8 لا توجد متطلبات خارجية بعد (لا PostgreSQL ولا تخزين ملفات)،
 * فالانتقال الوحيد الذي يجعل النظام غير جاهز هو بدء الإغلاق المتدرّج.
 */

/** مراحل حياة الخادم. */
export type LifecyclePhase = 'starting' | 'ready' | 'shutting-down';

export class LifecycleState {
  private static phase: LifecyclePhase = 'starting';

  /** المرحلة الحالية. */
  static getPhase(): LifecyclePhase {
    return LifecycleState.phase;
  }

  /** هل النظام جاهز لاستقبال الطلبات؟ */
  static isReady(): boolean {
    return LifecycleState.phase === 'ready';
  }

  /** يُستدعى بعد أن يبدأ الخادم بالاستماع فعلًا. */
  static markReady(): void {
    LifecycleState.phase = 'ready';
  }

  /** يُستدعى عند بدء الإغلاق المتدرّج — فيصبح النظام غير جاهز لاستقبال طلبات جديدة. */
  static markShuttingDown(): void {
    LifecycleState.phase = 'shutting-down';
  }

  /** إعادة الحالة إلى البداية — للاختبارات فقط. */
  static reset(): void {
    LifecycleState.phase = 'starting';
  }
}
