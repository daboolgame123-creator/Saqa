import { TechnicalLogger } from '../logging';
import { JobRegistry } from './jobRegistry';
import type { JobContext, JobExecutionResult, ScheduledJobDefinition } from './jobTypes';

/**
 * مشغّل العمليات المجدولة — الأساس المعماري (Phase 8).
 *
 * مسؤولياته:
 * - تشغيل الوظائف المسجّلة وفق فواصلها الزمنية.
 * - منع تراكب تشغيلات الوظيفة نفسها.
 * - تسجيل النتائج تقنيًا (نجاح/فشل) دون إسقاط العملية.
 * - الإيقاف الآمن عند الإغلاق (بدون تشغيلات جديدة، مع انتظار الجارية).
 *
 * لا يعرف المشغّل أي وظيفة أعمال، ولا يملك سياسة إعادة محاولة
 * (job retry policy تخص مرحلة لاحقة — الخطة §42).
 */
export class JobRunner {
  private readonly jobs: ScheduledJobDefinition[];
  private readonly timers = new Map<string, ReturnType<typeof setInterval>>();
  private readonly running = new Map<string, Promise<void>>();
  private active = false;
  private stopping = false;
  private stopPromise: Promise<void> | null = null;

  constructor(jobs: ScheduledJobDefinition[] = JobRegistry.list()) {
    this.jobs = jobs;
  }

  isRunning(): boolean {
    return this.active;
  }

  /** أسماء الوظائف التي يشغّلها هذا المشغّل. */
  getJobNames(): string[] {
    return this.jobs.map((job) => job.name);
  }

  /** يبدأ تشغيل كل الوظائف وفق فواصلها. */
  start(): void {
    if (this.active) {
      return;
    }
    if (this.stopping) {
      throw new Error('لا يمكن بدء وظائف مجدولة أثناء إيقافها.');
    }
    this.active = true;

    for (const job of this.jobs) {
      this.timers.set(
        job.name,
        setInterval(() => {
          void this.execute(job);
        }, job.intervalMs),
      );
    }

    TechnicalLogger.info('scheduled runner started', {
      source: 'jobs',
      data: { jobCount: this.jobs.length, jobs: this.getJobNames() },
    });
  }

  /** إيقاف المشغّل: منع تشغيلات جديدة ثم انتظار التشغيلات الجارية. */
  stop(): Promise<void> {
    if (this.stopPromise !== null) {
      return this.stopPromise;
    }
    if (!this.active && this.running.size === 0) {
      return Promise.resolve();
    }

    // A manual runNow() is also an in-flight operation: do not let a
    // shutdown close PostgreSQL while it is still processing a reminder.
    this.stopping = true;
    this.active = false;
    for (const timer of this.timers.values()) {
      clearInterval(timer);
    }
    this.timers.clear();

    this.stopPromise = (async () => {
      try {
        await Promise.allSettled(Array.from(this.running.values()));
        TechnicalLogger.info('scheduled runner stopped', { source: 'jobs' });
      } finally {
        this.stopping = false;
        this.stopPromise = null;
      }
    })();
    return this.stopPromise;
  }

  /** تشغيل وظيفة محددة الآن (تشغيل يدوي/اختبارات). */
  async runNow(name: string): Promise<JobExecutionResult | undefined> {
    const job = this.jobs.find((candidate) => candidate.name === name);
    if (job === undefined) {
      throw new Error(`وظيفة غير مسجّلة في هذا المشغّل: ${name}.`);
    }
    return this.execute(job);
  }

  /** تنفيذ وظيفة واحدة مع منع التراكب وتسجيل النتيجة تقنيًا. */
  private async execute(job: ScheduledJobDefinition): Promise<JobExecutionResult | undefined> {
    // Timer callbacks already queued before clearInterval must not start
    // new work while a shutdown is draining the current executions.
    if (this.stopping) return undefined;
    if (this.running.has(job.name)) {
      TechnicalLogger.warn('scheduled job skipped: previous run still active', {
        source: 'jobs',
        data: { jobName: job.name },
      });
      return undefined;
    }

    const execution = this.runJob(job);
    this.running.set(
      job.name,
      execution.then(() => undefined),
    );

    try {
      return await execution;
    } finally {
      this.running.delete(job.name);
    }
  }

  /** التنفيذ الفعلي — لا يُسقط أخطاء الوظيفة إلى العملية. */
  private async runJob(job: ScheduledJobDefinition): Promise<JobExecutionResult> {
    const startedAt = Date.now();
    const context: JobContext = { jobName: job.name, startedAt: new Date(startedAt) };

    try {
      await job.run(context);
      const durationMs = Date.now() - startedAt;
      TechnicalLogger.info('scheduled job completed', {
        source: 'jobs',
        data: { jobName: job.name, durationMs },
      });
      return { jobName: job.name, success: true, durationMs };
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      TechnicalLogger.error('scheduled job failed', {
        source: 'jobs',
        data: { jobName: job.name, durationMs, error: message },
      });
      return { jobName: job.name, success: false, durationMs, error: message };
    }
  }
}
