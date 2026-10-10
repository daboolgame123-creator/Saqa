/**
 * PostgreSQL مدمج للتطوير المحلي (Phase 9) — بلا تثبيت نظام ولا صلاحيات إدارية.
 *
 * الاستخدام: npm run db:dev   (تبقى تعمل في الطرفية — Ctrl+C توقفها)
 * البيانات:  %TEMP%\alsqaya-dev-pg (تبقى بين جلسات التطوير)
 * المنفذ:    5433 (يتفادى منفذ 5432 لأي تثبيت نظام لاحق)
 * ينشئ قاعدة alsqaya_dev ويطبع DATABASE_URL جاهزاً — بيانات تطوير محلية فقط
 * (كلمة مرور غير سرية، لا تُستخدم في بيئة إنتاج).
 */
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';

const DATABASE_DIR = path.join(os.tmpdir(), 'alsqaya-dev-pg');
const PORT = 5433;
const USER = 'alsqaya';
const PASSWORD = 'alsqaya_dev';
const DATABASE_NAME = 'alsqaya_dev';

async function main(): Promise<void> {
  const pg = new EmbeddedPostgres({
    databaseDir: DATABASE_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
    // تهيئة UTF8 صريحة (Phase 10): العنقود الموروث للغة النظام يصير
    // WIN1256 على جهاز عربي، فيرفض الخادم الأرقام العربية الهندية
    // (نظام أرقام الكتب الرسمي، U+0660–U+0669) لأن cp1256 لا يغطّيها.
    initdbFlags: ['--encoding=UTF8'],
    onLog: (message) => {
      const text = String(message);
      // نطبع فقط مراحل مهمة لا كل مخرجات initdb.
      if (/initdb|Starting|ready|listening/i.test(text)) {
        console.log(`[pg] ${text.trim()}`);
      }
    },
    onError: (message) => console.error(`[pg] ${String(message)}`),
  });

  if (!existsSync(path.join(DATABASE_DIR, 'PG_VERSION'))) {
    console.log('[pg] أول تشغيل — يجري تجهيز عنقود البيانات...');
    await pg.initialise();
  }
  await pg.start();
  try {
    await pg.createDatabase(DATABASE_NAME);
  } catch {
    // القاعدة موجودة مسبقاً من جلسة سابقة — لا مشكلة.
  }

  console.log('[pg] PostgreSQL 17 جاهز للتطوير المحلي.');
  console.log(`[pg] DATABASE_URL=postgres://${USER}:${PASSWORD}@127.0.0.1:${PORT}/${DATABASE_NAME}`);

  const stop = async (): Promise<void> => {
    console.log('[pg] إيقاف الخادم...');
    await pg.stop();
    process.exit(0);
  };
  process.on('SIGINT', () => void stop());
  process.on('SIGTERM', () => void stop());
}

main().catch((error) => {
  console.error('[pg] فشل تشغيل PostgreSQL المدمج:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
