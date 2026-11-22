import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Employee, Transaction, TransactionEmployee } from '../../src/core/models';
import { TransactionEmployeeService as Links } from '../../src/services/transactionEmployeeService';

const employees = [
  { id: 'employee-a', name: 'محمد علي حسن' },
  { id: 'employee-b', name: 'محمد علي حسين' },
  { id: 'employee-c', name: 'سارة كريم أحمد' },
] as unknown as Employee[];

function book(id: string, fields: Record<string, unknown> = {}): Transaction {
  return { id, employeeIds: [], ...fields } as unknown as Transaction;
}

function link(
  id: string, transactionId: string, employeeId: string,
  relationshipType?: TransactionEmployee['relationshipType'],
): TransactionEmployee {
  return { id, transactionId, employeeId, ...(relationshipType && { relationshipType }) };
}

describe('Phase 5 — TransactionEmployee domain / historical linking safety', () => {
  it('legacy conversion never infers an identity from a partial or overlapping Arabic name', () => {
    assert.deepEqual(Links.resolveEmployeeIds(['محمد علي'], employees), []);
    assert.deepEqual(Links.resolveEmployeeIds(['محمد علي حسي'], employees), []);
    assert.deepEqual(Links.resolveEmployeeIds(['محمد علي حسن'], employees), ['employee-a']);
    assert.deepEqual(Links.resolveEmployeeIds(['السيد محمد علي حسن'], employees), ['employee-a']);
    assert.deepEqual(Links.resolveEmployeeIds(['محمد علي حسين'], employees), ['employee-b']);
  });

  it('two employees with identical normalized names must remain unresolved', () => {
    const duplicate = { id: 'employee-duplicate', name: 'السيد محمد علي حسن' } as Employee;
    assert.deepEqual(Links.resolveEmployeeIds(['محمد علي حسن'], [...employees, duplicate]), []);
  });

  it('seeding keeps separate relationship roles and preserves each real link ID', () => {
    const original = [
      link('subject-1', 'book-1', 'employee-a', 'subject'),
      link('recipient-1', 'book-1', 'employee-a', 'recipient'),
      link('duplicate-subject', 'book-1', 'employee-a', 'subject'),
      link('subject-other', 'book-1', 'employee-b', 'subject'),
    ];
    const transactions = [
      book('book-1', { employeeIds: ['employee-a', 'employee-b'] }),
    ];
    const once = Links.seedFromTransactions(original, transactions, employees);
    assert.deepEqual(once.map((r) => r.id), ['subject-1', 'recipient-1', 'subject-other']);
    assert.deepEqual(Links.employeeIdsForTransaction(once, 'book-1'), ['employee-a', 'employee-b']);
    const twice = Links.seedFromTransactions(once, transactions, employees);
    assert.deepEqual(twice, once, 'seeding is idempotent and role-specific');
  });

  it('old compatibility mirrors never resurrect a removed person if official links remain', () => {
    const existing = [link('real-link', 'book-2', 'employee-b', 'subject')];
    const oldBook = book('book-2', {
      employeeIds: ['employee-a', 'employee-b'],
      employeeName: 'محمد علي حسن',
    });
    const result = Links.seedFromTransactions(existing, [oldBook], employees);
    assert.deepEqual(result, existing);
  });

  it('name-only seed with ambiguous or partial name cannot create a link', () => {
    const transactions = [
      book('partial', { employeeName: 'محمد علي' }),
      book('exact', { employeeName: 'محمد علي حسن' }),
      book('ambiguous', { employeeName: 'محمد علي حسن' }),
    ];
    const fullDirectory = [...employees, { id: 'duplicate', name: 'السيد محمد علي حسن' } as Employee];
    assert.deepEqual(Links.seedFromTransactions([], transactions, fullDirectory), []);
    const one = Links.seedFromTransactions([], [transactions[1]], employees);
    assert.deepEqual(Links.employeeIdsForTransaction(one, 'exact'), ['employee-a']);
  });

  it('mirror IDs are backed up as-is only for a book with no existing relation', () => {
    const result = Links.seedFromTransactions([], [
      book('unlinked', { employeeIds: ['employee-a', 'employee-a', 'employee-b'] }),
    ], employees);
    assert.deepEqual(Links.employeeIdsForTransaction(result, 'unlinked'), ['employee-a', 'employee-b']);
  });

  it('sync retains all roles for a desired person, but drops every role for an explicitly unlinked person', () => {
    const original = [
      link('a-subject', 'book-a', 'employee-a', 'subject'),
      link('a-recipient', 'book-a', 'employee-a', 'recipient'),
      link('b-subject', 'book-a', 'employee-b', 'subject'),
      link('separate', 'book-b', 'employee-b', 'subject'),
    ];
    const synced = Links.syncForTransaction(original, 'book-a', ['employee-a']);
    assert.deepEqual(synced.map((r) => r.id), ['a-subject', 'a-recipient', 'separate']);
    assert.deepEqual(Links.employeeIdsForTransaction(synced, 'book-a'), ['employee-a']);
    assert.deepEqual(Links.employeeIdsForTransaction(synced, 'book-b'), ['employee-b']);
  });

  it('local link is idempotent and unlink removes only the correct person-book pair', () => {
    const original = [link('other', 'book-b', 'employee-a')];
    const once = Links.link(original, 'book-a', 'employee-a');
    assert.equal(once.ok, true);
    if (!once.ok) return;
    const twice = Links.link(once.value, 'book-a', 'employee-a');
    assert.equal(twice.ok, true);
    if (!twice.ok) return;
    assert.equal(twice.value.length, 2);
    const removed = Links.unlink(twice.value, 'book-a', 'employee-a');
    assert.equal(removed.ok, true);
    if (!removed.ok) return;
    assert.deepEqual(removed.value, original);
  });
});
