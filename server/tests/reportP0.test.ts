/** Phase 23/P0: in-process transport and fake DB only; no listener or connection. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import net from 'node:net';
import type { Request, RequestHandler, Response } from 'express';
import { Client } from 'pg';
import { ReportApiService } from '../src/api/services/reportService';
import { createApiRepositories, createApiServices } from '../src/api/services';
import { PgReportRepository } from '../src/repositories';
import { ReportNotImplementedError } from '../src/repositories/reportRepository';
import type { ReportFilter, ReportRepository, ReportType } from '../src/repositories/contracts';
import { reportAccessFor, ReportScopeNotReadyError } from '../src/authorization/reportAccess';
import { RoleDeniedError } from '../src/authorization/authorizationErrors';
import { reportQuery, REPORT_TYPES, reportStatusOptions } from '../src/api/validation/reportValidators';
import { validateApiRequest } from '../src/api/validation/validateApiRequest';
import { reportController } from '../src/api/controllers/reportController';
import { createReportRouter } from '../src/api/routes/reportRoutes';
import { ValidationError } from '../src/errors';
import {
  EMPLOYEE_STATUSES, LEAVE_STATUSES, REQUEST_STATUSES, TIME_PERMISSION_STATUSES,
  TRANSACTION_DIRECTIONS, TRANSACTION_STATUSES,
} from '../src/api/validation/catalogs';

const adminAccess = reportAccessFor({ role: 'admin', employeeId: null });
const directorAccess = reportAccessFor({ role: 'director', employeeId: null });
const employeeAccess = reportAccessFor({ role: 'employee', employeeId: 'employee-1' });
const filter: ReportFilter = {
  reportType: 'monthly', dateFrom: '2026-01-01', dateTo: '2026-01-31',
  section: 'القسم', type: TRANSACTION_DIRECTIONS[0], employee: 'employee-1',
  status: reportStatusOptions('monthly')[0], source: 'المصدر',
};
const raw = { ...filter, section: '  القسم  ', source: '  المصدر  ', status: ` ${filter.status} ` };

test('isolated preload rejects network and real DB calls before connecting', {
  skip: process.env.ALSQAYA_P0_ISOLATED !== '1',
}, () => {
  const socket = new net.Socket();
  const db = new Client({ connectionString: 'postgres://unused:unused@127.0.0.1:1/unused' });
  assert.throws(() => socket.connect(1, '127.0.0.1'), /P0 isolation/);
  assert.throws(() => db.connect(), /P0 isolation/);
  assert.throws(() => db.query('SELECT 1'), /P0 isolation/);
  socket.destroy();
});

test('reportType is required and must be a single known string', () => {
  for (const input of [{}, ...[undefined, null, '', ' ', 'unknown', ['monthly'], {}].map(reportType => ({ reportType }))]) {
    assert.equal(reportQuery(input).kind, 'invalid');
  }
  for (const reportType of REPORT_TYPES) {
    assert.deepEqual(reportQuery({ reportType }), { kind: 'valid', value: { reportType } });
  }
});

test('all normalized filters survive; blank optional fields are omitted', () => {
  assert.deepEqual(reportQuery(raw), { kind: 'valid', value: filter });
  assert.equal(raw.section, '  القسم  ');
  assert.deepEqual(reportQuery({ reportType: 'monthly', dateFrom: '', dateTo: '', section: '', type: '', employee: '', status: '', source: '' }), {
    kind: 'valid', value: { reportType: 'monthly' },
  });
});

test('invalid dates, reversed range, types, shapes and unknown filters are rejected', () => {
  for (const input of [
    null, [], 'monthly',
    { ...filter, dateFrom: '2026-02-30' },
    { ...filter, dateFrom: '2026-02-01' },
    { ...filter, type: 'unknown' },
    { ...filter, type: ['وارد'] },
    { ...filter, employee: {} },
    { ...filter, unexpected: 'value' },
  ]) assert.equal(reportQuery(input).kind, 'invalid');
  for (const dates of [{ dateFrom: '2026-01-01' }, { dateTo: '2026-01-01' }, { dateFrom: '2026-01-01', dateTo: '2026-01-01' }]) {
    assert.deepEqual(reportQuery({ reportType: 'monthly', ...dates }), {
      kind: 'valid', value: { reportType: 'monthly', ...dates },
    });
  }
  assert.equal(reportQuery({ ...filter, type: ` ${filter.type} ` }).kind, 'valid');
});

test('status uses the resource catalogue, including book situation and employee status', () => {
  const expected: Record<ReportType, readonly string[]> = {
    monthly: TRANSACTION_STATUSES, incoming: TRANSACTION_STATUSES, outgoing: TRANSACTION_STATUSES,
    circularsAndAcknowledgements: TRANSACTION_STATUSES, situation: TRANSACTION_STATUSES,
    leaves: LEAVE_STATUSES, timePermissions: TIME_PERMISSION_STATUSES,
    requests: REQUEST_STATUSES, employees: EMPLOYEE_STATUSES, researchers: [], professors: [],
  };
  for (const reportType of REPORT_TYPES) {
    assert.deepEqual(reportStatusOptions(reportType), expected[reportType]);
    for (const status of expected[reportType]) {
      assert.deepEqual(reportQuery({ reportType, status: ` ${status} ` }), {
        kind: 'valid', value: { reportType, status },
      });
    }
    for (const status of ['not-a-status', [], {}, null]) {
      assert.equal(reportQuery({ reportType, status }).kind, 'invalid');
    }
  }
  assert.equal(reportQuery({ reportType: 'situation', status: 'غير مكتمل' }).kind, 'invalid');
  assert.equal(reportQuery({ reportType: 'employees', status: 'active' }).kind, 'valid');
  assert.equal(reportQuery({ reportType: 'monthly', status: 'active' }).kind, 'invalid');
  assert.equal(reportQuery({ reportType: 'professors', status: 'active' }).kind, 'invalid');
  assert.equal(reportQuery({ reportType: 'researchers', status: 'active' }).kind, 'invalid');
});

/** Minimal transport doubles; the real middleware/controller/router execute in-process. */
function dispatch(handler: RequestHandler, query: unknown, locals: Record<string, unknown>, method = 'GET', url = '/') {
  return new Promise<{ status: number; body: unknown }>((resolve, reject) => {
    let status = 200;
    const res = {
      locals,
      status(code: number) { status = code; return res; },
      json(body: unknown) { resolve({ status, body }); return res; },
    } as unknown as Response;
    const req = { query, method, url, headers: {}, auth: locals.testAuth, res } as unknown as Request;
    try {
      handler(req, res, error => reject(error ?? new Error('Unexpected fallthrough')));
    } catch (error) { reject(error); }
  });
}

test('middleware and controller pass the normalized object and scope to Service', { timeout: 5000 }, async t => {
  const access = reportAccessFor({ role: 'admin', employeeId: null });
  const calls: unknown[][] = [];
  const repo: ReportRepository = { async list(...args) { calls.push(args); return []; } };
  const service = new ReportApiService(repo);
  const run = t.mock.method(service, 'run');
  const validate = validateApiRequest({ query: { validator: reportQuery } });
  const handler: RequestHandler = (req, res, next) => {
    validate(req, res, error => {
      if (error) return next(error);
      reportController(req, res, next);
    });
  };
  const locals = { apiServices: { report: service }, testAuth: { role: 'admin', employeeId: null } };
  const result = await dispatch(handler, raw, locals);
  assert.equal(result.status, 200);
  assert.equal(run.mock.callCount(), 1);
  assert.deepEqual(run.mock.calls[0].arguments, [filter, access]);
  assert.deepEqual(calls, [['monthly', filter, access]]);
  assert.deepEqual(result.body, {
    rows: [], summary: {
      totalCount: 0, period: '2026-01-01 إلى 2026-01-31',
      appliedFilters: {
        'نوع التقرير': 'monthly', 'التاريخ من': filter.dateFrom, 'التاريخ إلى': filter.dateTo,
        'القسم': filter.section, 'النوع': filter.type, 'المنتسب': filter.employee,
        'الحالة': filter.status, 'المصدر': filter.source,
      },
      generatedAt: (result.body as { summary: { generatedAt: string } }).summary.generatedAt,
    },
  });
  for (const invalid of [{}, { reportType: 'monthly', status: 'active' }]) {
    await assert.rejects(dispatch(handler, invalid, locals), ValidationError);
  }
  assert.equal(run.mock.callCount(), 1);
  assert.equal(calls.length, 1);
  await dispatch(handler, raw, { ...locals, testAuth: { role: 'director', employeeId: null } });
  assert.deepEqual(run.mock.calls[1].arguments, [filter, directorAccess]);
  assert.deepEqual(calls[1], ['monthly', filter, directorAccess]);
  await assert.rejects(dispatch(handler, raw, { ...locals, testAuth: undefined }), RoleDeniedError);
  await assert.rejects(dispatch(handler, raw, { ...locals, testAuth: { role: 'archivist', employeeId: null } }), RoleDeniedError);
  assert.equal(run.mock.callCount(), 2, 'Unauthorized requests must never reach the service');
});

test('repository barrel and service factory use PgReportRepository without connecting', { timeout: 5000 }, async t => {
  const db = new Client({ connectionString: 'postgres://unused:unused@127.0.0.1:1/unused' });
  t.mock.method(db, 'connect', () => { throw new Error('DB connections forbidden'); });
  const query = t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] }));
  const repositories = createApiRepositories(db);
  assert.ok(repositories.report instanceof PgReportRepository);
  const services = createApiServices(db);
  assert.ok(services.report instanceof ReportApiService);
  assert.equal(query.mock.callCount(), 0);
  for (const reportType of ['monthly', 'incoming', 'outgoing', 'requests', 'employees', 'leaves', 'timePermissions'] satisfies ReportType[]) {
    const status = reportStatusOptions(reportType)[0];
    await services.report.run({ reportType, status }, adminAccess);
    assert.deepEqual(query.mock.calls.at(-1)?.arguments[1], status ? [status] : []);
    await services.report.run({ reportType }, adminAccess);
    assert.deepEqual(query.mock.calls.at(-1)?.arguments[1], []);
  }
  assert.equal(query.mock.callCount(), 14);
  for (const reportType of ['researchers', 'professors', 'situation', 'circularsAndAcknowledgements'] satisfies ReportType[]) {
    await assert.rejects(services.report.run({ reportType }, adminAccess), ReportNotImplementedError);
  }
  assert.equal(query.mock.callCount(), 14, 'Unimplemented reports must not query or return empty success');
  await assert.rejects(services.report.run({ reportType: 'monthly' }, undefined as never), /Report access context is required/);
  assert.equal(query.mock.callCount(), 14, 'Missing access context must fail before SQL');
});

test('P1b access is session-derived, independent for each source, and fail-closed', async () => {
  assert.deepEqual(adminAccess, {
    role: 'admin', employeeId: null, transactionScope: null,
    personnelScope: { kind: 'all' }, requestScope: { kind: 'all' },
  });
  assert.deepEqual(directorAccess, { ...adminAccess, role: 'director' });
  assert.equal(employeeAccess.role, 'employee');
  assert.deepEqual(employeeAccess.personnelScope, { kind: 'owner', employeeId: 'employee-1' });
  assert.deepEqual(employeeAccess.requestScope, { kind: 'owner', ownerEmployeeId: 'employee-1' });
  assert.deepEqual(employeeAccess.transactionScope, {
    visibilityIn: ['PublicToEmployees'], availableToEmployeeId: 'employee-1',
    availabilityScope: 'SpecificEmployees', excludeDailySituations: true,
  });
  for (const viewer of [undefined, { role: 'archivist', employeeId: 'employee-1' },
    { role: 'employee', employeeId: null }, { role: 'employee', employeeId: '   ' }]) {
    assert.throws(() => reportAccessFor(viewer), RoleDeniedError);
  }
  let reads = 0;
  const service = new ReportApiService({ async list() { reads++; return []; } });
  const db = { query: async () => { reads++; return { rows: [] }; } };
  const repository = new PgReportRepository(db as never);
  // Every report type is currently blocked for employees until SQL ownership
  // and availability restrictions are proven, even when a filter names another employee.
  for (const reportType of REPORT_TYPES) {
    await assert.rejects(service.run({ reportType, employee: 'someone-else' }, employeeAccess), ReportScopeNotReadyError);
    await assert.rejects(repository.list(reportType, { reportType }, employeeAccess), ReportScopeNotReadyError);
  }
  await assert.rejects(service.run(filter, {} as never), /Report access context is required/);
  await assert.rejects(repository.list('monthly', filter, undefined as never), /Report access context is required/);
  await assert.rejects(service.run(filter, { ...adminAccess, transactionScope: { visibilityIn: [] } } as never), /Privileged report access context is inconsistent/);
  assert.equal(reads, 0, 'No unauthorized employee or malformed-context access can read SQL');
});

test('every report router method/path stays blocked before services are accessed', { timeout: 5000 }, async () => {
  let accesses = 0;
  const locals = {
    get apiServices() { accesses++; throw new Error('Report services must not be accessed'); },
  };
  const router = createReportRouter();
  for (const method of ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']) {
    for (const url of ['/', '/export', '/nested/path']) {
      const result = await dispatch(router, filter, locals, method, url);
      assert.deepEqual(result, {
        status: 503,
        body: { error: { code: 'REPORTS_UNAVAILABLE', message: 'التقارير غير متاحة حالياً.' } },
      });
    }
  }
  assert.equal(accesses, 0);
});
