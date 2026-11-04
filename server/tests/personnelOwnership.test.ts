/** Fail-closed service boundaries; complements the real HTTP/SQL suite. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Client } from 'pg';
import type { Request } from 'express';
import { createApiServices } from '../src/api/services';
import { canReadEmployee, personnelFilter, personnelScopeOf, type PersonnelReadScope } from '../src/authorization/personnelScope';
import { ResourceNotFoundError } from '../src/api/errors';

test('missing/invalid personal contexts cannot read any repository', async t => {
  const db = new Client({ connectionString: 'postgres://unused:unused@127.0.0.1:1/unused' });
  const query = t.mock.method(db, 'query', () => { throw new Error('Unexpected SQL'); });
  const services = createApiServices(db);
  // Deliberate untyped-boundary probes: TypeScript callers must supply a valid context.
  for (const scope of [undefined, null, {}, { kind: 'owner' }] as unknown as PersonnelReadScope[]) {
    const calls = [
      () => services.employees.list({}, scope),
      () => services.employees.getById('B', scope),
      () => services.employees.statusHistory('B', scope),
      () => services.leaves.list({}, scope),
      () => services.leaves.getById('leave-B', scope),
      () => services.timePermissions.list({}, scope),
      () => services.timePermissions.getById('time-B', scope),
      () => services.leaveBalances.listBalances({}, scope),
      () => services.leaveBalances.listLedger({}, scope),
      () => services.timeline.forEmployee({ employeeId: 'B' }, scope),
      () => services.search.run({ q: 'B' }, scope),
    ];
    for (const call of calls) await assert.rejects(call, /Personnel read scope is required/);
  }
  assert.equal(query.mock.callCount(), 0);
});

test('empty/conflicting scopes stop personal and derived reads before SQL', async t => {
  const db = new Client({ connectionString: 'postgres://unused:unused@127.0.0.1:1/unused' });
  const query = t.mock.method(db, 'query', () => { throw new Error('Unexpected SQL'); });
  const services = createApiServices(db);
  const owner: PersonnelReadScope = { kind: 'owner', employeeId: 'A' };
  const empty: PersonnelReadScope = { kind: 'empty' };
  assert.deepEqual(await services.employees.list({}, empty), []);
  for (const scope of [owner, empty]) {
    assert.deepEqual(await services.leaves.list({ employeeId: 'B' }, scope), []);
    assert.deepEqual(await services.timePermissions.list({ employeeId: 'B' }, scope), []);
    assert.deepEqual(await services.leaveBalances.listBalances({ employeeId: 'B' }, scope), []);
    assert.deepEqual(await services.leaveBalances.listLedger({ employeeId: 'B', leaveId: 'leave-B' }, scope), []);
    await assert.rejects(() => services.employees.getById('B', scope), ResourceNotFoundError);
    await assert.rejects(() => services.employees.statusHistory('B', scope), ResourceNotFoundError);
    await assert.rejects(() => services.timeline.forEmployee({ employeeId: 'B' }, scope), ResourceNotFoundError);
    await assert.rejects(() => services.timeline.forEmployee({
      employeeId: 'B', limit: 1, sourceTypes: ['transaction'],
    }, scope), ResourceNotFoundError);
  }
  await assert.rejects(() => services.leaves.getById('leave-B', empty), ResourceNotFoundError);
  await assert.rejects(() => services.timePermissions.getById('time-B', empty), ResourceNotFoundError);
  assert.deepEqual(await services.search.run({ q: 'B', type: 'employee' }, empty), []);
  assert.equal(query.mock.callCount(), 0);
});

test('only authenticated account identity determines personal ownership', () => {
  // Partial transport doubles contain precisely the properties read by personnelScopeOf.
  const req = (auth?: object) => ({ auth, query: { employeeId: 'B', role: 'admin', kind: 'all' } }) as unknown as Request;
  assert.deepEqual(personnelScopeOf(req()), { kind: 'empty' });
  assert.deepEqual(personnelScopeOf(req({ role: 'employee', employeeId: 'A' })), { kind: 'owner', employeeId: 'A' });
  for (const employeeId of [undefined, null, '', ' ']) {
    assert.deepEqual(personnelScopeOf(req({ role: 'employee', employeeId })), { kind: 'empty' });
  }
  for (const role of ['admin', 'director']) assert.deepEqual(personnelScopeOf(req({ role })), { kind: 'all' });
  assert.deepEqual(personnelScopeOf(req({ role: 'archivist', employeeId: 'A' })), { kind: 'empty' });
});

test('foreign record misses use owner SQL and stop before balance/weekly queries', async t => {
  const db = new Client({ connectionString: 'postgres://unused:unused@127.0.0.1:1/unused' });
  const query = t.mock.method(db, 'query', async () => ({ rows: [], rowCount: 0, command: 'SELECT', oid: 0, fields: [] }));
  const services = createApiServices(db);
  const scope: PersonnelReadScope = { kind: 'owner', employeeId: 'A' };
  await assert.rejects(() => services.leaves.getById('leave-B', scope), ResourceNotFoundError);
  await assert.rejects(() => services.timePermissions.getById('time-B', scope), ResourceNotFoundError);
  assert.equal(query.mock.callCount(), 2, 'No derived query is allowed after a scoped miss');
  for (const [index, id] of ['leave-B', 'time-B'].entries()) {
    const [sql, params] = query.mock.calls[index].arguments;
    assert.match(String(sql), /WHERE id = \$1 AND employee_id = \$2/);
    assert.deepEqual(params, [id, 'A']);
  }
});

test('equivalent UUID spellings preserve own access without admitting another owner', () => {
  const id = 'abcdef01-2345-4abc-8def-0123456789ab';
  const scope: PersonnelReadScope = { kind: 'owner', employeeId: id };
  for (const spelling of [id.toUpperCase(), id.replace(/-/g, ''), `{${id.toUpperCase()}}`]) {
    assert.equal(canReadEmployee(scope, spelling), true);
    assert.deepEqual(personnelFilter({ employeeId: spelling }, scope), { employeeId: id });
  }
  assert.equal(canReadEmployee(scope, id.replace('abcdef01', 'abcdef02')), false);
});
