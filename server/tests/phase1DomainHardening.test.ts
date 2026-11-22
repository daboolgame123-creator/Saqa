import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Employee, User } from '../../src/core/models';
import { canUserAccessTransaction } from '../../src/core/models/accessScope';
import { TransactionEmployeeService } from '../../src/services/transactionEmployeeService';

const employees: Employee[] = [
  { id: 'emp-1', name: 'أحمد علي حسن', title: 'منتسب', department: 'الإدارية' },
  { id: 'emp-2', name: 'أحمد علي يوسف', title: 'منتسب', department: 'الإدارية' },
];

test('legacy name matching never guesses from shared words or partial names', () => {
  assert.deepEqual(TransactionEmployeeService.resolveEmployeeIds(['أحمد علي'], employees), []);
  assert.deepEqual(TransactionEmployeeService.resolveEmployeeIds(['أحمد علي حسن'], employees), ['emp-1']);
  assert.deepEqual(TransactionEmployeeService.resolveEmployeeIds(['الدكتور أحمد علي حسن'], employees), ['emp-1']);
  assert.deepEqual(TransactionEmployeeService.resolveEmployeeIds(['أحمد علي يوسف'], employees), ['emp-2']);
});

test('ambiguous normalized full names remain unresolved', () => {
  const duplicateNames: Employee[] = [
    employees[0],
    { ...employees[1], name: 'الدكتور أحمد علي حسن' },
  ];
  assert.deepEqual(TransactionEmployeeService.resolveEmployeeIds(['أحمد علي حسن'], duplicateNames), []);
});

test('local SpecificEmployees visibility requires matching employee ID, never display name', () => {
  const user: User = {
    id: 'user-2', username: 'emp2', displayName: 'أحمد علي',
    role: 'employee', employeeId: 'emp-2', isActive: true,
  };
  assert.equal(canUserAccessTransaction(user, {
    visibility: 'SpecificEmployees', employeeName: 'أحمد علي حسن',
  }), false);
  assert.equal(canUserAccessTransaction(user, {
    visibility: 'SpecificEmployees', employeeIds: ['emp-1'], employeeName: 'أحمد علي',
  }), false);
  assert.equal(canUserAccessTransaction(user, {
    visibility: 'SpecificEmployees', employeeIds: ['emp-2'],
  }), true);
  assert.equal(canUserAccessTransaction(user, { visibility: 'PublicToEmployees' }), true);
  assert.equal(canUserAccessTransaction({ ...user, isActive: false }, {
    visibility: 'PublicToEmployees',
  }), false);
});

test('multiple roles never duplicate employee IDs in the local compatibility mirror', () => {
  const links = [
    { id: 'link-1', transactionId: 'tr-1', employeeId: 'emp-1', relationshipType: 'subject' as const },
    { id: 'link-2', transactionId: 'tr-1', employeeId: 'emp-1', relationshipType: 'recipient' as const },
    { id: 'link-3', transactionId: 'tr-1', employeeId: 'emp-2', relationshipType: 'subject' as const },
  ];
  assert.deepEqual(TransactionEmployeeService.employeeIdsForTransaction(links, 'tr-1'), ['emp-1', 'emp-2']);
});
