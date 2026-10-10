/**
 * اختبارات Phase 15 — طبقة `audit` (وحدة، بلا قاعدة ولا HTTP).
 *
 * ما تفحصه هنا:
 * 1. مرآة `event_kind`: قائمة TypeScript تطابق قيد CHECK في الترحيل
 *    0004 حرفياً — فلا يُسجَّل حدث ترفضه القاعدة ولا يقبل القاعدة
 *    ما لا نوع له في الكود.
 * 2. تنقية الأسرار: أي مفتاح حساس يُستبدل `[REDACTED]` قبل الكتابة —
 *    لا كلمة مرور ولا OTP ولا رمز يصل إلى jsonb (§31).
 * 3. شكل الكتابة: INSERT وحده لا UPDATE ولا DELETE — سطح الطبقة لا
 *    يملك تعديلاً ولا حذفاً من المبدأ (§31 Audit Integrity).
 *
 * اختبارات النجاح الفعلي على القاعدة (كتابة عند العملية، فاعل من
 * الجلسة، الرفض لغير صاحب `view_audit_logs`) في
 * `tests/api/audit.test.ts` و`tests/api/acknowledgement.test.ts`.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  AUDIT_EVENT_KINDS,
  REDACTED,
  isSensitiveKey,
  recordAuditEvent,
  redactSensitiveValues,
  type AuditEvent,
} from '../src/audit';
import type { Queryable } from '../src/database';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(serverRoot, 'migrations');

/** Queryable وهمي يلتقط الاستعلام وقيمّه (لا قاعدة في اختبار الوحدة). */
function fakeDb(): { db: Queryable; queries: { sql: string; params: unknown[] }[] } {
  const queries: { sql: string; params: unknown[] }[] = [];
  const db = {
    query(sql: string, params?: unknown[]): Promise<unknown> {
      queries.push({ sql, params: params ?? [] });
      return Promise.resolve({ rows: [], rowCount: 0 });
    },
  } as unknown as Queryable;
  return { db, queries };
}

/** حدث تدقيق نموذج للاختبارات. */
function sampleEvent(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    eventKind: 'update',
    actor: { userId: '11111111-1111-1111-1111-111111111111', employeeId: null, sessionId: 'sess-1' },
    entityKind: 'employee',
    entityId: '22222222-2222-2222-2222-222222222222',
    newValues: { status: 'active' },
    ...overrides,
  };
}

describe('Phase 15 — طبقة audit (وحدة)', () => {
  test('event_kind مرآة لقيد CHECK في الترحيل 0004 — 12 قيمة بالضبط', () => {
    const sql = readFileSync(join(migrationsDir, '0004_operations_logs.sql'), 'utf8');
    const check = /event_kind\s+text NOT NULL CHECK \(event_kind IN \(([\s\S]*?)\)\)/.exec(sql);
    assert.ok(check !== null, 'قيد CHECK لـevent_kind موجود في 0004');
    const fromDb = [...check[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    const fromCode = [...AUDIT_EVENT_KINDS].sort();
    assert.deepEqual(fromCode, fromDb, 'قائمة الأنواع في الكود = قائمة القيد حرفياً');
    assert.equal(fromCode.length, 12, '§31 يحدد اثني عشر نوعاً');
  });

  test('الترحيل 0008 يفرض قيداً فريداً على (transaction_id, user_id) في view_logs', () => {
    const sql = readFileSync(join(migrationsDir, '0008_view_log_acknowledgement.sql'), 'utf8');
    assert.match(sql, /UNIQUE \(transaction_id, user_id\)/, 'القيد الفريد موجود في up');
    assert.match(sql, /DROP CONSTRAINT/, 'التراجع يزيل القيد لا الجدول');
    assert.ok(sql.includes('-- migrate:up') && sql.includes('-- migrate:down'), 'صيغة الترحيل');
  });

  test('recordAuditEvent يكتب INSERT وحده — لا UPDATE ولا DELETE في سطح الطبقة', async () => {
    const { db, queries } = fakeDb();
    await recordAuditEvent(db, sampleEvent());
    assert.equal(queries.length, 1);
    assert.match(queries[0].sql, /^\s*INSERT INTO audit_logs/);
    assert.ok(
      !/\b(UPDATE|DELETE)\b/i.test(queries[0].sql),
      'لا مسار تعديل أو حذف داخل كاتب سجل التدقيق',
    );
  });

  test('recordAuditEvent يمرر الفاعل والكيان والقيم بترتيب أعمدة موثّق', async () => {
    const { db, queries } = fakeDb();
    await recordAuditEvent(
      db,
      sampleEvent({
        oldValues: { status: 'active' },
        newValues: { status: 'former', outcome: 'success' },
      }),
    );
    const captured = queries[0] as { sql: string; params: unknown[] };
    const params = captured.params;
    assert.match(captured.sql, /event_kind, actor_user_id, actor_employee_id/);
    assert.equal(params[0], 'update');
    assert.equal(params[1], '11111111-1111-1111-1111-111111111111', 'فاعله من الجلسة لا من العميل');
    assert.equal(params[3], 'employee');
    assert.equal(params[4], '22222222-2222-2222-2222-222222222222');
    const oldValues = JSON.parse(params[5] as string) as Record<string, unknown>;
    const newValues = JSON.parse(params[6] as string) as Record<string, unknown>;
    assert.deepEqual(oldValues, { status: 'active' });
    assert.equal(newValues.status, 'former');
    assert.deepEqual(
      newValues.context,
      { sessionId: 'sess-1' },
      'سياق الجلسة يُخزَّن داخل new_values.context',
    );
  });

  test('recordAuditEvent لا يكتب سراً: القيم الحساسة تُستبدل بالنص البديل', async () => {
    const { db, queries } = fakeDb();
    await recordAuditEvent(
      db,
      sampleEvent({
        newValues: {
          purpose: 'login',
          password: 'p@ss',
          otpCode: '481902',
          nested: { sessionToken: 'tok_abc', subject: 'يبقى' },
        },
      }),
    );
    const params = (queries[0] as { params: unknown[] }).params;
    const stored = params[6] as string;
    assert.ok(!stored.includes('p@ss'), 'لا كلمة مرور في السجل');
    assert.ok(!stored.includes('481902'), 'لا OTP في السجل');
    assert.ok(!stored.includes('tok_abc'), 'لا رمز جلسة في السجل');
    const newValues = JSON.parse(stored) as Record<string, unknown>;
    assert.equal(newValues.password, REDACTED);
    assert.equal(newValues.otpCode, REDACTED);
    assert.equal(newValues.purpose, 'login', 'ما ليس سراً يبقى كما هو');
    const nested = newValues.nested as Record<string, unknown>;
    assert.equal(nested.sessionToken, REDACTED, 'التنقية تغوص المتداخل');
    assert.equal(nested.subject, 'يبقى');
  });

  test('redactSensitiveValues: مفاتيح حساسة تُنقّى وغيرها تبقى', () => {
    assert.equal(isSensitiveKey('password'), true);
    assert.equal(isSensitiveKey('clientSecret'), true);
    assert.equal(isSensitiveKey('otpCode'), true);
    assert.equal(isSensitiveKey('sessionToken'), true);
    assert.equal(isSensitiveKey('passwordHash'), true);
    assert.equal(isSensitiveKey('badgeNumber'), false, 'رقم الباج ليس سراً');
    assert.equal(isSensitiveKey('subject'), false);
    assert.equal(isSensitiveKey('serviceEndReason'), false);

    assert.equal(redactSensitiveValues(null), null);
    assert.equal(redactSensitiveValues(undefined), null);
    assert.deepEqual(redactSensitiveValues({ code: '1234', note: 'أهلا' }), {
      code: REDACTED,
      note: 'أهلا',
    });
    // المُدخل لا يُعدَّل: التنقية تُنشئ كائناً جديداً.
    const original = { secret: 'x' };
    redactSensitiveValues(original);
    assert.equal(original.secret, 'x', 'الأصل لم يُمسّ');
  });
});
