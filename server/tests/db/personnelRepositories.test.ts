/**
 * اختبارات Phase 9 — مستودعات شؤون المنتسبين والموقف اليومي + أدوات التواريخ.
 * بيانات اصطناعية فقط داخل القاعدة المعزولة.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  deriveMonth,
  isValidDateOnly,
  isValidTimeOfDay,
  localDateOnly,
  normalizeTimeOfDay,
} from '../../src/database/dateTime';
import { PgAssignmentRepository } from '../../src/repositories/assignmentRepository';
import { PgCourseRepository } from '../../src/repositories/courseRepository';
import { PgDailySituationRepository } from '../../src/repositories/dailySituationRepository';
import { PgEmployeeRepository } from '../../src/repositories/employeeRepository';
import { PgLeaveRepository } from '../../src/repositories/leaveRepository';
import { PgTimePermissionRepository } from '../../src/repositories/timePermissionRepository';
import { PgTransactionRepository } from '../../src/repositories/transactionRepository';
import { resetDomainTables, startTestDatabase, stopTestDatabase } from './testDb';

describe('Phase 9 — مستودعات شؤون المنتسبين والموقف اليومي', () => {
  let pool: Pool;
  let employees: PgEmployeeRepository;
  let transactions: PgTransactionRepository;
  let leaves: PgLeaveRepository;
  let timePermissions: PgTimePermissionRepository;
  let assignments: PgAssignmentRepository;
  let courses: PgCourseRepository;
  let situations: PgDailySituationRepository;
  let employeeId: string;

  before(async () => {
    ({ pool } = await startTestDatabase());
    employees = new PgEmployeeRepository(pool);
    transactions = new PgTransactionRepository(pool);
    leaves = new PgLeaveRepository(pool);
    timePermissions = new PgTimePermissionRepository(pool);
    assignments = new PgAssignmentRepository(pool);
    courses = new PgCourseRepository(pool);
    situations = new PgDailySituationRepository(pool);
  });

  after(async () => {
    await stopTestDatabase();
  });

  beforeEach(async () => {
    await resetDomainTables(pool);
    employeeId = (await employees.create({
      name: 'منتسب الاختبارات',
      title: 'منصب',
      department: 'قسم تجريبي',
    })).id;
  });

  describe('سجلات الإجازات', () => {
    it('إنشاء وقراءة مع الافتراضي isPaid=true وقائمة بالحالة', async () => {
      const created = await leaves.create({
        employeeId,
        type: 'annual',
        startDate: '2026-06-01',
        endDate: '2026-06-05',
        status: 'registered',
      });
      assert.equal(created.isPaid, true);
      const found = await leaves.findById(created.id);
      assert.ok(found !== null);
      assert.equal(found.startDate, '2026-06-01');
      assert.equal(found.type, 'annual');
      const listed = await leaves.list({ employeeId, status: 'registered' });
      assert.equal(listed.length, 1);
    });

    it('التعديل يغيّر الحالة (إلغاء) ويرفض تواريخ متناقضة', async () => {
      const created = await leaves.create({
        employeeId,
        type: 'sick',
        startDate: '2026-06-10',
        endDate: '2026-06-12',
        days: 3,
        status: 'pending_approval',
      });
      const cancelled = await leaves.update(created.id, { status: 'cancelled' });
      assert.ok(cancelled !== null);
      assert.equal(cancelled.status, 'cancelled');
      await assert.rejects(
        () => leaves.update(created.id, { startDate: '2026-07-01' }),
        (error: unknown) =>
          error !== null && typeof error === 'object' && (error as { code?: string }).code === '23514',
      );
    });
  });

  describe('الأذونات الزمنية', () => {
    it('قراءة الوقت بعد تطبيعها HH:mm والمدة بالدقائق تبقى كما سُلِّمت', async () => {
      const created = await timePermissions.create({
        employeeId,
        date: '2026-07-01',
        timeOut: '14:30',
        durationMinutes: 45,
        reason: 'معاملة شخصية',
        status: 'registered',
      });
      assert.equal(created.timeOut, '14:30');
      assert.equal(created.durationMinutes, 45);
      const found = await timePermissions.findById(created.id);
      assert.ok(found !== null);
      assert.equal(found.timeOut, '14:30');
      assert.equal(found.timeIn, undefined);
      assert.equal(found.reason, 'معاملة شخصية');
      const listed = await timePermissions.list({ employeeId, date: '2026-07-01' });
      assert.equal(listed.length, 1);
    });

    it('التعديل يحدّث وقت العودة والحالة', async () => {
      const created = await timePermissions.create({
        employeeId,
        date: '2026-07-02',
        timeOut: '15:00',
        status: 'registered',
      });
      const updated = await timePermissions.update(created.id, {
        timeIn: '16:15',
        status: 'approved',
      });
      assert.ok(updated !== null);
      assert.equal(updated.timeIn, '16:15');
      assert.equal(updated.status, 'approved');
    });
  });

  describe('التكليفات', () => {
    it('إنشاء وقراءة وتعديل حالة', async () => {
      const created = await assignments.create({
        employeeId,
        type: 'delegation',
        entity: 'مركز الدراسات',
        startDate: '2026-08-01',
        endDate: '2026-08-20',
        status: 'registered',
      });
      assert.equal(created.type, 'delegation');
      const updated = await assignments.update(created.id, { status: 'in_progress' });
      assert.ok(updated !== null);
      assert.equal(updated.status, 'in_progress');
      const listed = await assignments.list({ employeeId, status: 'in_progress' });
      assert.equal(listed.length, 1);
      await assert.rejects(
        () => assignments.create({
          employeeId,
          type: 'other',
          entity: 'جهة',
          startDate: '2026-09-10',
          endDate: '2026-09-01',
          status: 'registered',
        }),
        (error: unknown) =>
          error !== null && typeof error === 'object' && (error as { code?: string }).code === '23514',
      );
    });
  });

  describe('الدورات', () => {
    it('إنشاء بلا تواريخ (حسب النموذج) وتعديل المشاركة', async () => {
      const created = await courses.create({
        employeeId,
        name: 'دورة تجريبية',
        organizer: 'الجهاز المركزي',
        participationType: 'trainee',
        participationStatus: 'registered',
      });
      assert.equal(created.startDate, undefined);
      const updated = await courses.update(created.id, {
        participationStatus: 'completed',
        startDate: '2026-10-01',
        endDate: '2026-10-03',
      });
      assert.ok(updated !== null);
      assert.equal(updated.participationStatus, 'completed');
      assert.equal(updated.endDate, '2026-10-03');
      const listed = await courses.list({ employeeId, participationType: 'trainee' });
      assert.equal(listed.length, 1);
    });
  });

  describe('الموقف اليومي', () => {
    it('الرابط polymorphic يُكتب في عموده ويُقرأ كـ{kind,id}', async () => {
      const transaction = await transactions.create({
        number: '2026/400',
        sequence: '400',
        date: '2026-09-01',
        direction: 'داخلي',
        category: 'إدارية',
        subType: 'نوع',
        entity: 'جهة',
        subject: 'كتاب الموقف',
        status: 'قيد المراجعة',
      });
      const created = await situations.create({
        employeeId,
        date: '2026-09-01',
        category: 'permanent_leaves',
        timeOrDuration: '8:30-10:00',
        reason: 'استئذان مسجل',
        relatedRecord: { kind: 'transaction', id: transaction.id },
      });
      const found = await situations.findById(created.id);
      assert.ok(found !== null);
      assert.deepEqual(found.relatedRecord, { kind: 'transaction', id: transaction.id });
      assert.equal(found.category, 'permanent_leaves');
      assert.match(found.createdAt ?? '', /^\d{4}-\d{2}-\d{2}T.*Z$/);
    });

    it('استبدال الرابط يصفّر هدفه السابق (رابط واحد كحد أقصى)', async () => {
      const transaction = await transactions.create({
        number: '2026/401',
        sequence: '401',
        date: '2026-09-02',
        direction: 'صادر',
        category: 'إدارية',
        subType: 'نوع',
        entity: 'جهة',
        subject: 'كتاب أول',
        status: 'قيد المراجعة',
      });
      const leave = await leaves.create({
        employeeId,
        type: 'excuse',
        startDate: '2026-09-02',
        endDate: '2026-09-02',
        status: 'approved',
      });
      const created = await situations.create({
        employeeId,
        date: '2026-09-02',
        category: 'temporary_leaves',
        relatedRecord: { kind: 'transaction', id: transaction.id },
      });
      const updated = await situations.update(created.id, {
        relatedRecord: { kind: 'leave', id: leave.id },
      });
      assert.ok(updated !== null);
      assert.deepEqual(updated.relatedRecord, { kind: 'leave', id: leave.id });
      const listed = await situations.list({ employeeId, date: '2026-09-02' });
      assert.equal(listed.length, 1);
    });

    it('قائمة تفلتر بالقسم والفئة', async () => {
      await situations.create({
        employeeId,
        date: '2026-09-03',
        category: 'temporary_time_permissions',
      });
      const filtered = await situations.list({ category: 'temporary_time_permissions' });
      assert.equal(filtered.length, 1);
      assert.equal((await situations.list({ category: 'permanent_shift_changes' })).length, 0);
    });
  });

  describe('أدوات استراتيجية التواريخ', () => {
    it('تحقق التواريخ والأوقات والاشتقاقات', () => {
      assert.equal(isValidDateOnly('2026-02-29'), false);
      assert.equal(isValidDateOnly('2028-02-29'), true);
      assert.equal(isValidDateOnly('2026-13-01'), false);
      assert.equal(isValidTimeOfDay('23:59'), true);
      assert.equal(isValidTimeOfDay('24:00'), false);
      assert.equal(deriveMonth('2026-12-31'), '2026-12');
      assert.equal(normalizeTimeOfDay('09:05:00'), '09:05');
      assert.match(localDateOnly(), /^\d{4}-\d{2}-\d{2}$/);
      assert.throws(() => deriveMonth('bad-date'), /غير صالح/);
    });
  });
});
