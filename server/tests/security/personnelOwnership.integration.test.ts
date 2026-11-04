/** T1–T8: real sessions → HTTP → authorization → services → PostgreSQL. Synthetic data only.
 * Run only using runPersonnelOwnershipChecks.ps1 after explicit approval.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import { startPersonnelTestSuite, type PersonnelTestSuite } from '../helpers/personnelTestSuite';
import { getJson, postJson, patchJson, useTestSession, type ApiErrorBody } from '../api/apiTestHelpers';
import { newAuthenticatedAccount, newTransaction, type TestRole } from '../api/apiTestData';
import type {
  EmployeeDto, EmployeeStatusHistoryDto, EmployeeLeaveDto, EmployeeTimePermissionDto,
  LeaveWithBalanceDto, TimePermissionWithBalanceDto, LeaveBalanceDto, LeaveLedgerEntryDto,
  TimelineResponseDto, SearchResultDto,
} from '../../src/api/dto';

type Actor = Awaited<ReturnType<typeof newAuthenticatedAccount>>;
const MISSING = '00000000-0000-0000-0000-000000000000';

describe('Personnel ownership — isolated HTTP + SQL', { concurrency: false }, () => {
  let suite: PersonnelTestSuite;
  let admin: Actor;
  let director: Actor;
  let a: Actor;
  let b: Actor;
  let detached: Actor;
  let leaveA: LeaveWithBalanceDto;
  let leaveB: LeaveWithBalanceDto;
  let timeA: TimePermissionWithBalanceDto;
  let timeB: TimePermissionWithBalanceDto;

  const get = async <T>(url: string): Promise<T> => {
    const response = await getJson<T>(suite.baseUrl, `/api/${url}`);
    assert.equal(response.status, 200, `${url}: ${JSON.stringify(response.body)}`);
    return response.body;
  };
  const post = async <T>(url: string, body: unknown): Promise<T> => {
    const response = await postJson<T>(suite.baseUrl, `/api/${url}`, body);
    assert.equal(response.status, 201, `${url}: ${JSON.stringify(response.body)}`);
    return response.body;
  };
  const onlyOwner = (rows: { employeeId: string }[], id: string) => {
    assert.ok(rows.length > 0, 'Positive ownership assertion must not pass on an empty list');
    assert.ok(rows.every(row => row.employeeId === id));
  };
  const hiddenLikeMissing = async (hidden: string, missing: string, hiddenId: string) => {
    const denied = await getJson<ApiErrorBody>(suite.baseUrl, `/api/${hidden}`);
    const absent = await getJson<ApiErrorBody>(suite.baseUrl, `/api/${missing}`);
    assert.equal(denied.status, 404, hidden);
    assert.equal(absent.status, 404, missing);
    assert.equal(denied.body.error?.code, 'RESOURCE_NOT_FOUND');
    assert.equal(denied.body.error?.code, absent.body.error?.code);
    assert.equal(denied.body.error?.message?.replace(hiddenId, '<id>'), absent.body.error?.message?.replace(MISSING, '<id>'));
    assert.deepEqual(Object.keys(denied.body).sort(), ['error']);
    assert.equal(denied.body.error?.details, undefined);
  };

  before(async () => { suite = await startPersonnelTestSuite(); });
  after(async () => { if (suite) await suite.stop(); });
  beforeEach(async () => {
    // This pool belongs to the newly created, directory-verified test cluster only.
    await suite.pool.query('TRUNCATE users, employees, transactions, auth_otp_codes, auth_otp_rate_limits, audit_logs CASCADE');
    const actor = (role: TestRole, n: number, name: string) => newAuthenticatedAccount(suite.context, {
      role, badgeNumber: `OWNER-${n}`, phone: `0779000000${n}`, name,
    });
    admin = await actor('admin', 1, 'مدير البيانات');
    director = await actor('director', 2, 'مدير الإشراف');
    // A sorts after B: limit=1 catches post-query filtering rather than scoped SQL.
    a = await actor('employee', 3, 'zzz-owner-A');
    b = await actor('employee', 4, 'aaa-owner-B');
    detached = await actor('employee', 5, 'detached-owner');
    await suite.pool.query('UPDATE users SET employee_id = NULL WHERE id = $1', [detached.account.id]);
    useTestSession(admin.sessionToken);
    for (const [actor, days] of [[a, 20], [b, 70]] as const) {
      await post('leave-balances/opening', {
        employeeId: actor.employee.id, year: '2026', leaveType: 'annual', days,
        occurredOn: '2026-01-01', notes: `opening-${actor.employee.name}`,
      });
      const status = await postJson(suite.baseUrl, `/api/employees/${actor.employee.id}/status`, {
        status: 'former', serviceEndReason: 'استقالة', notes: `history-${actor.employee.name}`,
      });
      assert.equal(status.status, 200);
    }
    const leave = (actor: Actor) => post<LeaveWithBalanceDto>('leaves', {
      employeeId: actor.employee.id, type: 'annual', startDate: '2026-05-04',
      endDate: '2026-05-04', days: 1, status: 'approved',
    });
    leaveA = await leave(a);
    leaveB = await leave(b);
    const time = (actor: Actor, timeIn: string) => post<TimePermissionWithBalanceDto>('time-permissions', {
      employeeId: actor.employee.id, date: '2026-05-04', timeOut: '08:00', timeIn,
      reason: actor.employee.name, status: 'approved',
    });
    timeA = await time(a, '09:00');
    timeB = await time(b, '13:00');
    useTestSession(a.sessionToken);
  });

  it('T1: employee list, detail and status history enforce owner and hide existence', async () => {
    assert.deepEqual((await get<EmployeeDto[]>('employees')).map(row => row.id), [a.employee.id]);
    assert.deepEqual(await get(`employees?search=${encodeURIComponent(b.employee.name)}`), []);
    assert.deepEqual((await get<EmployeeDto[]>('employees?status=former')).map(row => row.id), [a.employee.id]);
    assert.equal((await get<EmployeeDto>(`employees/${a.employee.id}`)).id, a.employee.id);
    onlyOwner(await get<EmployeeStatusHistoryDto[]>(`employees/${a.employee.id}/status-history`), a.employee.id);
    await hiddenLikeMissing(`employees/${b.employee.id}`, `employees/${MISSING}`, b.employee.id);
    await hiddenLikeMissing(`employees/${b.employee.id}/status-history`, `employees/${MISSING}/status-history`, b.employee.id);
    const upper = a.employee.id.toUpperCase();
    assert.equal((await get<EmployeeDto>(`employees/${upper}`)).id, a.employee.id);
    onlyOwner(await get<EmployeeStatusHistoryDto[]>(`employees/${upper}/status-history`), a.employee.id);
    onlyOwner(await get<EmployeeLeaveDto[]>(`leaves?employeeId=${upper}`), a.employee.id);
    onlyOwner(await get<EmployeeTimePermissionDto[]>(`time-permissions?employeeId=${upper}`), a.employee.id);
    onlyOwner(await get<LeaveBalanceDto[]>(`leave-balances?employeeId=${upper}`), a.employee.id);
    onlyOwner(await get<LeaveLedgerEntryDto[]>(`leave-ledger?employeeId=${upper}`), a.employee.id);
    assert.equal((await get<TimelineResponseDto>(`timeline?employeeId=${upper}`)).totalCount, 2);
  });

  it('T2: lists intersect employee filters; details cannot expose foreign balances or weekly totals', async () => {
    for (const resource of ['leaves', 'time-permissions']) {
      onlyOwner(await get<{ employeeId: string }[]>(resource), a.employee.id);
      onlyOwner(await get<{ employeeId: string }[]>(`${resource}?employeeId=${a.employee.id}`), a.employee.id);
      assert.deepEqual(await get(`${resource}?employeeId=${b.employee.id}`), []);
    }
    const leave = await get<LeaveWithBalanceDto>(`leaves/${leaveA.leave.id}`);
    assert.equal(leave.leave.employeeId, a.employee.id);
    assert.equal(leave.balance?.employeeId, a.employee.id);
    assert.equal(leave.balance?.annualBalance, leaveA.balance?.annualBalance);
    const time = await get<TimePermissionWithBalanceDto>(`time-permissions/${timeA.record.id}`);
    assert.equal(time.record.employeeId, a.employee.id);
    assert.equal(time.balance?.employeeId, a.employee.id);
    assert.equal(time.weeklyMinutes, 60);
    assert.equal(time.exceedsWeeklyLimit, false);
    await hiddenLikeMissing(`leaves/${leaveB.leave.id}`, `leaves/${MISSING}`, leaveB.leave.id);
    await hiddenLikeMissing(`time-permissions/${timeB.record.id}`, `time-permissions/${MISSING}`, timeB.record.id);
    useTestSession(b.sessionToken);
    assert.equal((await get<TimePermissionWithBalanceDto>(`time-permissions/${timeB.record.id}`)).weeklyMinutes, 300);
    await hiddenLikeMissing(`leaves/${leaveA.leave.id}`, `leaves/${MISSING}`, leaveA.leave.id);
  });

  it('T3: balances and ledger cannot be widened by omitted or conflicting filters', async () => {
    onlyOwner(await get<LeaveBalanceDto[]>('leave-balances'), a.employee.id);
    onlyOwner(await get<LeaveLedgerEntryDto[]>('leave-ledger'), a.employee.id);
    onlyOwner(await get<LeaveLedgerEntryDto[]>(`leave-ledger?leaveId=${leaveA.leave.id}`), a.employee.id);
    assert.deepEqual(await get(`leave-ledger?leaveId=${leaveB.leave.id}`), []);
    assert.deepEqual(await get(`leave-ledger?employeeId=${a.employee.id}&leaveId=${leaveB.leave.id}`), []);
    for (const resource of ['leave-balances', 'leave-ledger']) {
      onlyOwner(await get<{ employeeId: string }[]>(`${resource}?year=2026`), a.employee.id);
      assert.deepEqual(await get(`${resource}?employeeId=${b.employee.id}&year=2026`), []);
    }
    assert.deepEqual(await get(`leave-ledger?employeeId=${b.employee.id}&movementType=opening_balance`), []);
  });

  it('T4: timeline rejects B before source collection; hidden rows never change A counts', async () => {
    const url = `timeline?employeeId=${a.employee.id}`;
    const before = await get<TimelineResponseDto>(url);
    assert.equal(before.countsBySource.leave, 1);
    assert.equal(before.countsBySource.timePermission, 1);
    assert.equal(before.totalCount, 2);
    // Repeated query keys produce the array required by the existing validator.
    const bookFilter = '&sourceTypes=transaction&sourceTypes=transaction';
    for (const suffix of ['', bookFilter, '&dateFrom=2026-01-01']) {
      await hiddenLikeMissing(`timeline?employeeId=${b.employee.id}${suffix}`, `timeline?employeeId=${MISSING}${suffix}`, b.employee.id);
    }
    useTestSession(admin.sessionToken);
    await post('time-permissions', { employeeId: b.employee.id, date: '2026-05-05', timeOut: '08:00', timeIn: '09:00', status: 'approved' });
    useTestSession(a.sessionToken);
    assert.deepEqual(await get(url), before);
    const filtered = await get<TimelineResponseDto>(`${url}${bookFilter}`);
    assert.deepEqual(filtered.entries, []);
    assert.deepEqual(filtered.countsBySource, before.countsBySource); // Preserve pre-display-filter semantics.
  });

  it('T5: employee/all/default search filters ownership before pagination', async () => {
    for (const type of ['employee', 'all', '']) {
      const suffix = type ? `&type=${type}` : '';
      const rows = await get<SearchResultDto[]>(`search?q=owner&limit=1&offset=0${suffix}`);
      assert.deepEqual(rows.map(row => row.id), [a.employee.id]);
      assert.deepEqual(await get(`search?q=owner&limit=1&offset=1${suffix}`), []);
      for (const q of [b.employee.name, b.employee.badgeNumber]) {
        assert.deepEqual(await get(`search?q=${encodeURIComponent(q)}${suffix}`), []);
      }
    }
  });

  it('T6: admin/director retain all eleven approved reads, without added write rights', async () => {
    for (const actor of [admin, director]) {
      useTestSession(actor.sessionToken);
      assert.ok((await get<EmployeeDto[]>('employees')).some(row => row.id === b.employee.id));
      assert.equal((await get<EmployeeDto>(`employees/${b.employee.id}`)).id, b.employee.id);
      onlyOwner(await get<EmployeeStatusHistoryDto[]>(`employees/${b.employee.id}/status-history`), b.employee.id);
      assert.ok((await get<EmployeeLeaveDto[]>('leaves')).some(row => row.employeeId === b.employee.id));
      assert.equal((await get<LeaveWithBalanceDto>(`leaves/${leaveB.leave.id}`)).balance?.employeeId, b.employee.id);
      assert.ok((await get<EmployeeTimePermissionDto[]>('time-permissions')).some(row => row.employeeId === b.employee.id));
      assert.equal((await get<TimePermissionWithBalanceDto>(`time-permissions/${timeB.record.id}`)).weeklyMinutes, 300);
      onlyOwner(await get<LeaveBalanceDto[]>(`leave-balances?employeeId=${b.employee.id}`), b.employee.id);
      onlyOwner(await get<LeaveLedgerEntryDto[]>(`leave-ledger?employeeId=${b.employee.id}`), b.employee.id);
      assert.equal((await get<TimelineResponseDto>(`timeline?employeeId=${b.employee.id}`)).totalCount, 2);
      assert.ok((await get<SearchResultDto[]>('search?q=owner&type=all')).some(row => row.id === b.employee.id));
    }
    assert.equal((await postJson(suite.baseUrl, '/api/employees', { name: 'denied', title: 'x', department: 'x' })).status, 403);
    assert.equal((await patchJson(suite.baseUrl, `/api/leaves/${leaveB.leave.id}`, { notes: 'denied' })).status, 403);
  });

  it('T6: detached employee has no personal rows; forged scope and absent sessions do not bypass', async () => {
    useTestSession(detached.sessionToken);
    for (const url of ['employees', 'leaves', 'time-permissions', 'leave-balances', 'leave-ledger', 'search?q=owner&type=all']) {
      assert.deepEqual(await get(url), []);
    }
    for (const [url, absent, id] of [
      [`employees/${a.employee.id}`, `employees/${MISSING}`, a.employee.id],
      [`employees/${a.employee.id}/status-history`, `employees/${MISSING}/status-history`, a.employee.id],
      [`leaves/${leaveA.leave.id}`, `leaves/${MISSING}`, leaveA.leave.id],
      [`time-permissions/${timeA.record.id}`, `time-permissions/${MISSING}`, timeA.record.id],
      [`timeline?employeeId=${a.employee.id}`, `timeline?employeeId=${MISSING}`, a.employee.id],
    ]) await hiddenLikeMissing(url, absent, id);
    useTestSession(a.sessionToken);
    assert.equal((await getJson(suite.baseUrl, `/api/leaves?employeeId=${b.employee.id}&role=admin`)).status, 400);
    useTestSession(null);
    assert.equal((await getJson(suite.baseUrl, '/api/employees')).status, 401);
    await suite.pool.query("UPDATE users SET role = 'archivist' WHERE id = $1", [detached.account.id]);
    useTestSession(detached.sessionToken);
    assert.equal((await getJson(suite.baseUrl, '/api/employees')).status, 403);
  });

  it('T7: administrative writes still reread foreign records and preserve balance calculations', async () => {
    useTestSession(admin.sessionToken);
    const updated = await patchJson<TimePermissionWithBalanceDto>(suite.baseUrl, `/api/time-permissions/${timeB.record.id}`, { notes: 'administrative update' });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.record.employeeId, b.employee.id);
    assert.equal(updated.body.weeklyMinutes, 300);
    const changedLeave = await patchJson<LeaveWithBalanceDto>(suite.baseUrl, `/api/leaves/${leaveB.leave.id}`, { notes: 'administrative leave update' });
    assert.equal(changedLeave.status, 200);
    assert.equal(changedLeave.body.balance?.employeeId, b.employee.id);
    const cancelled = await postJson<LeaveWithBalanceDto>(suite.baseUrl, `/api/leaves/${leaveB.leave.id}/cancel`);
    assert.equal(cancelled.status, 200);
    assert.equal(cancelled.body.leave.status, 'cancelled');
    assert.equal(cancelled.body.balance?.annualBalance, (leaveB.balance?.annualBalance ?? 0) + 1);
    useTestSession(a.sessionToken);
    await hiddenLikeMissing(`leaves/${leaveB.leave.id}`, `leaves/${MISSING}`, leaveB.leave.id);
    assert.equal((await postJson(suite.baseUrl, `/api/leaves/${leaveB.leave.id}/cancel`)).status, 403);
  });

  it('T8: visible-book names/links and administrative availability survive; reports remain blocked', async t => {
    useTestSession(admin.sessionToken);
    const publicBook = await newTransaction(suite.context, { visibility: 'PublicToEmployees', employeeLinks: [{ employeeId: b.employee.id }], subject: 'public-owner-book' });
    const privateBook = await newTransaction(suite.context, { visibility: 'SpecificEmployees', employeeLinks: [{ employeeId: b.employee.id }], subject: 'private-owner-book' });
    const granted = await postJson(suite.baseUrl, `/api/transactions/${privateBook.id}/availability`, { employeeIds: [a.employee.id] });
    assert.equal(granted.status, 201);
    assert.ok((await get<unknown[]>(`transactions/${privateBook.id}/availability`)).length > 0);
    useTestSession(director.sessionToken);
    assert.equal((await getJson(suite.baseUrl, `/api/transactions/${privateBook.id}/availability`)).status, 403);
    useTestSession(a.sessionToken);
    assert.equal((await get<{ id: string }>(`transactions/${privateBook.id}`)).id, privateBook.id);
    const links = await get<{ transactionId: string }[]>(`transaction-employees?employeeId=${b.employee.id}`);
    assert.ok(links.some(row => row.transactionId === publicBook.id));
    const books = await get<SearchResultDto[]>(`search?q=${encodeURIComponent(b.employee.name)}&type=transaction`);
    assert.ok(books.some(row => row.id === publicBook.id && row.person?.includes(b.employee.name)));
    const all = await get<SearchResultDto[]>(`search?q=${encodeURIComponent(b.employee.name)}&type=all`);
    assert.ok(all.some(row => row.id === publicBook.id));
    assert.ok(all.every(row => row.source === 'transaction'));
    await hiddenLikeMissing(`employees/${b.employee.id}`, `employees/${MISSING}`, b.employee.id);
    useTestSession(b.sessionToken);
    assert.equal((await getJson(suite.baseUrl, `/api/transactions/${privateBook.id}`)).status, 404);
    useTestSession(detached.sessionToken);
    assert.equal((await get<{ id: string }>(`transactions/${publicBook.id}`)).id, publicBook.id);
    const report = t.mock.method(suite.context.services.report, 'run', async () => { throw new Error('Report must not execute'); });
    for (const actor of [admin, director, a]) {
      useTestSession(actor.sessionToken);
      for (const url of ['/api/reports?reportType=employees', '/api/reports/export']) {
        const result = await getJson<ApiErrorBody>(suite.baseUrl, url);
        assert.equal(result.status, 503);
        assert.equal(result.body.error?.code, 'REPORTS_UNAVAILABLE');
      }
    }
    assert.equal(report.mock.callCount(), 0);
  });
});
