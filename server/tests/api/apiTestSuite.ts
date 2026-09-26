/**
 * الاختبارات المشتركة بين ملفات اختبار الـAPI (Phase 10) — ليست اختباراً.
 *
 * تُعيد سياقاً نظيفاً لكل ملف اختبار: قاعدة PostgreSQL مدمجة معزولة،
 * بيانات مُصفَّرة قبل كل اختبار، وتطبيق Express حقيقي على منفذ عشوائي.
 */
import type { Pool } from 'pg';
import { startTestDatabase, stopTestDatabase } from '../db/testDb';
import { startApiTestContext, type ApiTestContext } from './apiTestHelpers';

/** كل ما يحتاجه ملف الاختبار ليعمل ثم يُنظَّف. */
export interface ApiTestSuite {
  context: ApiTestContext;
  pool: Pool;
  baseUrl: string;
}

/** يشغّل القاعدة والتطبيق ويخفت السجلات التقنية. */
export async function startApiSuite(): Promise<ApiTestSuite> {
  const { pool } = await startTestDatabase();
  const context = await startApiTestContext(pool);
  return { context, pool, baseUrl: context.baseUrl };
}

/** يوقف التطبيق ويوقف عنقود قاعدة الاختبار. */
export async function stopApiSuite(suite: ApiTestSuite): Promise<void> {
  await suite.context.running.shutdown();
  await stopTestDatabase();
}
