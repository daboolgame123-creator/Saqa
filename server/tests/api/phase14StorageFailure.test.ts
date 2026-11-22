/**
 * Phase 14-B: a failed disk write must remain a failed HTTP upload, never
 * a verified attachment; metadata stays marked missing for host diagnosis.
 * Test only: synthetic embedded PostgreSQL, no real storage volume.
 */
import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { Pool } from 'pg';
import { resetDomainTables } from '../db/testDb';
import {
  getJson,
  postAttachment,
  useTestSession,
  type ApiErrorBody,
} from './apiTestHelpers';
import { newAuthenticatedAccount, newTransaction } from './apiTestData';
import { startApiSuite, stopApiSuite, type ApiTestSuite } from './apiTestSuite';
import { FileStorage } from '../../src/storage';

describe('Phase14-B: unconfigured storage cannot falsely verify an upload', () => {
  let suite: ApiTestSuite;
  let pool: Pool;
  let baseUrl: string;

  before(async () => {
    // Not a path on the host: this intentionally unconfigured FileStorage
    // cannot open or write files, while PostgreSQL is entirely synthetic.
    suite = await startApiSuite(new FileStorage({ rootDir: '' }));
    pool = suite.pool;
    baseUrl = suite.baseUrl;
  });
  beforeEach(async () => { await resetDomainTables(pool); });
  after(async () => { await stopApiSuite(suite); });

  it('returns 503 and leaves only missing metadata on failed disk write', async () => {
    const admin = await newAuthenticatedAccount(suite.context, {
      badgeNumber: 'A14-B-01', phone: '07704444001',
      secret: 'Synthetic-Storage-Only-14', role: 'admin',
    });
    useTestSession(admin.sessionToken);
    const transaction = await newTransaction(suite.context, {
      number: '14B/001',
      subject: 'Storage failure synthetic',
    });
    const uploaded = await postAttachment<ApiErrorBody>(
      baseUrl, transaction.id, {
        filename: 'failure.pdf',
        content: Buffer.from('%PDF-1.7\nsynthetic-failed-write', 'latin1'),
        declaredMimeType: 'application/pdf',
      },
    );
    assert.equal(uploaded.status, 503);
    assert.equal(uploaded.body.error?.code, 'ATTACHMENT_STORAGE_NOT_CONFIGURED');

    const records = await pool.query<{
      id: string; integrityState: string | null; storageKey: string | null; contentHash: string | null;
    }>(
      `SELECT id, integrity_state AS "integrityState", storage_key AS "storageKey",
              content_hash AS "contentHash"
       FROM attachments WHERE transaction_id=$1`,
      [transaction.id],
    );
    assert.equal(records.rows.length, 1, 'metadata remains available for diagnosis');
    assert.equal(records.rows[0].integrityState, 'missing');
    assert.ok(records.rows[0].storageKey?.startsWith('blobs/'));
    assert.ok(records.rows[0].contentHash?.startsWith('sha256:'));

    const listed = await getJson<{
      id: string; integrityState: string | null;
    }[]>(baseUrl, `/api/transactions/${transaction.id}/attachments`);
    assert.equal(listed.status, 200, 'administrator may inspect a failed upload record');
    assert.equal(listed.body.length, 1);
    assert.equal(listed.body[0].integrityState, 'missing', 'never claim verified bytes');
  });
});
