import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, it } from 'node:test';
import { formatStagingFailure, StagingDiagnosticContext } from '../../scripts/localStagingDiagnostics';
import { defaultMigrationsDir, loadMigrations } from '../src/database/migrations';

describe('safe local staging diagnostics (no database)', () => {
  it('never serializes arbitrary error fields, codes, getters or primitive throws', () => {
    const secret = 'SYNTHETIC-PRIVATE-DO-NOT-PRINT';
    const getter = Object.defineProperty(new Error(secret), 'code', { get() { assert.fail('Getter invoked'); } });
    for (const error of [secret, null, { code: secret, message: secret, stack: secret }, getter,
      new Proxy({}, { getOwnPropertyDescriptor() { throw new Error(secret); } })]) {
      const text = formatStagingFailure(error);
      assert.equal(text, 'Staging setup stopped. stage=preflight code=UNEXPECTED outcome=NOT_STARTED cleanup=none. No automatic retry.\n');
    }
  });

  it('preserves frozen primary exceptions and records secondary cleanup failure', async () => {
    const context = new StagingDiagnosticContext();
    context.stage = 'account_audit';
    const error = Object.freeze(Object.assign(new Error('private'), { code: '42501' }));
    assert.equal(context.capture(error), error);
    await context.cleanup('rollback', () => { throw new Error('private cleanup'); });
    assert.match(formatStagingFailure(error), /stage=account_audit code=42501 .*cleanup=rollback/);
  });

  it('proves raw LF/CRLF migration checksums differ without changing files or the ledger', async () => {
    const migrations = await loadMigrations();
    assert.equal(migrations.length, 15);
    const hash = (raw: string) => createHash('sha256').update(raw, 'utf8').digest('hex');
    for (const migration of migrations) {
      const raw = await readFile(path.join(defaultMigrationsDir(), migration.fileName), 'utf8');
      const lf = raw.replace(/\r\n/g, '\n');
      assert.equal(migration.checksum, hash(raw));
      assert.notEqual(hash(lf), hash(lf.replace(/\n/g, '\r\n')));
    }
  });

  const scenarios = [
    { stage: 'pool', code: 'UNEXPECTED' },
    { stage: 'connect', code: '28P01' },
    { stage: 'connect', code: 'ECONNREFUSED' },
    { stage: 'begin', code: '08006' },
    { stage: 'identity', guard: 'IDENTITY_MISMATCH' },
    { stage: 'migration_ledger', guard: 'MIGRATION_MISMATCH' },
    { stage: 'migration_ledger', code: '42P01' },
    { stage: 'lock', code: '42501' },
    { stage: 'lock', code: '55P03' },
    { stage: 'empty_users', guard: 'USERS_NOT_EMPTY' },
    { stage: 'employee_insert', code: '23505' },
    { stage: 'account_insert', code: '23502' },
    { stage: 'employee_audit', code: '42501' },
    { stage: 'account_audit', code: '23514' },
    { stage: 'account_audit', code: '23514', cleanup: ['rollback', 'release', 'pool_end'] },
    { stage: 'account_audit', code: '23514', cleanup: ['release', 'pool_end'] },
    { stage: 'account_audit', code: '23514', cleanup: ['rollback'] },
    { stage: 'account_audit', primitive: true },
    { stage: 'commit', code: 'ECONNRESET' },
    { stage: 'release', code: 'UNEXPECTED' },
    { stage: 'pool_end', code: 'UNEXPECTED' },
    ...['PORT', 'LOG_LEVEL', 'TEST_DATABASE_URL', 'ATTACHMENT_MAX_FILE_SIZE_BYTES']
      .map(config => ({ stage: 'config', config })),
  ];
  for (const scenario of scenarios) {
    it(`mocked ${scenario.stage}: ${JSON.stringify(scenario)}`, () => {
      const child = spawnSync(process.execPath, [
        '--experimental-test-module-mocks', '--disable-warning=ExperimentalWarning', '--import', 'tsx',
        'server/tests/fixtures/localStagingDiagnosticsProbe.ts', JSON.stringify(scenario),
      ], { env: { ...process.env }, encoding: 'utf8', timeout: 15000 });
      assert.equal(child.status, 0, `Mock probe failed: ${child.stderr}`);
      assert.equal(child.stdout, 'MOCK_DIAGNOSTIC_PASS\n');
      // Node 24 deprecates namedExports; retain Node 22-compatible mocks. Ignore
      // only this exact runtime notice, never application errors or secret text.
      const stderr = child.stderr.replace(/\(node:\d+\) DeprecationWarning: mock\.module\(\): options\.namedExports is deprecated\. Use options\.exports instead\.\r?\n\(Use `node --trace-deprecation \.\.\.` to show where the warning was created\)\r?\n/g, '');
      assert.equal(stderr, '');
    });
  }

  for (const scenario of ['dpapi', 'credentials', 'child']) {
    it(`Windows PowerShell mocked launcher: ${scenario}`, { skip: process.platform !== 'win32' }, () => {
      const child = spawnSync('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-File',
        'server/tests/fixtures/localStagingLauncherProbe.ps1', '-Scenario', scenario,
      ], { encoding: 'utf8', timeout: 15000 });
      assert.equal(child.status, 0, child.stderr);
      assert.equal(child.stdout.trim(), 'MOCK_LAUNCHER_PASS');
      if (scenario === 'child') {
        assert.match(child.stderr, /Staging setup stopped\. stage=connect code=28P01 outcome=NOT_STARTED cleanup=none\. No automatic retry\./);
        assert.equal(child.stderr.includes('SYNTHETIC-PRIVATE-DO-NOT-PRINT'), false);
      } else assert.equal(child.stderr.trim(), '');
    });
  }
});
