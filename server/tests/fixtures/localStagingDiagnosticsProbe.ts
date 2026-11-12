/** Mocked orchestration ONLY: no real pg driver, sockets, database or persistent key. */
import assert from 'node:assert/strict';
import net from 'node:net';
import { mock } from 'node:test';
import { formatStagingFailure } from '../../../scripts/localStagingDiagnostics';
import { STAGING_CONFIRMATION } from '../../../scripts/localStagingEnvironment';

const scenario = JSON.parse(process.argv[2]) as {
  stage: string; code?: string; guard?: string; cleanup?: string[]; config?: string; primitive?: boolean;
};
const sentinel = 'SYNTHETIC-PRIVATE-DO-NOT-PRINT';
let sockets = 0;
net.Socket.prototype.connect = function () {
  sockets++;
  throw new Error('Unexpected socket attempt');
};
for (const name of Object.keys(process.env)) if (/^PG/i.test(name)) delete process.env[name];
Object.assign(process.env, {
  NODE_ENV: 'test', AUTH_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
  DATABASE_URL: `postgresql://synthetic:${sentinel}@127.0.0.1:5433/alsqaya_staging`,
  PORT: '4000', LOG_LEVEL: 'error', TEST_DATABASE_URL: '', ATTACHMENT_MAX_FILE_SIZE_BYTES: '',
});
if (scenario.config) process.env[scenario.config] = sentinel;
const original = Object.freeze(Object.assign(new Error(sentinel), {
  code: scenario.code, detail: sentinel, constraint: sentinel, query: sentinel,
}));
const calls: string[] = [];
let pools = 0;
let audits = 0;
const { loadMigrations } = await import('../../src/database/migrations');
const migrations = await loadMigrations();

function hit(stage: string) {
  calls.push(stage);
  if (stage === scenario.stage && !scenario.guard) throw scenario.primitive ? sentinel : original;
  if (scenario.cleanup?.includes(stage)) {
    throw Object.assign(new Error(sentinel), { code: 'ECONNRESET' });
  }
}

class FakePool {
  constructor(config: { host: string; database: string; port: number }) {
    pools++;
    assert.equal(config.host, '127.0.0.1');
    assert.equal(config.port, 5433);
    assert.equal(config.database, 'alsqaya_staging');
    hit('pool');
  }
  on() { return this; }
  async connect() {
    hit('connect');
    return {
      async query(sql: string, values?: unknown[]) {
        if (sql === 'BEGIN') { hit('begin'); return {}; }
        if (sql.startsWith('SELECT current_database()')) {
          hit('identity');
          return { rows: [{ database: scenario.guard === 'IDENTITY_MISMATCH' ? 'alsqaya_dev' : 'alsqaya_staging', address: '127.0.0.1', port: 5433 }] };
        }
        if (sql.startsWith('SELECT version, checksum')) {
          hit('migration_ledger');
          return { rows: migrations.map((m, i) => ({ version: m.version,
            checksum: i === 0 && scenario.guard === 'MIGRATION_MISMATCH' ? sentinel : m.checksum })) };
        }
        if (sql.startsWith('LOCK TABLE')) { hit('lock'); return {}; }
        if (sql === 'SELECT 1 FROM public.users LIMIT 1') {
          hit('empty_users'); return { rowCount: scenario.guard === 'USERS_NOT_EMPTY' ? 1 : 0 };
        }
        if (sql.startsWith('INSERT INTO public.employees')) {
          hit('employee_insert'); return { rows: [{ id: '00000000-0000-4000-8000-000000000001' }] };
        }
        if (sql.startsWith('INSERT INTO public.users')) {
          hit('account_insert');
          assert.equal(values?.length, 7);
          return { rows: [{ id: '00000000-0000-4000-8000-000000000002' }] };
        }
        if (sql.includes('INSERT INTO audit_logs')) {
          assert.equal(values?.[0], 'create');
          assert.equal(values?.[1], null);
          assert.equal(values?.[3], audits === 0 ? 'employee' : 'user_account');
          assert.match(String(values?.[6]), /synthetic_local_staging_admin/);
          hit(audits++ === 0 ? 'employee_audit' : 'account_audit');
          return {};
        }
        if (sql === 'COMMIT') { hit('commit'); return {}; }
        if (sql === 'ROLLBACK') { hit('rollback'); return {}; }
        assert.fail('Unexpected mock query');
      },
      release() { hit('release'); },
    };
  }
  async end() { hit('pool_end'); }
}

// Mock registered before dynamic import; production accepts no pool/guard injection.
mock.module('pg', { namedExports: { Pool: FakePool } });
const { provisionLocalStagingAdmin } = await import('../../../scripts/localStagingAdmin');
let failure: unknown;
try { await provisionLocalStagingAdmin(STAGING_CONFIRMATION); }
catch (error) { failure = error; }
assert.ok(failure, 'Scenario must fail');
assert.equal(sockets, 0);
assert.equal(pools, scenario.config ? 0 : 1, 'Mock must intercept the actual dependency');
if (!scenario.guard && !scenario.config && !scenario.primitive) assert.equal(failure, original, 'Preserve exact primary error even if cleanup fails');
const text = formatStagingFailure(failure);
assert.ok(text.includes(`stage=${scenario.stage} `), text);
assert.ok(text.includes(`code=${scenario.guard ?? scenario.code ?? 'UNEXPECTED'} `), text);
assert.equal(text.includes(sentinel), false);
assert.equal(text.includes(process.env.AUTH_SECRET_KEY!), false);
assert.equal(text.includes(process.env.DATABASE_URL!), false);
const transactionStarted = calls.includes('begin');
const committed = ['release', 'pool_end'].includes(scenario.stage);
const outcome = committed ? 'COMMITTED' : scenario.stage === 'commit' || (transactionStarted && scenario.cleanup?.includes('rollback'))
  ? 'UNKNOWN' : transactionStarted ? 'ROLLED_BACK' : 'NOT_STARTED';
assert.ok(text.includes(`outcome=${outcome} `), text);
if (transactionStarted && !committed) assert.ok(calls.includes('rollback'));
if (pools && scenario.stage !== 'pool') assert.ok(calls.includes('pool_end'));
if (committed) {
  assert.ok(calls.includes('commit'));
  assert.equal(audits, 2);
  assert.equal(calls.includes('rollback'), false, 'Never claim rollback after successful commit');
} else if (scenario.stage !== 'commit') assert.equal(calls.includes('commit'), false);
const failureIndex = calls.indexOf(scenario.stage);
if (failureIndex >= 0) {
  assert.ok(calls.slice(failureIndex + 1).every(stage => ['rollback', 'release', 'pool_end'].includes(stage)),
    'Only cleanup may follow a failed phase');
}
if (scenario.cleanup) assert.ok(text.includes(`cleanup=${scenario.cleanup.join(',')}`), text);
process.stdout.write('MOCK_DIAGNOSTIC_PASS\n');
