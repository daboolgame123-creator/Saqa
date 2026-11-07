/**
 * Phase23 pilot: browser-control parity tests against the server RBAC contract.
 * Synthetic roles and data only. Hiding controls is UX, NOT authorization:
 * server/src/authorization/permissions.ts remains the enforcement source.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Header } from '../../src/components/layout/Header';
import { TransactionsList } from '../../src/components/views/TransactionsList';
import { INITIAL_TRANSACTIONS } from '../../src/data/mockData';

type Role = 'admin' | 'director' | 'employee';

function header(role: Role, official = true): string {
  return renderToStaticMarkup(React.createElement(Header, {
    currentView: 'transactions', setCurrentView: () => {},
    onOpenNewModal: () => {}, transactions: [],
    userRole: role, setUserRole: () => {}, allowRoleSwitch: !official,
    onMarkAllAsRead: () => {}, isDarkMode: false,
    onToggleDarkMode: () => {}, onOpenSearch: () => {},
  }));
}

test('official header: admin can create; director only supervises; employee cannot open daily register', () => {
  const admin = header('admin');
  const director = header('director');
  const employee = header('employee');
  assert.match(admin, /id="btn-add-transaction"/);
  assert.match(admin, /id="tab-daily-situations"/);
  assert.doesNotMatch(admin, /id="tab-archivist-studio"/); // legacy local-only editor
  assert.doesNotMatch(director, /id="btn-add-transaction"/);
  assert.match(director, /id="tab-daily-situations"/);
  assert.doesNotMatch(employee, /id="btn-add-transaction"|id="tab-daily-situations"/);
  for (const page of [admin, director, employee]) {
    assert.doesNotMatch(page, /id="role-director"|id="btn-header-mark-all-read"/);
  }
});

test('local demo role behavior remains independent from official server policy', () => {
  assert.match(header('director', false), /id="btn-add-transaction"/);
  assert.match(header('admin', false), /id="tab-archivist-studio"/);
});

test('official transaction list shows neither edit/status controls for director nor fake delete for admin', () => {
  const row = INITIAL_TRANSACTIONS[0];
  assert.ok(row);
  function list(role: Role): string {
    return renderToStaticMarkup(React.createElement(TransactionsList, {
      transactions: [row], onSelectTransaction: () => {},
      onUpdateStatus: () => {}, onOpenNewModal: () => {}, userRole: role,
      isServerMode: true, onEditTransaction: () => {}, onDeleteTransaction: () => {},
    }));
  }
  const director = list('director');
  const admin = list('admin');
  assert.doesNotMatch(director, /تحرير ومرفقات ✏️|title="تحرير المعاملة والمرفقات"/);
  assert.doesNotMatch(director, /حذف هذه المعاملة نهائياً من السجل|title="حذف المعاملة"/);
  assert.match(admin, /تحرير ومرفقات ✏️|title="تحرير المعاملة والمرفقات"/);
  assert.doesNotMatch(admin, /حذف هذه المعاملة نهائياً من السجل|title="حذف المعاملة"/);
  assert.doesNotMatch(director, /onchange=/i); // no status change in API pilot
});

test('App API-mode permissions and unsupported writes remain fail-closed', () => {
  const app = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
  const employee = readFileSync(new URL('../../src/components/views/EmployeesView.tsx', import.meta.url), 'utf8');
  const daily = readFileSync(new URL('../../src/components/views/DailySituationsView.tsx', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../../src/components/modals/TransactionDetailModal.tsx', import.meta.url), 'utf8');
  assert.match(app, /canManageRecords = isLocalDemo \|\| serverAccount\?\.role === 'admin'/);
  const bootstrap = readFileSync(new URL('../../src/api/pilotBootstrap.ts', import.meta.url), 'utf8');
  assert.match(app, /loadPilotStartupData\(/);
  assert.match(bootstrap, /role === 'admin' \|\| role === 'director'/);
  assert.match(bootstrap, /source.kind === 'local'/);
  assert.match(app, /currentView === 'daily-situations' && canViewDailySituations/);
  assert.match(app, /currentView === 'archivist-studio' && isLocalDemo/);
  assert.ok(app.includes('onDeleteTransaction={canManageRecords ? handleDeleteTransaction : undefined}'));
  assert.ok(app.includes('archivePilotTransaction(id, record.version)'));
  assert.match(app, /onUpdateAttachments=\{isLocalDemo \? handleUpdateAttachments : undefined\}/);
  assert.match(employee, /onUpdateEmployee && <button/);
  assert.match(employee, /onDeleteEmployee && <button/);
  assert.match(employee, /onSaveTransaction && <button/);
  assert.match(daily, /allowCreate && <button/);
  assert.match(detail, /disabled=\{!canEditStatus\}/);
});
