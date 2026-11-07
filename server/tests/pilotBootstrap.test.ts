/** Phase 23 pilot startup — synthetic, role-scoped and bounded API reads. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Transaction, TransactionEmployee } from '../../src/core/models';
import { loadPilotStartupData, type PilotBootstrapSource } from '../../src/api/pilotBootstrap';

function makeSource(numberOfBooks = 3, kind: 'api' | 'local' = 'api') {
  const counters = { employees: 0, transactions: 0, daily: 0, links: [] as string[], personnel: 0 };
  const txs: Transaction[] = Array.from({length: numberOfBooks}, (_, i) => ({id: `transaction-${i + 1}`} as Transaction));
  const source: PilotBootstrapSource = {
    kind,
    async loadEmployees() { counters.employees++; return []; },
    async loadTransactions() { counters.transactions++; return txs; },
    async loadDailySituations() { counters.daily++; return []; },
    async loadLinksByTransaction(id) {
      counters.links.push(id);
      return [{id: `link-${id}`, transactionId: id, employeeId: 'synthetic-employee'}] as TransactionEmployee[];
    },
    async loadLeaves() { counters.personnel++; return []; },
    async loadTimePermissions() { counters.personnel++; return []; },
    async loadAssignments() { counters.personnel++; return []; },
    async loadCourses() { counters.personnel++; return []; },
  };
  return {source, counters, txs};
}

test('admin and director load scoped daily situation exactly once, and no duplicate preflight employee read', async () => {
  for (const role of ['admin', 'director'] as const) {
    const {source, counters, txs} = makeSource();
    const loaded = await loadPilotStartupData(source, role);
    assert.equal(counters.employees, 1);
    assert.equal(counters.transactions, 1);
    assert.equal(counters.daily, 1);
    assert.equal(counters.personnel, 4);
    assert.deepEqual(loaded.transactions, txs);
    assert.equal(loaded.transactionEmployees.length, 3);
    assert.deepEqual(counters.links, txs.map(x => x.id));
  }
});

test('employee API login never requests restricted daily register; local demo remains available', async () => {
  const employee = makeSource(2);
  const loaded = await loadPilotStartupData(employee.source, 'employee');
  assert.deepEqual(loaded.dailySituations, []);
  assert.equal(employee.counters.daily, 0);
  assert.equal(employee.counters.employees, 1);
  assert.equal(employee.counters.links.length, 2);

  const local = makeSource(0, 'local');
  await loadPilotStartupData(local.source, 'employee');
  assert.equal(local.counters.daily, 1);
});

test('many books are loaded with <=8 concurrent scoped link requests, with deterministic results', async () => {
  const {source, txs} = makeSource(37);
  let inFlight = 0;
  let peak = 0;
  source.loadLinksByTransaction = async (id) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise<void>(resolve => setImmediate(resolve));
    inFlight--;
    return [{id: `link-${id}`, transactionId: id, employeeId:'synthetic-employee'}] as TransactionEmployee[];
  };
  const result = await loadPilotStartupData(source, 'admin');
  assert.equal(result.transactionEmployees.length, txs.length);
  assert.deepEqual(result.transactionEmployees.map(x=>x.transactionId), txs.map(x=>x.id));
  assert.equal(peak, 8);
});

test('required resource failure rejects startup without partial-success fallback', async () => {
  const {source} = makeSource();
  source.loadLeaves = async () => {throw new Error('403 denied');};
  await assert.rejects(loadPilotStartupData(source,'employee'),/403 denied/);
  const links = makeSource(3);
  links.source.loadLinksByTransaction = async () => {throw new Error('scope denied');};
  await assert.rejects(loadPilotStartupData(links.source,'director'),/scope denied/);
});

test('App uses scoped loader once and retains fail-closed error rendering', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url),'utf8');
  assert.match(app, /loadPilotStartupData\(/);
  assert.doesNotMatch(app, /await primeDataSource\(\)/);
  assert.match(app, /if \(!isCurrent\(\)\) return;/);
  assert.match(app, /getBearerToken\(\) === token/);
  assert.match(app, /لم يتم الانتقال إلى التخزين المحلي/);
  assert.match(app, /setStartupError\(message\)/);
});
