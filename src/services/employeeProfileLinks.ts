/**
 * Phase 3 — Employee Profile: one consistent transaction link source.
 *
 * Official API mode never derives person-to-book links from names, subjects,
 * or free text. Local/demo legacy records can be displayed only when no
 * official link or ID mirror exists and their full normalized name is unique.
 */
import type { Employee, Transaction, TransactionEmployee } from '../types';
import { normalizeArabicName, splitEmployeeNames } from '../utils/employeeUtils';

export interface EmployeeProfileLinkInput {
  employee: Pick<Employee, 'id' | 'name'>;
  employees: ReadonlyArray<Pick<Employee, 'id' | 'name'>>;
  transactions: ReadonlyArray<Transaction>;
  transactionEmployees: ReadonlyArray<Pick<TransactionEmployee, 'transactionId' | 'employeeId'>>;
  /** True when the app is reading the authenticated server API. */
  officialMode: boolean;
}

function hasLegacyExactName(
  transaction: Transaction,
  normalizedName: string,
): boolean {
  if (splitEmployeeNames(transaction.employeeName).some(
    (candidate) => normalizeArabicName(candidate) === normalizedName,
  )) {
    return true;
  }

  // Older embedded daily situations may lack a top-level employeeName.
  // Inspect structured employeeName fields only, never arbitrary subject text.
  const daily = transaction.dailySituationData;
  if (!daily) return false;
  const groups = [
    daily.permanentLeaves,
    daily.permanentTimePermissions,
    daily.permanentShiftChanges,
    daily.temporaryLeaves,
    daily.temporaryTimePermissions,
    daily.temporaryShiftChanges,
  ];
  return groups.some((entries) => Array.isArray(entries)
    && entries.some((entry) =>
      normalizeArabicName(entry.employeeName) === normalizedName));
}

export function employeeProfileTransactions({
  employee,
  employees,
  transactions,
  transactionEmployees,
  officialMode,
}: EmployeeProfileLinkInput): Transaction[] {
  const ownLinks = new Set<string>();
  const anyLinks = new Set<string>();
  for (const link of transactionEmployees) {
    anyLinks.add(link.transactionId);
    if (link.employeeId === employee.id) ownLinks.add(link.transactionId);
  }

  const normalizedName = normalizeArabicName(employee.name);
  const uniqueLegacyName = normalizedName !== ''
    && employees.filter((person) =>
      normalizeArabicName(person.name) === normalizedName).length === 1;

  return transactions.filter((transaction) => {
    // Explicit M:N relation is authoritative, including when the legacy
    // employeeIds compatibility mirror is stale or points to someone else.
    if (anyLinks.has(transaction.id)) return ownLinks.has(transaction.id);

    const mirrorIds = transaction.employeeIds ?? [];
    if (mirrorIds.length > 0) return mirrorIds.includes(employee.id);

    // No unverified legacy text matching in the official personnel profile.
    if (officialMode || !uniqueLegacyName) return false;

    return hasLegacyExactName(transaction, normalizedName);
  });
}
