/** Phase 23/C1c-S1 — direct book builder must fail closed before SQL.
 * Synthetic contexts only; no DB, network or institutional data.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reportAccessFor, ReportScopeNotReadyError } from '../src/authorization/reportAccess';
import { buildTransactionsQuery, PgReportRepository } from '../src/repositories/reportRepository';
import { ReportApiService } from '../src/api/services/reportService';
import type { ReportAccessContext } from '../src/repositories/contracts';

const bookTypes = ['monthly', 'incoming', 'outgoing', 'situation'] as const;
const employee = reportAccessFor({ role: 'employee', employeeId: 'synthetic-employee-a' });
const admin = reportAccessFor({ role: 'admin', employeeId: null });
const director = reportAccessFor({ role: 'director', employeeId: null });

test('C1c-S1: all four employee book SQL builders reject direct calls before producing SQL', () => {
  for (const reportType of bookTypes) {
    for (const access of [
      employee,
      { ...employee, transactionScope: null },
      { ...employee, transactionScope: { visibilityIn: ['Administrative'] } },
      { ...employee, transactionScope: { visibilityIn: ['PublicToEmployees'], availableToEmployeeId: 'synthetic-employee-b', excludeDailySituations: true } },
      { ...employee, transactionScope: { ...employee.transactionScope, excludeDailySituations: false } },
      { ...employee, employeeId: 'synthetic-employee-b' },
      { ...employee, personnelScope: { kind: 'all' } },
      { ...employee, requestScope: { kind: 'all' } },
      undefined,
    ]) {
      const params: unknown[] = [];
      assert.throws(
        () => buildTransactionsQuery(reportType, { reportType }, params, access as ReportAccessContext, 'Asia/Baghdad'),
        access === undefined
          ? /Report access context is required/
          : ReportScopeNotReadyError,
        reportType,
      );
      assert.deepEqual(params, [], 'authorization must run before any SQL parameters are prepared');
    }
  }
});

test('C1c-S1: invalid privileged scopes cannot bypass direct builder authorization', () => {
  for (const reportType of bookTypes) {
    for (const forged of [
      { ...admin, transactionScope: { visibilityIn: ['PublicToEmployees'] } },
      { ...director, personnelScope: { kind: 'owner', employeeId: 'synthetic-employee-a' } },
      { ...admin, requestScope: { kind: 'owner', ownerEmployeeId: 'synthetic-employee-a' } },
    ]) {
      assert.throws(
        () => buildTransactionsQuery(reportType, { reportType }, [], forged as ReportAccessContext, null),
        /inconsistent/,
      );
    }
    const query = buildTransactionsQuery(reportType, { reportType }, [], admin, null);
    assert.ok(query.sql.includes('t.deleted_at IS NULL'));
    assert.ok(query.sql.includes('t.is_daily_situation = false'));
    assert.ok(query.sql.includes('TRUE'), 'administrative report continues to be unscoped');
    assert.ok(buildTransactionsQuery(reportType, { reportType }, [], director, null).sql.includes('TRUE'));
  }
});

test('C1c-S1: service and direct repository reject unapproved book report reads and exports with zero DB calls', async () => {
  let reads = 0;
  let connects = 0;
  const repository = new PgReportRepository({
    async query() { reads++; throw new Error('UNAUTHORIZED_QUERY'); },
    async connect() { connects++; throw new Error('UNAUTHORIZED_CONNECT'); },
  } as never, 'Asia/Baghdad');
  const service = new ReportApiService(repository);
  for (const reportType of bookTypes) {
    const filter = { reportType };
    await assert.rejects(repository.list(reportType, filter, employee), ReportScopeNotReadyError);
    await assert.rejects(service.run(filter, employee), ReportScopeNotReadyError);
    await assert.rejects(service.export(filter, employee, 'excel'), ReportScopeNotReadyError);
    await assert.rejects(service.export(filter, employee, 'pdf'), ReportScopeNotReadyError);
  }
  assert.equal(reads, 0);
  assert.equal(connects, 0);
});

test('C1c-S1: document-date filter remains safely parameterized for authorized admin', () => {
  const injected = "2020-01-01' OR TRUE --";
  const query = buildTransactionsQuery(
    'incoming', { reportType: 'incoming', documentDateFrom: injected },
    [], admin, null,
  );
  assert.ok(query.sql.includes('t.document_date >= $1::date'));
  assert.ok(!query.sql.includes(injected));
  assert.deepEqual(query.params, [injected]);
});
