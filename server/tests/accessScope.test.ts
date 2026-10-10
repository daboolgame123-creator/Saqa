/**
 * اختبارات Phase 13 — Access Scope وإتاحة الكتب (وحدة).
 *
 * المرجع: `ALSQAYA_PLAN.md` §12 و§28 و§29.
 * - النطاقات الأربعة المعيارية: PublicToEmployees, SpecificEmployees, Administrative, DirectorOnly
 * - قواعد viewer scoping: admin وdirector يرون كل النطاقات
 * - employee يرى PublicToEmployees والكتب المتاحة له صراحة عبر SpecificEmployees
 * - fail-closed لأي دور مجهول أو غائب
 * - بناء شروط SQL النطاقية
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { Request, Response } from 'express';
import {
  ACCESS_SCOPE_VALUES,
  AVAILABILITY_SCOPE,
  DEFAULT_ACCESS_SCOPE,
  EMPLOYEE_DIRECT_SCOPES,
  attachAccessScope,
  isAccessScope,
  transactionScopeFilterFor,
  transactionScopeOf,
} from '../src/authorization';
import { transactionScopeCondition } from '../src/repositories/transactionScopeSql';

describe('Phase 13 — نطاق الرؤية Access Scope (وحدة)', () => {
  test('قيم النطاق هي الأربعة المعتمدة بالضبط (§12)', () => {
    assert.deepEqual(
      [...ACCESS_SCOPE_VALUES].sort(),
      ['Administrative', 'DirectorOnly', 'PublicToEmployees', 'SpecificEmployees'].sort(),
    );
    assert.equal(DEFAULT_ACCESS_SCOPE, 'Administrative');
    assert.equal(AVAILABILITY_SCOPE, 'SpecificEmployees');
    assert.deepEqual([...EMPLOYEE_DIRECT_SCOPES], ['PublicToEmployees']);
  });

  test('isAccessScope يتحقق بدقة ويرفض أي قيمة أخرى', () => {
    assert.equal(isAccessScope('PublicToEmployees'), true);
    assert.equal(isAccessScope('SpecificEmployees'), true);
    assert.equal(isAccessScope('Administrative'), true);
    assert.equal(isAccessScope('DirectorOnly'), true);

    assert.equal(isAccessScope('Public'), false);
    assert.equal(isAccessScope('Private'), false);
    assert.equal(isAccessScope(''), false);
    assert.equal(isAccessScope(null), false);
    assert.equal(isAccessScope(undefined), false);
  });

  test('admin وdirector: يرون كل الكتب (بلا قيد نطاق = null) (§10.1 و§10.2)', () => {
    assert.equal(
      transactionScopeFilterFor({ role: 'admin', employeeId: null }),
      null,
    );
    assert.equal(
      transactionScopeFilterFor({ role: 'admin', employeeId: 'emp-123' }),
      null,
    );
    assert.equal(
      transactionScopeFilterFor({ role: 'director', employeeId: null }),
      null,
    );
    assert.equal(
      transactionScopeFilterFor({ role: 'director', employeeId: 'emp-dir' }),
      null,
    );
  });

  test('employee بلا معرف منتسب: يرى الأعمام العامة فقط (PublicToEmployees) (§9.1)', () => {
    const filter = transactionScopeFilterFor({ role: 'employee', employeeId: null });
    assert.deepEqual(filter, {
      visibilityIn: ['PublicToEmployees'],
    });
  });

  test('employee مع معرف منتسب: يرى PublicToEmployees + المتاح له في SpecificEmployees (§9.3)', () => {
    const filter = transactionScopeFilterFor({ role: 'employee', employeeId: 'emp-789' });
    assert.deepEqual(filter, {
      visibilityIn: ['PublicToEmployees'],
      availableToEmployeeId: 'emp-789',
      availabilityScope: 'SpecificEmployees',
    });
  });

  test('fail-closed: أي دور مجهول أو خارج الخطة يرجع قيداً فارغاً (لا يرى شيئاً)', () => {
    const filter = transactionScopeFilterFor({ role: 'archivist', employeeId: 'emp-arc' });
    assert.deepEqual(filter, { visibilityIn: [] });

    const filterAnon = transactionScopeFilterFor({ role: 'guest', employeeId: null });
    assert.deepEqual(filterAnon, { visibilityIn: [] });
  });

  test('attachAccessScope وtransactionScopeOf: وسيط الطلب وقراءته من locals', () => {
    const handler = attachAccessScope();
    const mockReq: Partial<Request> & { auth?: unknown } = {
      auth: { role: 'employee', employeeId: 'emp-456' },
    };
    const mockRes: Partial<Response> & { locals: Record<string, unknown> } = {
      locals: {},
    };
    mockReq.res = mockRes as Response;

    let nextCalled = false;
    handler(mockReq as Request, mockRes as Response, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.deepEqual(mockRes.locals.accessScope, {
      visibilityIn: ['PublicToEmployees'],
      availableToEmployeeId: 'emp-456',
      availabilityScope: 'SpecificEmployees',
    });

    // transactionScopeOf يقرأ من locals
    const read = transactionScopeOf(mockReq as Request);
    assert.deepEqual(read, mockRes.locals.accessScope);
  });
});

describe('Phase 13 — شرط SQL لنطاق الكتب (transactionScopeCondition)', () => {
  test('شروط النطاق العام + الإتاحة تنشئ SQL متماسكاً وبارامترات صحيحة', () => {
    const params: unknown[] = ['initial'];
    const sql = transactionScopeCondition(
      {
        visibilityIn: ['PublicToEmployees'],
        availableToEmployeeId: 'emp-10',
        availabilityScope: 'SpecificEmployees',
      },
      't',
      params,
    );

    assert.ok(sql.includes('(t.visibility #>> \'{}\') = ANY($2::text[])'));
    assert.ok(sql.includes('transaction_availability a'));
    assert.ok(sql.includes('a.transaction_id = t.id'));
    assert.ok(sql.includes('a.revoked_at IS NULL'));
    assert.deepEqual(params, ['initial', ['PublicToEmployees'], 'SpecificEmployees', 'emp-10']);
  });

  test('قيد فارغ ينتج FALSE لمنع قراءة أي سجل (fail-closed)', () => {
    const params: unknown[] = [];
    const sql = transactionScopeCondition({ visibilityIn: [] }, 't', params);
    assert.equal(sql, 'FALSE');
    assert.equal(params.length, 0);
  });
});
