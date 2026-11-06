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
  type: TRANSACTION_DIRECTIONS[0], employee: 'employee-1',
  status: reportStatusOptions('monthly')[0],
};
const raw = { ...filter, status: ` ${filter.status} ` };

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
  assert.equal(raw.status, ` ${filter.status} `);
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

test('C3: repository-unsupported filters reject early with accurate invalid outcome', () => {
  for (const reportType of ['monthly', 'incoming', 'outgoing', 'situation'] as const) {
    for (const field of ['section', 'source'] as const) {
      const result=reportQuery({reportType,[field]:'طلب غير مدعوم'});
      assert.equal(result.kind,'invalid', reportType + '.' + field);
      if(result.kind==='invalid') assert.ok(result.issues.some(i=>i.field===field));
    }
  }
  for (const reportType of ['requests','leaves','timePermissions','circularsAndAcknowledgements'] as const) {
    for (const field of ['section','source'] as const) {
      assert.equal(reportQuery({reportType,[field]:'غير مدعوم'}).kind,'invalid');
    }
  }
  assert.equal(reportQuery({reportType:'employees',source:'غير مدعوم'}).kind,'invalid');
  assert.equal(reportQuery({reportType:'employees',section:'القسم'}).kind,'valid');
  for(const field of ['employee','type'] as const) {
    assert.equal(reportQuery({reportType:'circularsAndAcknowledgements',[field]:'غير مدعوم'}).kind,'invalid');
  }
});

test('C3: situation type filter accepts only official book directions', () => {
  for (const type of TRANSACTION_DIRECTIONS) {
    assert.deepEqual(reportQuery({ reportType: 'situation', type }), {
      kind: 'valid', value: { reportType: 'situation', type },
    });
  }
  for (const type of ['not-a-direction', 'مكتمل', 'leave', 'وارد OR TRUE']) {
    assert.equal(reportQuery({ reportType: 'situation', type }).kind, 'invalid');
  }
});

test('P1g: independent original document dates validate separately from registration dates',()=>{
  const good=reportQuery({
    reportType:'monthly', dateFrom:'2026-01-01',dateTo:'2026-12-31',
    documentDateFrom:'2020-01-01',documentDateTo:'2020-02-01',
  });
  assert.equal(good.kind,'valid');
  for(const reportType of ['incoming','outgoing','situation'] as const){
    assert.equal(reportQuery({reportType,documentDateFrom:'2020-01-01'}).kind,'valid');
  }
  for(const reportType of ['employees','leaves','timePermissions','requests',
    'circularsAndAcknowledgements','researchers','professors'] as const){
    assert.equal(reportQuery({reportType,documentDateFrom:'2020-01-01'}).kind,'invalid');
    assert.equal(reportQuery({reportType,documentDateTo:'2020-01-01'}).kind,'invalid');
  }
  for(const bad of [
    {documentDateFrom:'2020-02-30'},
    {documentDateTo:'wrong'},
    {documentDateFrom:'2020-03-01',documentDateTo:'2020-01-01'},
    {documentDateFrom:['2020-01-01']},
  ]) assert.equal(reportQuery({reportType:'monthly',...bad}).kind,'invalid');
  assert.deepEqual(reportQuery({
    reportType:'monthly',documentDateFrom:'',documentDateTo:''
  }),{kind:'valid',value:{reportType:'monthly'}});
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
  const repo: ReportRepository = {
    async list(...args) { calls.push(args); return []; },
    async readCircularAcknowledgements() {
      return {
        circulars: [], acknowledgements: [],
        statistics: {
          circularCount: 0, acknowledgementOperations: 0, uniqueEmployees: 0,
          verifiedAcknowledgementOperations: 0, verifiedUniqueEmployees: 0,
          problemRecords: 0, problemReasons: {
            missingEmployeeId: 0, identityMismatch: 0, conflictingAcknowledgementTime: 0,
          }, complete: true,
        },
      };
    },
  };
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
      totalCount: 0,
      bookStatistics: {
        totalBooks: 0, incoming: 0, outgoing: 0, internal: 0,
        statuses: { 'قيد المراجعة': 0, 'مكتمل': 0 },
      },
      period: '2026-01-01 إلى 2026-01-31',
      appliedFilters: {
        'نوع التقرير': 'monthly', 'التاريخ من': filter.dateFrom, 'التاريخ إلى': filter.dateTo,
        'النوع': filter.type, 'المنتسب': filter.employee,
        'الحالة': filter.status,
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
  for (const reportType of ['monthly', 'incoming', 'outgoing', 'situation', 'requests', 'employees', 'leaves', 'timePermissions'] satisfies ReportType[]) {
    const status = reportStatusOptions(reportType)[0];
    await services.report.run({ reportType, status }, adminAccess);
    assert.deepEqual(query.mock.calls.at(-1)?.arguments[1], status ? [status] : []);
    await services.report.run({ reportType }, adminAccess);
    assert.deepEqual(query.mock.calls.at(-1)?.arguments[1], []);
  }
  assert.equal(query.mock.callCount(), 16);
  const circular = await services.report.run({ reportType: 'circularsAndAcknowledgements' }, adminAccess);
  assert.deepEqual(circular.circularAcknowledgements?.statistics, {
    circularCount: 0, acknowledgementOperations: 0, uniqueEmployees: 0,
    verifiedAcknowledgementOperations: 0, verifiedUniqueEmployees: 0,
    problemRecords: 0, problemReasons: {
      missingEmployeeId: 0, identityMismatch: 0, conflictingAcknowledgementTime: 0,
    }, complete: true,
  });
  assert.equal(query.mock.callCount(), 18, 'Two independent queries: registered circulars and acknowledged events');
  for (const reportType of ['researchers', 'professors'] satisfies ReportType[]) {
    await assert.rejects(services.report.run({ reportType }, adminAccess), ReportNotImplementedError);
  }
  assert.equal(query.mock.callCount(), 18, 'Unimplemented reports must not query or return empty success');
  await assert.rejects(services.report.run({ reportType: 'monthly' }, undefined as never), /Report access context is required/);
  assert.equal(query.mock.callCount(), 18, 'Missing access context must fail before SQL');
});

test('P1f book summary uses only returned SQL-filtered details and rejects non-catalog statuses',async()=>{
  const rows=[
    {id:'a',date:'2026-01-01',type:'وارد',status:'مكتمل'},
    {id:'b',date:'2026-01-01',type:'صادر',status:'قيد المراجعة'},
    {id:'c',date:'2026-01-01',type:'داخلي',status:'مكتمل'},
  ];
  const service=new ReportApiService({
    async list(_type, filter) {return filter.status ? rows.filter(r=>r.status===filter.status) : rows;},
    async readCircularAcknowledgements(){throw Error('Should not read circulars');},
  });
  const expected={
    totalBooks:3,incoming:1,outgoing:1,internal:1,
    statuses:{'قيد المراجعة':1,'مكتمل':2},
  };
  for (const reportType of ['monthly','situation'] as const) {
    const report=await service.run({reportType},adminAccess);
    assert.equal(report.rows.length,3);
    assert.deepEqual(report.summary.bookStatistics,expected);
    assert.equal(report.summary.totalCount,3);
    const partial=await service.run({reportType,status:'مكتمل'},adminAccess);
    assert.equal(partial.summary.totalCount,2);
    assert.deepEqual(partial.summary.bookStatistics,{
      totalBooks:2,incoming:1,outgoing:0,internal:1,
      statuses:{'قيد المراجعة':0,'مكتمل':2},
    });
  }
  const invalidService=new ReportApiService({
    async list(){return [{id:'bad',date:'2026-01-01',type:'وارد',status:'غير مكتمل'}];},
    async readCircularAcknowledgements(){throw Error('Should not read circulars');},
  });
  await assert.rejects(invalidService.run({reportType:'situation'},adminAccess),
    /Unexpected book status/);
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
  const service = new ReportApiService({
    async list() { reads++; return []; },
    async readCircularAcknowledgements() { reads++; throw new Error('No unauthorized read'); },
  });
  const db = { query: async () => { reads++; return { rows: [] }; } };
  const repository = new PgReportRepository(db as never);
  // C1b4: own-personnel, owner-requests, own-leaves and own-time-permissions are the only reviewed employee sources.
  // All other sources remain rejected before the repository or SQL.
  for (const reportType of REPORT_TYPES) {
    if (reportType === 'employees' || reportType === 'requests' || reportType === 'leaves' || reportType === 'timePermissions') continue;
    await assert.rejects(service.run({ reportType, employee: 'someone-else' }, employeeAccess), ReportScopeNotReadyError);
    await assert.rejects(repository.list(reportType, { reportType }, employeeAccess), ReportScopeNotReadyError);
  }
  assert.equal(reads, 0, 'Unapproved employee sources must never query SQL');
  const own=await service.run({reportType:'employees'},employeeAccess);
  assert.deepEqual(own.rows,[]);
  assert.equal(own.summary.totalCount,0);
  assert.deepEqual(await repository.list('employees',{reportType:'employees'},employeeAccess),[]);
  assert.equal(reads,2,'Only own-personnel performed two isolated reads so far');
  const ownRequests=await service.run({reportType:'requests'},employeeAccess);
  assert.deepEqual(ownRequests.rows,[]);
  assert.equal(ownRequests.summary.totalCount,0);
  assert.deepEqual(await repository.list('requests',{reportType:'requests'},employeeAccess),[]);
  assert.equal(reads,4,'Only the first two audited sources have read');
  const ownLeaves=await service.run({reportType:'leaves'},employeeAccess);
  assert.deepEqual(ownLeaves.rows,[]);
  assert.equal(ownLeaves.summary.totalCount,0);
  assert.deepEqual(await repository.list('leaves',{reportType:'leaves'},employeeAccess),[]);
  assert.equal(reads,6,'Only three audited owner sources performed six isolated reads');
  const ownTimes=await service.run({reportType:'timePermissions'},employeeAccess);
  assert.deepEqual(ownTimes.rows,[]);
  assert.equal(ownTimes.summary.totalCount,0);
  assert.deepEqual(await repository.list('timePermissions',{reportType:'timePermissions'},employeeAccess),[]);
  assert.equal(reads,8,'Only four audited owner sources performed eight isolated reads');
  await assert.rejects(service.run(filter, {} as never), /Report access context is required/);
  await assert.rejects(repository.list('monthly', filter, undefined as never), /Report access context is required/);
  await assert.rejects(service.run(filter, { ...adminAccess, transactionScope: { visibilityIn: [] } } as never), /Privileged report access context is inconsistent/);
  assert.equal(reads, 8, 'Malformed contexts must not reach the repository');
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
