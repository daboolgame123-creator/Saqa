/**
 * اختبار انحدار (Legacy fix #1 — خارج نطاق Phase 18).
 *
 * **العيب:** `handleSaveTransaction` في `src/App.tsx` كان يرسل كائن
 * `Transaction` كاملاً في جسم `PATCH`:
 *
 * ```ts
 * updateTransaction(normalized.id, { ...normalized, expectedVersion: normalized.version });
 * ```
 *
 * فترسل حقول **قراءة** لا يقبلها مُحقِّق `PATCH` على الخادم — `id` · `month` ·
 * `createdAt` — فيرفضه بـ400 `noUnknownFields`. قائم من Phase 10 وموثّق في
 * تقرير Phase 17.
 *
 * **لماذا هذا الاختبار على الخادم:** المشروع يملك مشغّل اختبار واحد
 * (`node --test` على `server/tests`). الدالة المُصلَحة في `src/services`
 * **نقية وبلا React** — فتُختبر هنا بلا كلفة بنية اختبار ثانية، والأهم:
 * تُختبر مقابل **مُحقِّق الخادم نفسه** لا على قائمة مفترضة.
 *
 * الخياران المرفوضان عمداً: توسيع `UpdateTransactionDto` ليقبل حقول القراءة
 * (يصنع مصدرَين للحقيقة) أو تعطيل `noUnknownFields` (يزيل الحارس الذي كشف
 * العيب).
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  PATCHABLE_TRANSACTION_FIELD_NAMES,
  READ_ONLY_TRANSACTION_FIELDS,
  buildTransactionUpdatePatch,
} from '../../src/services/transactionPatchPayload';
import type { Transaction } from '../../src/core/models/transaction';
import {
  TRANSACTION_PATCH_FIELDS,
  updateTransactionBody,
} from '../src/api/validation/transactionValidators';

/** كتاب كامل بكل الحقول — يُرسل كما كان قبل الإصلاح. */
const FULL_TRANSACTION: Transaction = {
  id: '11111111-1111-4111-8111-111111111111',
  number: '٢٠٠/ص',
  sequence: '٩٠٠',
  date: '2026-09-10',
  month: '2026-09',
  direction: 'صادر',
  category: 'إدارية',
  subType: 'تعميم',
  entity: 'إدارة المركز',
  subject: 'كتاب اختبار',
  addressedTo: 'شعبة Hawkins',
  content: 'نص الكتاب',
  employeeIds: ['22222222-2222-4222-8222-222222222222'],
  employeeName: 'منتسب اختبار',
  visibility: 'PublicToEmployees',
  targetScope: 'all',
  priority: 'عادي',
  directorDirective: { text: 'توجيه', date: '2026-09-10 10:00', actionRequired: true },
  reminder: { enabled: true, remindAt: '2026-09-12', note: 'متابعة' },
  status: 'قيد المراجعة',
  notes: 'ملاحظات',
  isRead: false,
  readAt: '2026-09-10 10:00',
  isDailySituation: false,
  specificDetails: { purpose: 'توثيق' },
  createdAt: '2026-09-01T08:00:00.000Z',
  version: 4,
  attachments: [
    {
      id: 'att-1',
      name: 'كتاب_200.jpg',
      type: 'كتاب رئيسي',
      fileSize: '1.2 MB',
      uploadDate: '2026-09-10',
      isImage: true,
      previewUrl: 'blob:x',
    },
  ],
};

describe('Legacy fix #1 — جسم PATCH للكتاب محصور في حقول العقد', () => {
  it('لا يرسل حقول القراءة: id · month · createdAt · employeeIds · version', () => {
    const patch = buildTransactionUpdatePatch(FULL_TRANSACTION) as Record<string, unknown>;
    for (const field of READ_ONLY_TRANSACTION_FIELDS) {
      assert.equal(patch[field], undefined, `الحقل ${field} مستبعد من جسم PATCH`);
    }
  });

  it('يُبقي كل حقول التعديل التي يسمح بها العقد', () => {
    const patch = buildTransactionUpdatePatch(FULL_TRANSACTION) as Record<string, unknown>;
    // كل حقل قابل للتعديل **الحاضر في السجل** يجب أن يبقى في الجسم.
    for (const field of PATCHABLE_TRANSACTION_FIELD_NAMES) {
      if (field === 'attachments') continue;
      if (!(field in FULL_TRANSACTION)) continue;
      assert.ok(field in patch, `الحقل ${field} يجب أن يبقى قابلاً للتعديل`);
    }
    assert.equal(patch.subject, 'كتاب اختبار');
    assert.equal(patch.status, 'قيد المراجعة');
    assert.equal(patch.notes, 'ملاحظات');
    assert.deepEqual(patch.directorDirective, FULL_TRANSACTION.directorDirective);
  });

  it('المرفقات تُحمل بلا معرّفات وحقول عرض (§10)', () => {
    const patch = buildTransactionUpdatePatch(FULL_TRANSACTION);
    const attachments = patch.attachments ?? [];
    assert.equal(attachments.length, 1);
    assert.deepEqual(attachments[0], {
      name: 'كتاب_200.jpg',
      type: 'كتاب رئيسي',
      fileSize: '1.2 MB',
      uploadDate: '2026-09-10',
    });
  });

  it('expectedVersion يُرسل من نسخة السجل (قفل Phase 17)', () => {
    const patch = buildTransactionUpdatePatch(FULL_TRANSACTION) as Record<string, unknown>;
    assert.equal(patch.expectedVersion, 4);
  });

  it('الحقول الاختيارية الغائبة لا تُرسل `undefined`', () => {
    const minimal: Transaction = {
      id: FULL_TRANSACTION.id,
      number: '300/د',
      sequence: '1',
      date: '2026-09-10',
      month: '2026-09',
      direction: 'داخلي',
      category: 'إدارية',
      subType: 'تعميم',
      entity: 'إدارة',
      subject: 'كتاب مختصر',
      status: 'قيد المراجعة',
      version: 1,
      attachments: [],
    };
    const patch = buildTransactionUpdatePatch(minimal) as Record<string, unknown>;
    for (const field of ['notes', 'content', 'priority', 'visibility']) {
      assert.ok(!(field in patch), `الحقل الغائب ${field} لا يُرسل أصلاً`);
    }
    assert.deepEqual(patch.attachments, []);
  });

  it('الجسم الناتج يمرّ على مُحقِّق PATCH الحقيقي بلا 400', () => {
    // هذا هو الانحدار الفعلي: الجسم القديم `{...transaction}` كان يُرفض.
    const outcome = updateTransactionBody(buildTransactionUpdatePatch(FULL_TRANSACTION));
    assert.equal(outcome.kind, 'valid', `مُحقِّق الخادم رفض الجسم: ${JSON.stringify(outcome)}`);
  });

  it('الجسم القديم الكامل كان مرفوضاً — يثبت أن الاختبار يلتقط العيب', () => {
    // `{ ...transaction }` كما كان في App.tsx قبل الإصلاح.
    const legacy = { ...FULL_TRANSACTION, expectedVersion: FULL_TRANSACTION.version };
    assert.equal(updateTransactionBody(legacy).kind, 'invalid', 'السلوك القديم كان مرفوضاً');
  });

  it('قائمة حقول الواجهة **جزء من** عقد الخادم، والفرق موثّق', () => {
    // الواجهة تبني الجسم من كائن `Transaction` وهو لا يحمل `importedAt`
    // (طابع نظام يكتبه الخادم). فالمطابقة الصحيحة هي الاحتواء لا التطابق
    // الحرفي — وتُوثَّق الاستثناء صراحةً بدل أن تمرّ بصمت.
    const server: string[] = [...TRANSACTION_PATCH_FIELDS];
    const client: string[] = [...PATCHABLE_TRANSACTION_FIELD_NAMES, 'attachments'];
    for (const field of client) {
      assert.ok(server.includes(field), `حقل الواجهة ${field} موجود في عقد الخادم`);
    }
    const onlyOnServer = server.filter((field) => !client.includes(field));
    assert.deepEqual(onlyOnServer, ['importedAt'], 'الاستثناء الموثّق: طابع نظام');
  });
});