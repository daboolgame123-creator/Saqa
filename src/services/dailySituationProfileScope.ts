/**
 * Phase 6: safe employee-ID scoping for the administrative daily-situation view.
 * The normalized exact name is a legacy fallback, not an alternative identity.
 */
import type { DailySituationRecord, Employee, Transaction } from '../core/models';
import { normalizeArabicName } from '../utils/employeeUtils';
import { DailySituationService } from './dailySituationService';

type EmployeeIdentity = Pick<Employee, 'id' | 'name'>;
type SituationBook = Pick<Transaction, 'id' | 'dailySituationData'>;

export function dailySituationBelongsToEmployee(
  book: SituationBook,
  records: ReadonlyArray<DailySituationRecord>,
  employeeId: string,
  employees: ReadonlyArray<EmployeeIdentity>,
): boolean {
  if (records.some((record) => record.employeeId === employeeId)) return true;

  const employee = employees.find((item) => item.id === employeeId);
  const expected = normalizeArabicName(employee?.name);
  if (!expected) return false;
  if (employees.filter((item) => normalizeArabicName(item.name) === expected).length !== 1) {
    return false;
  }

  const derivedIds = new Set(records.map((record) => record.id));
  return DailySituationService.legacyEntries(book.dailySituationData).some(({ entry }) => {
    const fullName = normalizeArabicName(entry.employeeName);
    if (!fullName || fullName !== expected) return false;
    // If a migrated row already exists, its employeeId is authoritative.
    if (entry.id && derivedIds.has(DailySituationService.legacyRecordId(book.id, entry.id))) {
      return false;
    }
    return true;
  });
}

/** Rows not associated with any loaded situation-book are independent records. */
export function independentDailySituationRecords(
  books: ReadonlyArray<Pick<Transaction, 'id'>>,
  records: ReadonlyArray<DailySituationRecord>,
): DailySituationRecord[] {
  const bookIds = new Set(books.map((book) => book.id));
  return records.filter((record) =>
    record.relatedRecord?.kind !== 'transaction'
    || !bookIds.has(record.relatedRecord.id));
}
