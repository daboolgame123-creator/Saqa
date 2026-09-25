/**
 * فحص صحة الـBackend (Health).
 *
 * فحص بسيط لعملية الخادم فقط. لا يتحقق من أي مصدر بيانات
 * لأن PostgreSQL خارج نطاق Phase 8 (يبدأ في Phase 9).
 */

/** استجابة فحص الصحة. */
export interface HealthStatus {
  /** 'ok' عندما يكون الخادم يعمل ويستقبل الطلبات. */
  status: 'ok';
  /** مدة تشغيل العملية بالثواني (مقرّبة لأسفل). */
  uptimeSeconds: number;
  /** وقت الاستجابة بصيغة ISO 8601. */
  timestamp: string;
}

export class HealthService {
  /** يبني استجابة فحص الصحة الحالية. */
  static getStatus(now: Date = new Date()): HealthStatus {
    return {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime()),
      timestamp: now.toISOString(),
    };
  }
}
