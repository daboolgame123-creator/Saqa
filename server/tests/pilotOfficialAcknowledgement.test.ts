/** Explicit official acknowledgement pilot: synthetic protocol/UI tests. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { acknowledgeTransactionOfficial } from '../../src/api/acknowledgement';
import { createApiClient, type FetchLike } from '../../src/api/apiClient';
import { setBearerToken } from '../../src/api/sessionToken';
import { TransactionDetailModal } from '../../src/components/modals/TransactionDetailModal';
import { TransactionsList } from '../../src/components/views/TransactionsList';
import { INITIAL_TRANSACTIONS } from '../../src/data/mockData';

const tx = 'book-synthetic';
const user = 'user-synthetic';
const stamp = '2026-11-07T08:00:00.000Z';

function fakeClient(response: unknown, status = 200) {
  const seen: Array<{url: string; method: string | undefined; body: BodyInit | null | undefined; authorization: string | null}> = [];
  const fetchImpl: FetchLike = async (url, init) => {
    seen.push({
      url,
      method: init?.method,
      body: init?.body,
      authorization: new Headers(init?.headers).get('authorization'),
    });
    return new Response(JSON.stringify(response), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  return {seen, client: createApiClient({baseUrl: 'http://test.invalid/api', fetchImpl})};
}

function confirmation(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'viewlog-synthetic',
    transactionId: tx,
    userId: user,
    employeeId: 'employee-synthetic',
    viewedAt: stamp,
    acknowledgedAt: stamp,
    ...overrides,
  };
}

test('official acknowledgement POST carries Bearer but sends no actor or request body', async () => {
  const f = fakeClient(confirmation());
  setBearerToken('SYNTHETIC_SESSION');
  try {
    assert.equal(await acknowledgeTransactionOfficial(tx, user, f.client), stamp);
    assert.equal(f.seen.length, 1);
    assert.deepEqual(f.seen[0], {
      url: 'http://test.invalid/api/transactions/book-synthetic/acknowledge',
      method: 'POST',
      body: undefined,
      authorization: 'Bearer SYNTHETIC_SESSION',
    });
  } finally { setBearerToken(null); }
});

test('official acknowledgement never accepts forged/mismatched or unconfirmed response', async () => {
  for (const invalid of [
    null, {}, confirmation({id: ''}), confirmation({transactionId:'another-book'}),
    confirmation({userId:'another-user'}), confirmation({userId:null}),
    confirmation({acknowledgedAt:null}), confirmation({acknowledgedAt:' '}),
  ]) {
    const f = fakeClient(invalid);
    await assert.rejects(acknowledgeTransactionOfficial(tx, user, f.client), /Invalid acknowledgement/);
  }
  await assert.rejects(acknowledgeTransactionOfficial(' ', user), /Missing authenticated identity/);
  await assert.rejects(acknowledgeTransactionOfficial(tx, ''), /Missing authenticated identity/);
});

test('403 and 404 failures reject, without inventing successful acknowledgement', async () => {
  for (const status of [403, 404, 503]) {
    const f = fakeClient({error:{code:'PERMISSION_DENIED',message:'denied'}}, status);
    await assert.rejects(acknowledgeTransactionOfficial(tx, user, f.client),
      (err: unknown) => !!err && typeof err === 'object' && 'status' in err && err.status === status);
  }
});

test('official modal never claims acknowledgement on open and has deliberate button only', () => {
  const transaction = INITIAL_TRANSACTIONS[0];
  assert.ok(transaction);
  const props = {transaction, onClose: () => {}, onUpdateStatus: () => {}};
  const official = renderToStaticMarkup(React.createElement(TransactionDetailModal, {
    ...props,
    officialMode: true,
    onAcknowledge: async () => stamp,
  }));
  assert.match(official, /id="btn-official-acknowledge"/);
  assert.match(official, /عرض الكتاب لا يسجّل/);
  assert.doesNotMatch(official, /تم تسجيل «اطلعت» رسميًا في الخادم/);
  assert.doesNotMatch(official, /تم الاطلاع على الكتاب وقراءته ✓/);
  const demo = renderToStaticMarkup(React.createElement(TransactionDetailModal, props));
  assert.match(demo, /تم الاطلاع على الكتاب وقراءته ✓/);
  assert.doesNotMatch(demo, /id="btn-official-acknowledge"/);
});

test('official transaction cards display no fake read or acknowledgement state', () => {
  const transaction = INITIAL_TRANSACTIONS[0];
  assert.ok(transaction);
  const official = renderToStaticMarkup(React.createElement(TransactionsList, {
    transactions: [transaction],
    onSelectTransaction: () => {},
    onUpdateStatus: () => {},
    onOpenNewModal: () => {},
    userRole: 'employee',
    isServerMode: true,
  }));
  assert.match(official, /افتح الكتاب واضغط «اطلعت»/);
  assert.doesNotMatch(official, /غير مقروء 🔴|تم الاطلاع ✓|مقروء ✓/);
  const demo = renderToStaticMarkup(React.createElement(TransactionsList, {
    transactions: [transaction],
    onSelectTransaction: () => {},
    onUpdateStatus: () => {},
    onOpenNewModal: () => {},
    userRole: 'employee',
    isServerMode: false,
  }));
  assert.match(demo, /غير مقروء 🔴|تم الاطلاع ✓/);
});

test('App only connects official API stamp with server account identity, not opening the modal', () => {
  const source = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  assert.match(source, /officialMode=\{!isLocalDemo\}/);
  assert.match(source, /acknowledgeTransactionOfficial\(transactionId, serverAccount\.id\)/);
  assert.match(source, /onAcknowledge=\{!isLocalDemo && serverAccount !== null/);
  assert.match(source, /key=\{selectedTransaction\.id\}/);
  const previewHandler = source.split('const handleSelectTransaction =')[1]?.split('// Mark all as read')[0];
  assert.ok(previewHandler);
  assert.doesNotMatch(previewHandler, /acknowledgeTransactionOfficial/); // preview never stamps
});
