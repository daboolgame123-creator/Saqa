import type { ScheduledJobDefinition } from './jobTypes';

/**
 * سجل الوظائف المجدولة — نقطة تسجيل مركزية.
 *
 * Phase 8: يبدأ السجل فارغًا ولا تُسجَّل فيه أي وظيفة أعمال.
 * تسجيل الوظائف الفعلية (تذكيرات/OCR/نسخ احتياطي/صيانة) يخص مراحله في الخطة.
 */
export class JobRegistry {
  private static jobs = new Map<string, ScheduledJobDefinition>();

  /** يسجّل وظيفة جديدة. يرفض الاسم الفارغ، والفاصل غير الصالح، والاسم المكرر. */
  static register(job: ScheduledJobDefinition): void {
    if (job.name.trim() === '') {
      throw new Error('اسم الوظيفة المجدولة مطلوب.');
    }
    if (!Number.isInteger(job.intervalMs) || job.intervalMs <= 0) {
      throw new Error(
        `الفاصل الزمني للوظيفة "${job.name}" غير صالح: ${job.intervalMs}. يجب أن يكون عددًا صحيحًا أكبر من صفر.`,
      );
    }
    if (JobRegistry.jobs.has(job.name)) {
      throw new Error(`يوجد تسجيل مسبق لوظيفة بالاسم: ${job.name}.`);
    }
    JobRegistry.jobs.set(job.name, job);
  }

  /** يلغي تسجيل وظيفة. يعيد true إن كانت مسجّلة. */
  static unregister(name: string): boolean {
    return JobRegistry.jobs.delete(name);
  }

  static has(name: string): boolean {
    return JobRegistry.jobs.has(name);
  }

  static get(name: string): ScheduledJobDefinition | undefined {
    return JobRegistry.jobs.get(name);
  }

  /** نسخة من قائمة الوظائف المسجّلة. */
  static list(): ScheduledJobDefinition[] {
    return Array.from(JobRegistry.jobs.values());
  }

  /** إفراغ السجل — للاختبارات. */
  static clear(): void {
    JobRegistry.jobs.clear();
  }
}
