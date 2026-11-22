import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DailySituationRecord, Employee, Transaction } from '../../src/core/models';
import { DailySituationService } from '../../src/services/dailySituationService';
import {
  dailySituationBelongsToEmployee,
  exactLegacySituationEmployeeId,
  independentDailySituationRecords,
} from '../../src/services/dailySituationProfileScope';

const employees = [
  { id: 'employee-a', name: 'محمد علي حسن' },
  { id: 'employee-b', name: 'محمد علي حسين' },
  { id: 'employee-c', name: 'سارة كريم' },
] as Employee[];

function row(id: string, employeeId: string, relatedRecord?: DailySituationRecord['relatedRecord']): DailySituationRecord {
  return {
    id, employeeId, date: '2026-09-15', category: 'permanent_leaves',
    ...(relatedRecord && { relatedRecord }),
  };
}
function book(id: string, entryName?: string): Transaction {
  return {
    id,
    dailySituationData: {
      situationDate: '2026/09/15',
      permanentLeaves: entryName ? [{
        id: 'entry-1', sequence: 1, employeeName: entryName,
        employmentType: 'دائمي', details: 'إجازة', date: '2026/09/15',
      }] : [],
      permanentTimePermissions: [], permanentShiftChanges: [],
      temporaryLeaves: [], temporaryTimePermissions: [], temporaryShiftChanges: [],
    },
  } as unknown as Transaction;
}

describe('Phase 6 — daily situation independent identity and historical data', () => {
  it('legacy name fallback requires the full normalized name, not overlapping words', () => {
    assert.equal(exactLegacySituationEmployeeId('محمد علي', employees), undefined);
    assert.equal(exactLegacySituationEmployeeId('محمد علي حسي', employees), undefined);
    assert.equal(exactLegacySituationEmployeeId('السيد محمد علي حسن', employees), 'employee-a');
    assert.equal(exactLegacySituationEmployeeId('محمد علي حسين', employees), 'employee-b');
    assert.equal(DailySituationService.resolveEmployeeId('محمد علي', employees), undefined);
  });

  it('ambiguous normalized employee names never become links', () => {
    const repeated = { id: 'employee-repeat', name: 'السيد محمد علي حسن' } as Employee;
    assert.equal(exactLegacySituationEmployeeId('محمد علي حسن', [...employees, repeated]), undefined);
    assert.equal(DailySituationService.resolveEmployeeId('محمد علي حسن', [...employees, repeated]), undefined);
  });

  it('employee filter uses an explicit employeeId first and does not show the wrong employee', () => {
    const daily = book('book-a', 'محمد علي حسين');
    assert.equal(dailySituationBelongsToEmployee(daily, [], 'employee-a', employees), false);
    assert.equal(dailySituationBelongsToEmployee(daily, [], 'employee-b', employees), true);
    assert.equal(dailySituationBelongsToEmployee(daily, [row('record', 'employee-a')], 'employee-a', employees), true);
  });

  it('migrated legacy entry cannot be reattached to a second employee through its name', () => {
    const daily = book('book-a', 'محمد علي حسن');
    const linkedToOther = row(
      DailySituationService.legacyRecordId(daily.id, 'entry-1'),
      'employee-b',
      { kind: 'transaction', id: daily.id },
    );
    assert.equal(dailySituationBelongsToEmployee(daily, [linkedToOther], 'employee-a', employees), false);
    assert.equal(dailySituationBelongsToEmployee(daily, [linkedToOther], 'employee-b', employees), true);
  });

  it('legacy entries remain unlinked when the name is partial or ambiguous', () => {
    const partial = DailySituationService.buildRecordsFromLegacyForm({
      transactionId: 'book-a', data: book('book-a', 'محمد علي').dailySituationData,
      employees,
    });
    assert.deepEqual(partial, []);
    const exact = DailySituationService.buildRecordsFromLegacyForm({
      transactionId: 'book-b', data: book('book-b', 'محمد علي حسن').dailySituationData,
      employees,
    });
    assert.equal(exact.length, 1);
    assert.equal(exact[0].employeeId, 'employee-a');
    assert.equal(exact[0].date, '2026-09-15');
  });

  it('standalone daily records are visible when no situation-book exists, never double counted', () => {
    const records = [
      row('attached', 'employee-a', { kind: 'transaction', id: 'book-a' }),
      row('orphaned-link', 'employee-b', { kind: 'transaction', id: 'missing-book' }),
      row('linked-leave', 'employee-c', { kind: 'leave', id: 'leave-1' }),
      row('no-link', 'employee-a'),
    ];
    assert.deepEqual(
      independentDailySituationRecords([{ id: 'book-a' }], records).map((record) => record.id),
      ['orphaned-link', 'linked-leave', 'no-link'],
    );
  });

  it('local PATCH never moves a daily record between employees', () => {
    const existing = [row('record-a', 'employee-a')];
    const result = DailySituationService.update(existing, 'record-a', { employeeId: 'employee-b' });
    assert.equal(result.ok, false);
    assert.equal(existing[0].employeeId, 'employee-a');
    const accepted = DailySituationService.update(existing, 'record-a', { notes: 'تصحيح توثيقي' });
    assert.equal(accepted.ok, true);
    if (accepted.ok) {
      assert.equal(accepted.value[0].employeeId, 'employee-a');
      assert.equal(accepted.value[0].notes, 'تصحيح توثيقي');
    }
  });
});
