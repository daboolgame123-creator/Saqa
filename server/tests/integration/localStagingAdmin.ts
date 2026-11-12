/** Container-only, owned disposable PostgreSQL; never consumes a host DATABASE_URL. */
import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, mkdtempSync } from 'node:fs';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { STAGING_BADGE, STAGING_CONFIRMATION, stagingDatabaseConfig } from '../../../scripts/localStagingEnvironment';

if (process.platform !== 'linux' || !existsSync('/.dockerenv') ||
    process.env.ALSQAYA_DISPOSABLE_STAGING !== 'container-only') {
  throw new Error('Run only using the supplied disposable container; no host DB fallback.');
}
// All credentials are synthetic per-process; discard inherited connection settings.
for (const name of Object.keys(process.env)) if (/^PG/i.test(name)) delete process.env[name];
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.AUTH_OTP_PROVIDER = 'admin';
process.env.AUTH_SECRET_KEY = randomBytes(32).toString('base64');
process.env.DATABASE_URL = 'postgresql://postgres:synthetic-container-only@127.0.0.1:5433/alsqaya_staging';
const dataDir = mkdtempSync('/tmp/alsqaya-staging-');
let postgresStarted = false;
let app: ChildProcess | undefined;
let output = '';
const secrets: string[] = [process.env.AUTH_SECRET_KEY];
const { Pool } = await import('pg');
let pool: InstanceType<typeof Pool> | undefined;

async function startApp(): Promise<void> {
  app = spawn(process.execPath, ['--import', 'tsx', 'scripts/localStagingServer.ts'], {
    env: { ...process.env, PORT: '4400' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  const child = app;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Express startup timeout')), 15000);
    const finish = (error?: Error) => {
      clearTimeout(timer);
      child.off('exit', earlyExit);
      error ? reject(error) : resolve();
    };
    const earlyExit = () => finish(new Error('Express exited before readiness'));
    child.once('exit', earlyExit);
    child.once('error', finish);
    child.stdout!.on('data', chunk => {
      output += String(chunk);
      if (String(chunk).includes('Local staging Express listening')) finish();
    });
    child.stderr!.on('data', chunk => { output += String(chunk); });
  });
}

async function stopApp(): Promise<void> {
  if (!app || app.exitCode !== null || app.signalCode !== null) { app = undefined; return; }
  const child = app;
  const ended = once(child, 'exit');
  child.kill('SIGTERM');
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Express shutdown timeout')); }, 5000);
  });
  try { await Promise.race([ended, timeout]); } finally { clearTimeout(timer!); app = undefined; }
}

async function http(path: string, body?: unknown, token?: string) {
  const response = await fetch('http://127.0.0.1:4400' + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(10000),
  });
  return { status: response.status, body: await response.json() };
}

try {
  // initdb and start must succeed before any client exists. No existing cluster is reused.
  execFileSync('initdb', ['-D', dataDir, '--auth=trust', '--encoding=UTF8', '--no-locale'], { stdio: 'ignore' });
  execFileSync('pg_ctl', ['-D', dataDir, '-l', dataDir + '/server.log', '-o', '-h 127.0.0.1 -p 5433', '-w', 'start'], { stdio: 'ignore' });
  postgresStarted = true;
  const admin = new Pool({ ...stagingDatabaseConfig(process.env), database: 'postgres' });
  try { await admin.query('CREATE DATABASE alsqaya_staging'); } finally { await admin.end(); }
  pool = new Pool(stagingDatabaseConfig(process.env));
  const { runMigrations } = await import('../../src/database/migrations');
  const migrated = await runMigrations(pool);
  assert.equal(migrated.appliedVersions.length, 15);
  const { provisionLocalStagingAdmin } = await import('../../../scripts/localStagingAdmin');
  const provision = () => provisionLocalStagingAdmin(STAGING_CONFIRMATION);
  const reset = () => pool!.query('TRUNCATE public.employees, public.users, public.audit_logs CASCADE');
  async function counts() {
    return (await pool!.query(
      'SELECT (SELECT count(*)::int FROM employees) AS employees, ' +
      '(SELECT count(*)::int FROM users) AS users, (SELECT count(*)::int FROM audit_logs) AS audits',
    )).rows[0];
  }

  await assert.rejects(provisionLocalStagingAdmin('yes'), /not confirmed/);
  assert.deepEqual(await counts(), { employees: 0, users: 0, audits: 0 });
  console.log('PASS: confirmation denied without writes');

  const lastMigration = (await pool.query('SELECT * FROM schema_migrations WHERE version=15')).rows[0];
  await pool.query('DELETE FROM schema_migrations WHERE version=15');
  await assert.rejects(provision(), /expected migrations/);
  assert.deepEqual(await counts(), { employees: 0, users: 0, audits: 0 });
  await pool.query('INSERT INTO schema_migrations(version,name,checksum) VALUES (15,$1,$2)',
    [lastMigration.name, lastMigration.checksum]);
  await pool.query("UPDATE schema_migrations SET checksum='synthetic-invalid' WHERE version=15");
  await assert.rejects(provision(), /expected migrations/);
  assert.deepEqual(await counts(), { employees: 0, users: 0, audits: 0 });
  await pool.query('UPDATE schema_migrations SET checksum=$1 WHERE version=15', [lastMigration.checksum]);
  await pool.query("INSERT INTO schema_migrations(version,name,checksum) VALUES (999,'synthetic-extra','synthetic')");
  await assert.rejects(provision(), /expected migrations/);
  assert.deepEqual(await counts(), { employees: 0, users: 0, audits: 0 });
  await pool.query('DELETE FROM schema_migrations WHERE version=999');
  await pool.query('ALTER TABLE schema_migrations RENAME TO synthetic_saved_migrations');
  await assert.rejects(provision(), { code: '42P01' });
  assert.deepEqual(await counts(), { employees: 0, users: 0, audits: 0 });
  await pool.query('ALTER TABLE synthetic_saved_migrations RENAME TO schema_migrations');
  console.log('PASS: incomplete, modified, extra and missing migration ledgers refused without writes');

  for (const kind of ['employee', 'user_account']) {
    await pool.query(`ALTER TABLE audit_logs ADD CONSTRAINT staging_audit_failure CHECK (entity_kind <> '${kind}')`);
    await assert.rejects(provision(), { code: '23514', constraint: 'staging_audit_failure' });
    assert.deepEqual(await counts(), { employees: 0, users: 0, audits: 0 });
    await pool.query('ALTER TABLE audit_logs DROP CONSTRAINT staging_audit_failure');
  }
  console.log('PASS: either audit failure rolls back employee, account and audits');

  await pool.query("INSERT INTO employees (name,title,department,badge_number) VALUES ('Synthetic collision','Test','Test',$1)", [STAGING_BADGE]);
  await assert.rejects(provision());
  assert.deepEqual(await counts(), { employees: 1, users: 0, audits: 0 });
  await reset();
  await pool.query("INSERT INTO users (username,display_name,role,status) VALUES ('synthetic-existing','Synthetic','employee','inactive')");
  await assert.rejects(provision(), /zero user/);
  assert.deepEqual(await counts(), { employees: 0, users: 1, audits: 0 });
  await reset();
  console.log('PASS: collisions and pre-existing non-admin accounts refused');

  const blocker = await pool.connect();
  let concurrent: Promise<unknown> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query("INSERT INTO users(username,display_name,role,status) VALUES ('synthetic-concurrent','Synthetic','employee','inactive')");
    concurrent = provision().then(() => new Error('Unexpected provisioning success'), error => error);
    // Observe a real lock wait rather than relying on a timing-only sleep.
    let waiting = false;
    for (let attempt = 0; attempt < 100; attempt++) {
      await blocker.query('SELECT pg_stat_clear_snapshot()');
      const observed = await blocker.query(
        "SELECT 1 FROM pg_stat_activity WHERE pid <> pg_backend_pid() " +
        "AND application_name='alsqaya_synthetic_staging_admin' AND wait_event_type='Lock'",
      );
      if (observed.rowCount) { waiting = true; break; }
      await delay(20);
    }
    assert.equal(waiting, true, 'provisioning must wait for ordinary account writer');
    await blocker.query('COMMIT');
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    if (concurrent) assert.match(String(await concurrent), /zero user/);
  }
  assert.deepEqual(await counts(), { employees: 0, users: 1, audits: 0 });
  await reset();
  console.log('PASS: table lock serializes an ordinary concurrent account writer');

  const raced = await Promise.allSettled([provision(), provision()]);
  assert.equal(raced.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(raced.filter(result => result.status === 'rejected').length, 1);
  const loser = raced.find(result => result.status === 'rejected');
  assert.ok(loser?.status === 'rejected' && /zero user/.test(loser.reason.message));
  assert.deepEqual(await counts(), { employees: 1, users: 1, audits: 2 });
  const winner = raced.find(result => result.status === 'fulfilled');
  assert.ok(winner?.status === 'fulfilled');
  const created = winner.value;
  secrets.push(created.temporarySecret);
  const stored = (await pool.query('SELECT * FROM users')).rows[0];
  assert.equal(stored.employee_id, created.employeeId);
  assert.equal(stored.role, 'admin');
  assert.equal(stored.must_change_secret, true);
  assert.equal(stored.secret_key_id, 'v1');
  const { decryptSecret } = await import('../../src/auth/secretVault');
  assert.ok(decryptSecret({ ciphertext: stored.secret_ciphertext, iv: stored.secret_iv,
    authTag: stored.secret_auth_tag }) === created.temporarySecret);
  const snapshots = await pool.query('SELECT row_to_json(t) FROM users t UNION ALL SELECT row_to_json(a) FROM audit_logs a');
  for (const secret of secrets) assert.equal(JSON.stringify(snapshots.rows).includes(secret), false);
  const audits = (await pool.query('SELECT entity_kind, entity_id, new_values, actor_user_id FROM audit_logs')).rows;
  assert.equal(audits.filter(row => row.entity_kind === 'employee' && row.entity_id === created.employeeId).length, 1);
  assert.equal(audits.filter(row => row.entity_kind === 'user_account' && row.entity_id === created.accountId).length, 1);
  assert.ok(audits.every(row => row.actor_user_id === null && row.new_values.synthetic === true));
  console.log('PASS: race serialized; native ciphertext, linked identity and two atomic audits');

  await startApp();
  assert.equal((await http('/api/employees')).status, 401);
  assert.equal((await http('/api/employees', undefined, 'forged-session')).status, 401);
  const loginBody = (secret: string) => ({ identifier: STAGING_BADGE, secret });
  assert.equal((await http('/api/auth/login', loginBody('synthetic-wrong-code'))).status, 401);
  const initial = await http('/api/auth/login', loginBody(created.temporarySecret));
  assert.equal(initial.status, 200);
  assert.equal(initial.body.mustChangeSecret, true);
  secrets.push(initial.body.sessionToken);
  const forced = await http('/api/employees', undefined, initial.body.sessionToken);
  assert.equal(forced.status, 403);
  assert.equal(forced.body.error.code, 'SECRET_CHANGE_REQUIRED');
  const changedSecret = randomBytes(24).toString('base64');
  secrets.push(changedSecret);
  const changed = await http('/api/auth/secret', {
    currentSecret: created.temporarySecret, newSecret: changedSecret,
  }, initial.body.sessionToken);
  assert.equal(changed.status, 200);
  assert.equal((await http('/api/auth/me', undefined, initial.body.sessionToken)).status, 401);
  assert.equal((await http('/api/auth/login', loginBody(created.temporarySecret))).status, 401);
  await stopApp();
  const originalKey = process.env.AUTH_SECRET_KEY;
  const ciphertext = (await pool.query('SELECT secret_ciphertext FROM users')).rows[0].secret_ciphertext;
  process.env.AUTH_SECRET_KEY = randomBytes(32).toString('base64');
  secrets.push(process.env.AUTH_SECRET_KEY);
  await startApp();
  const wrongKey = await http('/api/auth/login', loginBody(changedSecret));
  assert.equal(wrongKey.status, 503);
  assert.equal(wrongKey.body.error.code, 'SECRET_UNAVAILABLE');
  assert.equal(wrongKey.body.sessionToken, undefined);
  assert.ok((await pool.query('SELECT secret_ciphertext FROM users')).rows[0].secret_ciphertext === ciphertext);
  // Exercise cleanup of a child that has already exited by signal.
  const crashed = once(app!, 'exit');
  app!.kill('SIGKILL');
  await crashed;
  await stopApp();
  process.env.AUTH_SECRET_KEY = originalKey;
  await startApp(); // fresh config/vault process, same key
  const login = await http('/api/auth/login', loginBody(changedSecret));
  assert.equal(login.status, 200);
  assert.equal(login.body.account.role, 'admin');
  assert.equal(login.body.mustChangeSecret, false);
  const token = login.body.sessionToken;
  secrets.push(token);
  assert.equal((await http('/api/employees', undefined, token)).status, 200);
  for (const path of ['/api/reports', '/api/reports/catalog', '/api/reports/run', '/api/reports/export']) {
    const report = await http(path, path.endsWith('run') || path.endsWith('export') ? {} : undefined, token);
    assert.equal(report.status, 503);
    assert.equal(report.body.error.code, 'REPORTS_UNAVAILABLE');
  }
  console.log('PASS: real Express login/change/restart; 401/403 and official report 503');
  await pool.query("UPDATE users SET status='blocked' WHERE id=$1", [created.accountId]);
  await assert.rejects(provision(), /zero user/);
  assert.equal((await http('/api/employees', undefined, token)).status, 401);
  const blocked = await http('/api/auth/login', loginBody(changedSecret));
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'ACCOUNT_BLOCKED');
  assert.equal(blocked.body.sessionToken, undefined);
  for (const secret of secrets) assert.equal(output.includes(secret), false);
  console.log('PASS: blocked account cannot be replaced or used; no secrets in server logs');
  console.log('LOCAL_STAGING_DISPOSABLE_HTTP_PASS');
} finally {
  try { await stopApp(); }
  finally {
    try { if (pool) await pool.end(); }
    finally {
      if (postgresStarted) execFileSync('pg_ctl', ['-D', dataDir, '-m', 'immediate', '-w', 'stop'], { stdio: 'ignore' });
    }
  }
  // Container --rm removes the entire synthetic cluster. No host cleanup command.
}
