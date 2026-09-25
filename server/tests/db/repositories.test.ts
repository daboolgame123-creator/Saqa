/**
 * اختبارات Phase 9 — CRUD المستودعات الفعلية على PostgreSQL:
 * الموظفون، المعاملات (كتاب+روابط+مرفقات ذرياً)، جدول الروابط.
 * كل البيانات اصطناعية داخل قاعدة alsqaya_test المعزولة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { PgEmployeeRepository } from '../../src/repositories/employeeRepository';
import { PgTransactionRepository } from '../../src/repositories/transactionRepository';
import { PgTransactionEmployeeRepository } from '../../src/repositories/transactionEmployeeRepository';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

/** يتحقق رمز خطأ PostgreSQL المتوقع. */
async function expectCode(operation: () => Promise<unknown>, code: string): Promise<void> {
  await assert.rejects(operation, (error: unknown) => {
    assert.ok(error !== null && typeof error === 'object' && 'code' in error);
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
}

describe('Phase 9 — مستودعات الموظفين والمعاملات على PostgreSQL', () => {
  let pool: Pool;
  let employees: PgEmployeeRepository;
  let transactions: PgTransactionRepository;
  let links: PgTransactionEmployeeRepository;

  before(async () => {
    ({ pool } = await startTestDatabase());
    employees = new PgEmployeeRepository(pool);
    transactions = new PgTransactionRepository(pool);
    links = new PgTransactionEmployeeRepository(pool);
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
  });

  describe('الموظفون', () => {
    it('إنشاء وقراءة بحقول مطابقة للنموذج مع الحالة الافتراضية active', async () => {
      const created = await employees.create({
        name: 'منتسب تجريبي',
        title: 'أخصائي أول',
        department: 'الشؤون الإدارية',
        badgeNumber: 'T-100',
        category: 'منتسب',
        joinedDate: '2025-09-01',
      });
      assert.equal(created.status, 'active');
      assert.match(created.id, /^[0-9a-f-]{36}$/);
      assert.match(created.createdAt, /^\d{4}-\d{2}-\d{2}T.*Z$/);

      const found = await employees.findById(created.id);
      assert.ok(found !== null);
      assert.equal(found.name, 'منتسب تجريبي');
      assert.equal(found.title, 'أخصائي أول');
      assert.equal(found.badgeNumber, 'T-100');
      assert.equal(found.category, 'منتسب');
      assert.equal(found.joinedDate, '2025-09-01');
      assert.equal(await employees.findById('00000000-0000-0000-0000-000000000009'), null);
    });

    it('تعديل جزئي يحدّث المذكور فقط ويترك الباقي', async () => {
      const created = await employees.create({
        name: 'منتسب للتعديل',
        title: 'منصب',
        department: 'القديم',
      });
      const updated = await employees.update(created.id, { department: 'الجديد' });
      assert.ok(updated !== null);
      assert.equal(updated.department, 'الجديد');
      assert.equal(updated.title, 'منصب');
      assert.notEqual(updated.updatedAt, '');
      assert.equal(await employees.update('00000000-0000-0000-0000-000000000009', { department: 'أ' }), null);
    });

    it('القائمة تفلتر بالحالة وتدور البحث بالاسم', async () => {
      await employees.create({ name: 'أحمد تجريبي', title: 'منصب', department: 'قسم' });
      const second = await employees.create({ name: 'خالد تجريبي', title: 'منصب', department: 'قسم' });
      assert.equal((await employees.list({ status: 'active' })).length, 2);
      await employees.changeStatus(second.id, { status: 'former', serviceEndReason: 'تقاعد' });
      const former = await employees.list({ status: 'former' });
      assert.equal(former.length, 1);
      assert.equal(former[0].id, second.id);
      const searched = await employees.list({ search: 'أحمد' });
      assert.equal(searched.length, 1);
      assert.equal(searched[0].name, 'أحمد تجريبي');
    });

    it('تغيير الحالة يكتب السجل التاريخي في نفس اللحظة', async () => {
      const created = await employees.create({ name: 'موظف تاريخ', title: 'منصب', department: 'قسم' });
      const result = await employees.changeStatus(created.id, {
        status: 'former',
        serviceEndReason: 'انفصال',
        notes: 'انتهت العلاقة التعاقدية',
      });
      assert.ok(result !== null);
      assert.equal(result.employee.status, 'former');
      assert.equal(result.history.status, 'former');
      assert.equal(result.history.serviceEndReason, 'انفصال');
      assert.equal(result.history.employeeId, created.id);
      const history = await employees.listStatusHistory(created.id);
      assert.equal(history.length, 1);
    });

    it('نقل إلى سابق بلا سبب يُرفض والتغيير كله يرجع (لا نصف حالة)', async () => {
      const created = await employees.create({ name: 'موظف سبب', title: 'منصب', department: 'قسم' });
      await expectCode(
        () => employees.changeStatus(created.id, { status: 'former' }),
        '23514',
      );
      const afterAttempt = await employees.findById(created.id);
      assert.ok(afterAttempt !== null);
      assert.equal(afterAttempt.status, 'active');
      assert.equal((await employees.listStatusHistory(created.id)).length, 0);
    });

    it('تغيير حالة معرف مجهول يعيد null دون خطأ', async () => {
      const result = await employees.changeStatus('00000000-0000-0000-0000-000000000009', {
        status: 'former',
        serviceEndReason: 'تقاعد',
      });
      assert.equal(result, null);
    });
  });

  describe('المعاملات (الكتب)', () => {
    /** ينشئ موظفاً وكتاباً أساسياً للاختبارات. */
    async function createBook(): Promise<{ employeeId: string; transactionId: string }> {
      const employee = await employees.create({
        name: 'موظف الكتاب',
        title: 'منصب',
        department: 'قسم',
      });
      const transaction = await transactions.create({
        number: '2026/120',
        sequence: '120',
        date: '2026-03-09',
        direction: 'صادر',
        category: 'إدارية',
        subType: 'مراسلة',
        entity: 'الجهة المركزية',
        subject: 'موضوع تجريبي',
        status: 'قيد المراجعة',
        employeeLinks: [{ employeeId: employee.id, relationshipType: 'subject' }],
        attachments: [
          { name: 'scan.png', type: 'صورة وثيقة', fileSize: '1.2 MB', uploadDate: '2026-03-09' },
        ],
      });
      return { employeeId: employee.id, transactionId: transaction.id };
    }

    it('إنشاء ذرّي: كتاب + رابط + مرفق مع شهر مشتق من التاريخ', async () => {
      const { employeeId, transactionId } = await createBook();
      const found = await transactions.findById(transactionId);
      assert.ok(found !== null);
      assert.equal(found.number, '2026/120');
      assert.equal(found.date, '2026-03-09');
      assert.equal(found.month, '2026-03');
      assert.deepEqual(found.employeeIds, [employeeId]);
      assert.equal(found.attachments.length, 1);
      assert.equal(found.attachments[0].name, 'scan.png');
      assert.equal(found.attachments[0].fileSize, '1.2 MB');
      assert.equal(found.importedAt, null);
      assert.equal(found.isDailySituation, false);
    });

    it('فشل رابط موظف مجهول يرجّع الإنشاء كاملاً (لا كتاب يتيم)', async () => {
      await expectCode(
        () => transactions.create({
          number: '2026/999',
          sequence: '999',
          date: '2026-03-09',
          direction: 'وارد',
          category: 'مالية',
          subType: 'نوع',
          entity: 'جهة',
          subject: 'موضوع فاشل',
          status: 'قيد المراجعة',
          employeeLinks: [{ employeeId: '00000000-0000-0000-0000-000000000009' }],
        }),
        '23503',
      );
      const count = await pool.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM transactions`,
      );
      assert.equal(count.rows[0].count, '0');
    });

    it('القائمة تفلتر بالشهر والحالة', async () => {
      await createBook();
      await transactions.create({
        number: '2026/200',
        sequence: '200',
        date: '2026-04-02',
        direction: 'داخلي',
        category: 'أخرى',
        subType: 'نوع',
        entity: 'جهة',
        subject: 'كتاب أبريل',
        status: 'مكتمل',
      });
      const march = await transactions.list({ month: '2026-03' });
      assert.equal(march.length, 1);
      const completed = await transactions.list({ status: 'مكتمل' });
      assert.equal(completed.length, 1);
      assert.equal(completed[0].subject, 'كتاب أبريل');
      assert.equal((await transactions.list()).length, 2);
    });

    it('التعديل يحدّث الحقول ويعيد اشتقاق الشهر مع تغيير التاريخ', async () => {
      const { transactionId } = await createBook();
      const updated = await transactions.update(transactionId, {
        subject: 'موضوع محدث',
        status: 'مكتمل',
        date: '2026-04-15',
      });
      assert.ok(updated !== null);
      assert.equal(updated.subject, 'موضوع محدث');
      assert.equal(updated.status, 'مكتمل');
      assert.equal(updated.date, '2026-04-15');
      assert.equal(updated.month, '2026-04');
      assert.equal(
        await transactions.update('00000000-0000-0000-0000-000000000009', { subject: 'أ' }),
        null,
      );
    });
  });

  describe('روابط الكتاب بالمنتسبين', () => {
    it('إضافة وقائمة وتعديل وحذف الرابط وحده', async () => {
      const first = await employees.create({ name: 'موظف أول', title: 'منصب', department: 'قسم' });
      const second = await employees.create({ name: 'موظف ثانٍ', title: 'منصب', department: 'قسم' });
      const transaction = await transactions.create({
        number: '2026/300',
        sequence: '300',
        date: '2026-05-01',
        direction: 'صادر',
        category: 'منتسبين',
        subType: 'نوع',
        entity: 'جهة',
        subject: 'موضوع الروابط',
        status: 'قيد المراجعة',
        employeeLinks: [{ employeeId: first.id, relationshipType: 'subject' }],
      });

      const added = await links.add({
        transactionId: transaction.id,
        employeeId: second.id,
        relationshipType: 'recipient',
        notes: 'مستلم التنبيه',
      });
      assert.equal((await links.listByTransaction(transaction.id)).length, 2);
      assert.equal((await links.listByEmployee(second.id)).length, 1);

      const updatedLink = await links.update(added.id, { relationshipType: 'beneficiary' });
      assert.ok(updatedLink !== null);
      assert.equal(updatedLink.relationshipType, 'beneficiary');
      assert.equal(updatedLink.notes, 'مستلم التنبيه');

      assert.equal(await links.remove(added.id), true);
      assert.equal(await links.remove('00000000-0000-0000-0000-000000000009'), false);
      const remaining = await links.listByTransaction(transaction.id);
      assert.equal(remaining.length, 1);
      assert.equal(remaining[0].employeeId, first.id);
    });
  });
});
