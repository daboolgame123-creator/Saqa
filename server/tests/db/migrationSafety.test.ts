/**
 * Phase 9 — destructive migration operations are exercised ONLY against
 * the disposable embedded PostgreSQL test database, never staging or user DB.
 */
import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { Pool } from 'pg';
import {
  getMigrationStatus, loadMigrations, rollbackMigrations, runMigrations,
} from '../../src/database/migrations';
import { startTestDatabase, stopTestDatabase, tableExists } from './testDb';

describe('Phase 9 — concurrent migration safety and atomic rollback', () => {
  let pool: Pool;
  let dir: string;

  before(async () => {
    ({ pool } = await startTestDatabase({ migrate: false }));
    dir = await mkdtemp(path.join(os.tmpdir(), 'alsqaya-phase9-synthetic-'));
    // Files are intentionally not zero-padded alike: sorting must be numeric.
    await writeFile(path.join(dir, '1_first.sql'),
      '-- migrate:up\nCREATE TABLE phase9_first (id integer PRIMARY KEY);\n-- migrate:down\nDROP TABLE phase9_first;');
    await writeFile(path.join(dir, '02_second.sql'),
      '-- migrate:up\nCREATE TABLE phase9_second (id integer PRIMARY KEY);\n-- migrate:down\nSELECT 1 / 0;');
    await writeFile(path.join(dir, '10_tenth.sql'),
      '-- migrate:up\nCREATE TABLE phase9_tenth (id integer PRIMARY KEY);\n-- migrate:down\nDROP TABLE phase9_tenth;');
  });

  after(async () => {
    await stopTestDatabase();
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it('sorts versions numerically even when filename zero padding differs', async () => {
    const migrations = await loadMigrations({ dir });
    assert.deepEqual(migrations.map((file) => file.version), [1, 2, 10]);
  });

  it('serializes two concurrent upgrade runners instead of executing DDL twice', async () => {
    const runs = await Promise.all([
      runMigrations(pool, { dir }),
      runMigrations(pool, { dir }),
    ]);
    assert.deepEqual(runs.map((run) => run.appliedVersions.length).sort(), [0, 3]);
    for (const table of ['phase9_first', 'phase9_second', 'phase9_tenth']) {
      assert.equal(await tableExists(pool, table), true);
    }
    const status = await getMigrationStatus(pool, { dir });
    assert.deepEqual(status.map((row) => row.version), [1, 2, 10]);
    assert.equal(status.filter((row) => row.applied).length, 3);
  });

  it('rejects an older missing version when a newer version is already installed', async () => {
    const saved = await pool.query<{
      version: number; name: string; checksum: string; applied_at: string;
    }>('SELECT version, name, checksum, applied_at FROM schema_migrations WHERE version = 2');
    assert.equal(saved.rows.length, 1);
    await pool.query('DELETE FROM schema_migrations WHERE version = 2');
    try {
      await assert.rejects(
        () => runMigrations(pool, { dir }),
        /خارج الترتيب/,
      );
      assert.equal(await tableExists(pool, 'phase9_second'), true);
    } finally {
      const row = saved.rows[0];
      await pool.query(
        'INSERT INTO schema_migrations (version, name, checksum, applied_at) VALUES ($1, $2, $3, $4)',
        [row.version, row.name, row.checksum, row.applied_at],
      );
    }
  });

  it('refuses an oversized destructive rollback instead of silently dropping all migrations', async () => {
    await assert.rejects(
      () => rollbackMigrations(pool, 4, { dir }),
      /يتجاوز الإصدارات المطبّقة/,
    );
    for (const table of ['phase9_first', 'phase9_second', 'phase9_tenth']) {
      assert.equal(await tableExists(pool, table), true);
    }
    assert.equal((await getMigrationStatus(pool, { dir })).filter((item) => item.applied).length, 3);
  });

  it('rollback of multiple steps is atomic when an older down step fails', async () => {
    // Version 10 drops its table, but version 2 deliberately fails with
    // division by zero. The entire rollback must restore the version 10 table.
    await assert.rejects(
      () => rollbackMigrations(pool, 2, { dir }),
      (error: unknown) => error !== null
        && typeof error === 'object'
        && (error as { code?: string }).code === '22012',
    );
    assert.equal(await tableExists(pool, 'phase9_tenth'), true);
    assert.equal(await tableExists(pool, 'phase9_second'), true);
    const status = await getMigrationStatus(pool, { dir });
    assert.deepEqual(status.filter((entry) => entry.applied).map((entry) => entry.version), [1, 2, 10]);
  });

  it('status never hides a changed or renamed applied migration', async () => {
    const badFile = path.join(dir, '02_second.sql');
    const original = await readFile(badFile, 'utf8');
    try {
      await writeFile(badFile, original + '\n-- tampered');
      await assert.rejects(
        () => getMigrationStatus(pool, { dir }),
        /عُدِّل بعد تطبيقه/,
      );
    } finally {
      await writeFile(badFile, original);
    }
    const oldName = await pool.query<{ name: string }>(
      'SELECT name FROM schema_migrations WHERE version = 2',
    );
    await pool.query("UPDATE schema_migrations SET name = 'changed_name' WHERE version = 2");
    try {
      await assert.rejects(
        () => getMigrationStatus(pool, { dir }),
        /اسم migration المُطبَّق/,
      );
    } finally {
      await pool.query(
        'UPDATE schema_migrations SET name = $1 WHERE version = 2',
        [oldName.rows[0].name],
      );
    }
    assert.equal((await getMigrationStatus(pool, { dir })).length, 3);
  });
});
