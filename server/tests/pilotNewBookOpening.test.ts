/**
 * Phase15-N: both book-detail and direct attachment preview pass a confirmed,
 * session-bound open. Tests are synthetic, without browser, network or DB.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { confirmBookOpenedForSession } from '../../src/api/confirmedBookOpening';
import { TransactionsList } from '../../src/components/views/TransactionsList';
import { INITIAL_TRANSACTIONS } from '../../src/data/mockData';

test('opening is confirmed before displaying content or clearing NEW', async () => {
  const events: string[] = [];
  await confirmBookOpenedForSession(
    'book-fixture',
    () => true,
    () => events.push('confirmed'),
    () => events.push('denied'),
    async (id) => {
      assert.equal(id, 'book-fixture');
      events.push('server-confirmation');
    },
  );
  assert.deepEqual(events, ['server-confirmation', 'confirmed']);
});

test('failed opening never invokes a display callback or clears NEW', async () => {
  for (const status of [403, 404, 503]) {
    let displayed = false;
    let denied = false;
    await confirmBookOpenedForSession(
      'book-fixture', () => true,
      () => { displayed = true; },
      () => { denied = true; },
      async () => { throw new Error(String(status)); },
    );
    assert.equal(displayed, false, 'no details/lightbox on a failed response');
    assert.equal(denied, true, 'display an authorization/unavailability error');
  }
});

test('account changes while preview request is in flight cannot show old content or clear another account tag', async () => {
  let release!: () => void;
  const server = new Promise<void>((resolve) => { release = resolve; });
  let sessionIsCurrent = true;
  let opened = false;
  let denied = false;
  const request = confirmBookOpenedForSession(
    'book-fixture',
    () => sessionIsCurrent,
    () => { opened = true; },
    () => { denied = true; },
    () => server,
  );
  sessionIsCurrent = false; // logout or account switch while request is in flight
  release();
  await request;
  assert.equal(opened, false);
  assert.equal(denied, false, 'do not contaminate the replacement session with errors');
});

test('both existing vertical and table layouts show NEW, and wire preview to the common handler', () => {
  const transaction = INITIAL_TRANSACTIONS[0];
  assert.ok(transaction);
  for (const mode of ['vertical', 'table'] as const) {
    const markup = renderToStaticMarkup(React.createElement(TransactionsList, {
      transactions: [transaction],
      newBookIds: new Set([transaction.id]),
      initialViewMode: mode,
      isServerMode: true,
      userRole: 'employee',
      onSelectTransaction: () => {},
      onViewAttachmentDirectly: () => {},
      onUpdateStatus: () => {},
      onOpenNewModal: () => {},
    }));
    assert.match(markup, /جديد/, `${mode}: per-user mark must be present`);
    assert.match(markup, /معاينة/, `${mode}: preview affordance remains available`);
    assert.doesNotMatch(markup, /تم تسجيل «اطلعت» رسميًا في الخادم/,
      `${mode}: preview never claims formal acknowledgement`);
  }
  const listSource = readFileSync(
    new URL('../../src/components/views/TransactionsList.tsx', import.meta.url), 'utf8',
  );
  const previewCallbacks = listSource.match(
    /if \(tr\.attachments && tr\.attachments\.length > 0 && onViewAttachmentDirectly\) \{\s*onViewAttachmentDirectly\(tr, 0\);/g,
  ) ?? [];
  assert.equal(previewCallbacks.length, 2,
    'card AND table preview buttons use the shared App callback');

  const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const detailOpen = appSource.split('const handleSelectTransaction =')[1]?.split('// Mark all as read')[0];
  const attachmentOpen = appSource.split('const handleViewAttachmentDirectly =')[1]?.split('function validMutationRecord')[0];
  assert.match(detailOpen ?? '', /openOfficialBook\(tr, \(\) => setSelectedTransaction\(tr\)\)/);
  assert.match(attachmentOpen ?? '', /openOfficialBook\(tr, \(\) => setDirectAttachmentView/);
  assert.doesNotMatch(attachmentOpen ?? '', /acknowledgeTransactionOfficial/);
  const editorGate = appSource.split('const handleEditTransaction =')[1]?.split('// Mark all as read')[0];
  assert.match(editorGate ?? '', /openOfficialBook\(tr, \(\) => setEditingTransaction\(tr\)\)/);
  assert.match(appSource, /else openOfficialBook\(editingTransaction, preview\)/,
    'editor lightbox must not bypass server-confirmed book opening');
});
