import { realpathSync } from 'node:fs';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { config } from './config';
import { closeSharedPool, getSharedPool } from './database';
import { JobRunner } from './jobs';
import { registerReminderDispatchJob } from './jobs/reminderDispatcher';
import { TechnicalLogger } from './logging';
import { LifecycleState } from './utils';

/**
 * نقطة تشغيل الـBackend (Phase 8).
 *
 * مسؤولية هذا الملف: إنشاء HTTP server وتشغيله وإغلاقه،
 * وربط دورة الحياة بالوظائف المجدولة والسجل التقني.
 * إنشاء تطبيق Express نفسه في app.ts، ولا يوجد هنا أي منطق أعمال.
 */

/** تشغيل الخادم على المنفذ المعطى (منفذ الإعدادات افتراضيًا). */
export function startServer(port: number = config.port): Server {
  const server = createApp().listen(port);

  server.on('listening', () => {
    const address = server.address();
    const boundPort = address !== null && typeof address === 'object' ? address.port : port;

    // An in-flight bind must not undo an already initiated shutdown.
    if (LifecycleState.getPhase() !== 'shutting-down') {
      LifecycleState.markReady();
    }

    TechnicalLogger.info('backend listening', {
      source: 'server',
      data: { port: boundPort, environment: config.nodeEnv },
    });
  });

  return server;
}

/** إغلاق الخادم وانتظار انتهاء الاتصالات القائمة. */
export function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    });
  });
}

/** الوحدات التي تُدار عند الإغلاق. */
export interface ShutdownTargets {
  server: Server;
  jobRunner: JobRunner;
}

/**
 * ينشئ دالة الإغلاق المتدرّج (Graceful Shutdown):
 * تُنهي الوظائف المجدولة، ثم تُغلق الخادم بعد انتهاء الاتصالات القائمة،
 * وتُنفَّذ مرة واحدة فقط مهما تكررت الإشارات.
 */
export function createShutdownHandler(targets: ShutdownTargets): () => Promise<void> {
  let shutdownPromise: Promise<void> | null = null;

  return (): Promise<void> => {
    // Every caller (including SIGINT followed by SIGTERM) must await the
    // same actual teardown, not an already-resolved no-op.
    if (shutdownPromise !== null) return shutdownPromise;
    LifecycleState.markShuttingDown();

    shutdownPromise = (async () => {
      let failed = false;
      // Keep the order: jobs finish before closing sockets and their DB pool.
      // A failing step cannot prevent the remaining resources from closing.
      for (const [step, close] of [
        ['scheduled jobs', () => targets.jobRunner.stop()],
        ['HTTP server', () => closeServer(targets.server)],
        ['database pool', () => closeSharedPool()],
      ] as const) {
        try {
          await close();
        } catch (error) {
          failed = true;
          TechnicalLogger.error('shutdown step failed', {
            source: 'server',
            data: {
              step,
              error: error instanceof Error ? error.message : String(error),
            },
          });
        }
      }
      if (failed) {
        process.exitCode = 1;
      } else {
        TechnicalLogger.info('shutdown complete', { source: 'server' });
      }
    })();
    return shutdownPromise;
  };
}

/** يربط دالة الإغلاق بإشارتي SIGINT وSIGTERM. */
export function registerShutdownHandlers(shutdown: () => Promise<void>): void {
  const handle = (signalName: string): void => {
    TechnicalLogger.info('shutdown signal received', {
      source: 'server',
      data: { signal: signalName },
    });
    void shutdown();
  };

  process.on('SIGINT', () => handle('SIGINT'));
  process.on('SIGTERM', () => handle('SIGTERM'));
}

/** الـBackend بعد تشغيله. */
export interface BackendRuntime extends ShutdownTargets {
  shutdown: () => Promise<void>;
}

/**
 * نقطة التجميع: تبدأ الوظائف المجدولة ثم الخادم، وتربط الإغلاق المتدرّج بالإشارات.
 *
 * Phase 21: تُسجَّل وظيفة **توزيع التذكيرات** في `JobRegistry` قبل إنشاء
 * `JobRunner` (الذي يقرأ `JobRegistry.list()` في مُنشئه)، فلا تُشغَّل من
 * فِعل `start()` وحدها.
 *
 * **الـPool يُحلّ داخل `run` لا هنا**، بتأجيل مقصود: الإقلاع يسبق أول
 * تشغيل للوظيفة، ولو فُتح الاتصال هنا لكان `startBackend` يفشل بلا
 * `DATABASE_URL` — وهو ما يكسر دورة حياة الخادم واختبارها (Phase 8)
 * بلا سبب. والتأجيل لا يُخفي فشلاً: `JobRunner` يمسك خطأ الوظيفة
 * ويسجّله (`scheduled job failed`) ولا يُسقط العملية، فهو **ظاهر**
 * لا صامت.
 */
export function startBackend(port: number = config.port): BackendRuntime {
  registerReminderDispatchJob(getSharedPool);
  const jobRunner = new JobRunner();
  jobRunner.start();

  const server = startServer(port);
  const shutdown = createShutdownHandler({ server, jobRunner });
  registerShutdownHandlers(shutdown);

  return { server, jobRunner, shutdown };
}

/**
 * هل يُنفَّذ هذا الملف مباشرة (وليس مستوردًا)؟
 * يمنع تشغيل الخادم تلقائيًا عند استيراد الملف في الاختبارات.
 */
function isDirectRun(): boolean {
  const entryPath = process.argv[1];
  if (entryPath === undefined) {
    return false;
  }
  try {
    return realpathSync(entryPath) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isDirectRun()) {
  startBackend();
}
