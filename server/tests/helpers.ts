/**
 * أدوات مساعدة لاختبارات Phase 8 (ليست اختبارًا بذاتها).
 */
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Application } from 'express';
import { TechnicalLogger, type LogLevel, type LogRecord } from '../src/logging';
import { closeServer } from '../src/server';

/** تطبيق يعمل على منفذ عشوائي. */
export interface RunningApp {
  port: number;
  baseUrl: string;
  server: Server;
  shutdown: () => Promise<void>;
}

/**
 * انتظار إطلاق حدث listening وإعادة المنفذ الفعلي.
 *
 * لا يُعتمد على `server.listening` هنا: في Node تصبح قيمتها true قبل إطلاق الحدث،
 * والاعتماد عليها يجعل الانتظار يعود مبكرًا قبل اكتمال دوال الاستماع المسجّلة.
 */
export function waitForListening(server: Server): Promise<number> {
  return new Promise((resolve, reject) => {
    server.once('listening', () => resolve((server.address() as AddressInfo).port));
    server.once('error', reject);
  });
}

/** تشغيل تطبيق على منفذ عشوائي مع دالة إغلاق آمنة. */
export async function listenApp(app: Application): Promise<RunningApp> {
  const server = app.listen(0) as Server;
  const port = await waitForListening(server);
  return {
    port,
    baseUrl: `http://127.0.0.1:${port}`,
    server,
    shutdown: async () => {
      // إغلاق الاتصالات المعلّقة حتى لا ينتظر server.close اتصالات keep-alive.
      server.closeAllConnections();
      await closeServer(server);
    },
  };
}

export async function jsonOf<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

/** انتظار قصير حتى تكتمل عمليات غير متزامنة. */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** يخفض ضجيج السجلات في الاختبارات التي لا تختبر السجل نفسه. */
export function silenceLogs(): void {
  TechnicalLogger.configure({ level: 'error' });
}

/** سجل تقني مُجمَّع في الذاكرة لاختبار السجل. */
export interface CapturedLogs {
  records: LogRecord[];
  restore: () => void;
}

/** يلتقط كل السجلات التقنية بدل كتابتها إلى المخرجات. */
export function captureLogs(level: LogLevel = 'debug'): CapturedLogs {
  const records: LogRecord[] = [];
  TechnicalLogger.configure({
    level,
    sink: { write: (record) => records.push(record) },
  });
  return {
    records,
    restore: () => TechnicalLogger.reset(),
  };
}
