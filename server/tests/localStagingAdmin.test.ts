import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { describe, it } from 'node:test';
import { isExactStagingIdentity } from '../../scripts/localStagingAdmin';
import {
  authorizeStagingConsole, stagingDatabaseConfig,
} from '../../scripts/localStagingEnvironment';

const valid = {
  NODE_ENV: 'test', AUTH_SECRET_KEY: Buffer.alloc(32, 7).toString('base64'),
  DATABASE_URL: 'postgresql://synthetic:password@127.0.0.1:5433/alsqaya_staging',
};

describe('local staging connected identity', () => {
  const identity = { database: 'alsqaya_staging', address: '127.0.0.1', port: 5433 };
  it('accepts the exact loopback address with or without its host mask', () => {
    for (const address of ['127.0.0.1', '127.0.0.1/32']) {
      assert.equal(isExactStagingIdentity({ ...identity, address }), true);
    }
  });
  it('rejects other addresses, masks, databases, ports and missing identities', () => {
    for (const address of ['127.0.0.2', '127.0.0.2/32', '127.0.0.1/24', '::1', 'localhost', '127.0.0.1/32 ']) {
      assert.equal(isExactStagingIdentity({ ...identity, address }), false);
    }
    assert.equal(isExactStagingIdentity({ ...identity, database: 'alsqaya_dev' }), false);
    assert.equal(isExactStagingIdentity({ ...identity, port: 5432 }), false);
    assert.equal(isExactStagingIdentity(undefined), false);
  });
});

describe('local staging pre-connect authorization', () => {
  it('accepts only explicit staging and produces a pinned pg configuration', () => {
    const result = stagingDatabaseConfig(valid);
    assert.equal(result.host, '127.0.0.1');
    assert.equal(result.port, 5433);
    assert.equal(result.database, 'alsqaya_staging');
    assert.equal(result.connectionString, undefined);
    authorizeStagingConsole(['--execute'], valid, true);
  });

  it('rejects development, production, missing/noncanonical keys and every PG override', () => {
    for (const change of [
      { NODE_ENV: undefined }, { NODE_ENV: 'development' }, { NODE_ENV: 'production' },
      { NODE_ENV: ' test ' }, { AUTH_SECRET_KEY: undefined }, { AUTH_SECRET_KEY: 'bad' },
      { AUTH_SECRET_KEY: Buffer.alloc(31).toString('base64') },
      { AUTH_SECRET_KEY: valid.AUTH_SECRET_KEY + '\n' },
      { PGHOST: 'localhost' }, { PGPORT: '5432' }, { PGDATABASE: 'alsqaya_dev' },
      { PGOPTIONS: '-c search_path=evil' }, { PGSERVICE: 'other' }, { PGPASSWORD: 'other' },
    ]) assert.throws(() => stagingDatabaseConfig({ ...valid, ...change }));
  });

  it('rejects wrong destinations and URL parser override tricks', () => {
    for (const url of [
      '', 'not-a-url', valid.DATABASE_URL.replace('staging', 'dev'),
      valid.DATABASE_URL.replace('5433', '5432'), valid.DATABASE_URL.replace(':5433', ''),
      valid.DATABASE_URL.replace('127.0.0.1', 'localhost'),
      valid.DATABASE_URL.replace('127.0.0.1', '127.1'),
      valid.DATABASE_URL.replace('127.0.0.1', '[::1]'),
      valid.DATABASE_URL.replace('127.0.0.1', '192.0.2.1'),
      valid.DATABASE_URL.replace('postgresql:', 'http:'),
      valid.DATABASE_URL + '?host=192.0.2.1', valid.DATABASE_URL + '?port=5432',
      valid.DATABASE_URL + '?options=-csearch_path=evil', valid.DATABASE_URL + '?',
      valid.DATABASE_URL + '#', valid.DATABASE_URL + '/',
      valid.DATABASE_URL.replace('/alsqaya_staging', '/%61lsqaya_staging'),
      valid.DATABASE_URL.replace('password', '%00'),
      valid.DATABASE_URL.replace('password', '%ZZ'),
      ' ' + valid.DATABASE_URL, valid.DATABASE_URL.replace('password', ''),
    ]) assert.throws(() => stagingDatabaseConfig({ ...valid, DATABASE_URL: url }));
  });

  it('requires attended execution and refuses CI, extra args and secret arguments', () => {
    assert.throws(() => authorizeStagingConsole(['--execute'], valid, false));
    assert.throws(() => authorizeStagingConsole(['--execute'], { ...valid, CI: 'true' }, true));
    for (const args of [[], ['--execute', '--secret', 'synthetic'], ['--yes'], ['--execute', '--execute']]) {
      assert.throws(() => authorizeStagingConsole(args, valid, true));
    }
  });

  it('actual CLI refuses redirected execution with zero TCP attempts and no URI/key leak', () => {
    const env = { ...process.env, ...valid };
    for (const name of Object.keys(env)) if (/^PG/i.test(name)) delete env[name];
    const tripwire = `
      import net from 'node:net';
      let attempts = 0;
      const original = net.Socket.prototype.connect;
      net.Socket.prototype.connect = function (...args) {
        const first = Array.isArray(args[0]) ? args[0][0] : args[0];
        // tsx uses local named-pipe IPC while loading the actual entrypoint.
        if (first && typeof first === 'object' && typeof first.path === 'string' &&
            first.path.includes('tsx-') && !('port' in first)) {
          return Reflect.apply(original, this, args);
        }
        attempts += 1;
        throw new Error('TEST: unexpected CLI socket connection');
      };
      process.once('exit', () => { if (attempts !== 0) process.exitCode = 77; });
    `;
    const child = spawnSync(process.execPath,
      ['--import', 'data:text/javascript,' + encodeURIComponent(tripwire),
        '--import', 'tsx', 'scripts/localStagingAdmin.ts', '--execute'],
      { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 1);
    assert.equal(child.stdout, '');
    assert.match(child.stderr, /Staging setup stopped\. stage=preflight code=CONSOLE_REQUIRED outcome=NOT_STARTED/);
    assert.equal(child.stderr.includes(valid.AUTH_SECRET_KEY), false);
    assert.equal(child.stderr.includes(valid.DATABASE_URL), false);
  });

  it('core confirmation and cached-key refusals make zero socket connection attempts', () => {
    const env = { ...process.env, ...valid };
    for (const name of Object.keys(env)) if (/^PG/i.test(name)) delete env[name];
    // Intercept at the socket boundary in a fresh process; never probe an actual server.
    const code = `
      import assert from 'node:assert/strict';
      import net from 'node:net';
      let attempts = 0;
      net.Socket.prototype.connect = function () {
        attempts += 1;
        throw new Error('TEST: unexpected socket connection');
      };
      const { provisionLocalStagingAdmin } = await import('./scripts/localStagingAdmin.ts');
      const { STAGING_CONFIRMATION } = await import('./scripts/localStagingEnvironment.ts');
      await assert.rejects(provisionLocalStagingAdmin('yes'), /not confirmed/);
      await import('./server/src/config/index.ts');
      process.env.AUTH_SECRET_KEY = Buffer.alloc(32, 9).toString('base64');
      await assert.rejects(provisionLocalStagingAdmin(STAGING_CONFIRMATION), /loaded differently/);
      assert.equal(attempts, 0);
    `;
    const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code],
      { env, encoding: 'utf8', timeout: 10000 });
    assert.equal(child.status, 0, 'socket-tripwire subprocess must pass without a real connection');
    assert.equal(child.stdout, '');
    assert.equal(child.stderr, '');
  });
});
