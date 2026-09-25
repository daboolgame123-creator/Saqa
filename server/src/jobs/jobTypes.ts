/**
 * أنواع العمليات المجدولة (Scheduled Operations) — Phase 8.
 *
 * البنية المعمارية فقط: يستضيف هذا الأساس مستقبلًا التذكيرات ووظائف OCR
 * والنسخ الاحتياطي والصيانة والفحوص الثقيلة (الخطة §57 بند 7)،
 * دون تعريف أي وظيفة أعمال في هذه المرحلة.
 */

/** سياق تنفيذ وظيفة مجدولة. */
export interface JobContext {
  /** اسم الوظيفة الجاري تنفيذها. */
  jobName: string;
  /** وقت بدء التنفيذ. */
  startedAt: Date;
}

/** تعريف وظيفة مجدولة. */
export interface ScheduledJobDefinition {
  /** اسم فريد للوظيفة (تقني — يُستخدم في السجلات). */
  name: string;
  /** الفاصل بين التشغيلات بالمللي ثانية (عدد صحيح أكبر من صفر). */
  intervalMs: number;
  /** التنفيذ الفعلي للوظيفة. */
  run: (context: JobContext) => Promise<void> | void;
}

/** نتيجة محاولة تنفيذ وظيفة. */
export interface JobExecutionResult {
  jobName: string;
  success: boolean;
  durationMs: number;
  /** رسالة الخطأ عند الفشل. */
  error?: string;
}
