/** Fresh PostgreSQL + real HTTP, only inside the approved guarded sandbox. */
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import EmbeddedPostgres from 'embedded-postgres';
import type { Pool } from 'pg';
import { createPool } from '../../src/database/pool';
import { runMigrations } from '../../src/database/migrations';
import { buildApiTestApp, useTestSession, type ApiTestContext } from '../api/apiTestHelpers';
import { silenceLogs, waitForListening } from '../helpers';

interface IsolationConfig {
  root: string; dbPort: number; httpPort: number; user: string; password: string; database: string;
}

export interface PersonnelTestSuite {
  context: ApiTestContext;
  pool: Pool;
  baseUrl: string;
  stop(): Promise<void>;
}

export async function startPersonnelTestSuite(): Promise<PersonnelTestSuite> {
  // Requiring the guard also validates its marker, cwd and opt-in before any DB operation.
  const config = createRequire(import.meta.url)('./personnelIsolation.cjs') as IsolationConfig;
  const dataDir = path.join(config.root, '.personnel-postgres');
  assert.equal(existsSync(dataDir), false, 'Never reuse or overwrite a database directory');
  const postgres = new EmbeddedPostgres({
    databaseDir: dataDir, port: config.dbPort, user: config.user, password: config.password,
    persistent: true, initdbFlags: ['--encoding=UTF8'],
    postgresFlags: ['-h', '127.0.0.1'], onLog: () => undefined,
    onError: message => console.error('[isolated-pg]', String(message)),
  });
  let pool: Pool | undefined;
  try {
    await postgres.initialise();
    await postgres.start();
    const admin = postgres.getPgClient('postgres', '127.0.0.1');
    try {
      await admin.connect();
      const result = await admin.query<{ data_directory: string }>('SHOW data_directory');
      assert.equal(path.resolve(result.rows[0].data_directory).toLowerCase(), dataDir.toLowerCase());
      // New database only, after verifying the spawned cluster's actual directory. No DROP.
      await admin.query('CREATE DATABASE alsqaya_personnel_test');
    } finally { await admin.end(); }
    pool = createPool(`postgres://${config.user}:${config.password}@127.0.0.1:${config.dbPort}/${config.database}`);
    assert.equal((await pool.query<{ name: string }>('SELECT current_database() AS name')).rows[0].name, config.database);
    await runMigrations(pool);
    silenceLogs();
    const { app, services, authService, otpProvider } = buildApiTestApp(pool);
    const server = app.listen(config.httpPort, '127.0.0.1');
    const port = await waitForListening(server);
    const baseUrl = `http://127.0.0.1:${port}`;
    const shutdown = async () => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    };
    const context: ApiTestContext = {
      pool, services, authService, otpProvider, baseUrl,
      running: { server, port, baseUrl, shutdown },
    };
    useTestSession(null);
    const testPool = pool;
    return {
      context, pool: testPool, baseUrl,
      async stop() {
        try { await shutdown(); }
        finally { try { await testPool.end(); } finally { await postgres.stop(); } }
      },
    };
  } catch (error) {
    try { if (pool) await pool.end(); } finally { await postgres.stop(); }
    throw error;
  }
}
