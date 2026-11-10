/**
 * Phase 24-G: read a database and file tree RESTORED by 24-D using the
 * real Express application middleware/SQL repositories/storage/auth flows.
 * Strictly disposable localhost CI; never installed as a production route.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createPool } from '../../src/database/pool';
import { FileStorage } from '../../src/storage';
import {
  startApiTestContext, getJson, getAttachmentContent,
  useTestSession, type ApiTestContext,
} from '../api/apiTestHelpers';
import { newAuthenticatedAccount } from '../api/apiTestData';

const EMPLOYEE = '00000000-0000-4000-8000-000000002401';
const TRANSACTION = '00000000-0000-4000-8000-000000002402';
const ATTACHMENT = 'ab000000-0000-4000-8000-000000002403';
const KEY = `blobs/${ATTACHMENT.slice(0, 2)}/${ATTACHMENT.slice(2, 4)}/${ATTACHMENT}`;
const EXPECTED = Buffer.from('%PDF-1.7\nSYNTHETIC-PHASE24-D\n');

function requireIsolatedRestoredTarget(): { url: string; storageRoot: string } {
  const url = process.env.RESTORE_TEST_DATABASE_URL;
  const source = process.env.DATABASE_URL;
  const dir = process.env.ALSQAYA_RESTORED_STORAGE_ROOT;
  if (process.env.CI !== 'true' || process.env.NODE_ENV !== 'test' ||
      !url || !source || !dir || url === source) {
    throw new Error('24-G readback requires a distinct disposable CI restore target');
  }
  let target: URL;
  let original: URL;
  try {
    target = new URL(url);
    original = new URL(source);
  } catch {
    throw new Error('24-G database URLs must be valid');
  }
  const dbName = decodeURIComponent(target.pathname.slice(1));
  if (!['postgres:', 'postgresql:'].includes(target.protocol) ||
      !['127.0.0.1', 'localhost'].includes(target.hostname) ||
      !dbName.startsWith('alsqaya_restore_test_') ||
      !/^alsqaya_restore_test_[a-zA-Z0-9_]+$/.test(dbName) ||
      target.hostname !== original.hostname ||
      target.pathname === original.pathname ||
      target.username !== original.username ||
      !resolve(dir).includes('alsqaya-24d-ci-')) {
    throw new Error('24-G target is not the approved isolated local test restore');
  }
  return { url, storageRoot: resolve(dir) };
}

async function main(): Promise<void> {
  const { url, storageRoot } = requireIsolatedRestoredTarget();
  assert.deepEqual(await readFile(join(storageRoot, KEY)), EXPECTED,
    'Restored file bytes must exist before starting application API');
  const pool = createPool(url);
  let api: ApiTestContext | undefined;
  try {
    // Before creating test-only accounts, prove original rows were preserved
    // by actual pg reads from the recovered database, not from the source.
    const original = await pool.query<{ records: string }>(`
      SELECT (
        (SELECT count(*) FROM view_logs WHERE transaction_id = $1) +
        (SELECT count(*) FROM audit_logs WHERE entity_id = $1)
      )::text AS records`, [TRANSACTION]);
    assert.equal(original.rows[0].records, '2',
      'Original ViewLog and AuditLog must survive real restore');
    const stored = await pool.query<{ id: string; storage_key: string; content_hash: string }>(
      'SELECT id, storage_key, content_hash FROM attachments WHERE id = $1', [ATTACHMENT]);
    assert.equal(stored.rows.length, 1);
    assert.equal(stored.rows[0].storage_key, KEY);
    assert.equal(stored.rows[0].content_hash, 'sha256:' +
      (await import('node:crypto')).createHash('sha256').update(EXPECTED).digest('hex'));

    api = await startApiTestContext(pool, new FileStorage({ rootDir: storageRoot }));
    useTestSession(null);
    const anon = await getJson(api.baseUrl, `/api/transactions/${TRANSACTION}`);
    assert.equal(anon.status, 401, 'Restored data must not bypass authentication');

    // Auth workflow genuinely registers/logs in through Express against the
    // restored database. These two new accounts exist ONLY in the disposable
    // clone and are not part of the source snapshot.
    const admin = await newAuthenticatedAccount(api, {
      badgeNumber: 'REST-24G-ADMIN', phone: '07700240001',
      name: 'RESTORE_SYNTH_ADMIN', secret: '24G-Synthetic-Only-Secret',
      role: 'admin',
    });
    assert.ok(admin.sessionToken.length > 20);
    const book = await getJson<{ id: string; subject: string }>(
      api.baseUrl, `/api/transactions/${TRANSACTION}`);
    assert.equal(book.status, 200);
    assert.equal(book.body.id, TRANSACTION);
    assert.equal(book.body.subject, 'backup test');
    const employee = await getJson<{ id: string; name: string }>(
      api.baseUrl, `/api/employees/${EMPLOYEE}`);
    assert.equal(employee.status, 200);
    assert.equal(employee.body.id, EMPLOYEE);

    const files = await getJson<Array<{ id: string; transactionId: string; integrityState: string }>>(
      api.baseUrl, `/api/transactions/${TRANSACTION}/attachments`);
    assert.equal(files.status, 200);
    assert.equal(files.body.length, 1);
    assert.equal(files.body[0].id, ATTACHMENT);
    assert.equal(files.body[0].transactionId, TRANSACTION);
    const downloaded = await getAttachmentContent(api.baseUrl, TRANSACTION, ATTACHMENT);
    assert.equal(downloaded.status, 200, 'Restored attachment must be served by real HTTP controller');
    assert.equal(downloaded.headers.get('cache-control'), 'no-store');
    assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), EXPECTED);
    const integrity = await getJson<{ integrityState: string }>(
      api.baseUrl, `/api/transactions/${TRANSACTION}/attachments/${ATTACHMENT}/integrity`);
    assert.equal(integrity.status, 200);
    assert.equal(integrity.body.integrityState, 'verified');

    const staff = await newAuthenticatedAccount(api, {
      badgeNumber: 'REST-24G-EMP', phone: '07700240002',
      name: 'RESTORE_SYNTH_EMP', secret: '24G-Synthetic-Only-Secret',
      role: 'employee',
    });
    assert.ok(staff.sessionToken);
    const deniedBook = await getJson(api.baseUrl, `/api/transactions/${TRANSACTION}`);
    assert.equal(deniedBook.status, 404, 'Restored admin-only book leaked to an employee');
    const deniedFile = await getAttachmentContent(api.baseUrl, TRANSACTION, ATTACHMENT);
    assert.equal(deniedFile.status, 404, 'Restored admin-only attachment leaked to employee');
    await deniedFile.arrayBuffer(); // drain before clean shutdown

    useTestSession(admin.sessionToken);
    const official = await getJson<{ error: { code: string } }>(
      api.baseUrl, '/api/reports?reportType=incoming');
    assert.equal(official.status, 503);
    assert.equal(official.body.error.code, 'REPORTS_UNAVAILABLE');
    console.log('PHASE24_G_RESTORED_APPLICATION_HTTP_PASS: login, book, employee, bytes, integrity, scope, 503');
  } finally {
    useTestSession(null);
    if (api) await api.running.shutdown();
    await pool.end();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
