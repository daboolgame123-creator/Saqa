import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type {
  EmployeeLeave,
  Transaction,
  TimelineEntry,
  DailySituationRecord,
} from '../../src/core/models';
import { TimelineService } from '../../src/services/timelineService';

type TimelineParams = Parameters<typeof TimelineService.buildForEmployee>[0];

function build(overrides: Partial<TimelineParams> = {}) {
  return TimelineService.buildForEmployee({
    employeeId: 'employee-a',
    leaves: [],
    timePermissions: [],
    assignments: [],
    courses: [],
    transactions: [],
    dailySituations: [],
    ...overrides,
  });
}

function book(id: string, employeeIds: string[], date = '2026-09-15'): Transaction {
  return {
    id, employeeIds, date, number: id, sequence: id,
    direction: 'وارد', subject: 'كتاب مرتبط', status: 'قيد المراجعة',
  } as unknown as Transaction;
}

function entry(id: string, date: string): TimelineEntry {
  return {
    id,
    sourceType: 'transaction',
    sourceId: id,
    employeeId: 'employee-a',
    date,
    title: id,
  };
}

describe('Phase 7 — derived timeline integrity', () => {
  it('a book linked by several roles contributes one event, not several', () => {
    const records = [book('book-a', ['employee-a']), book('book-a', ['employee-a'])];
    const result = build({ transactions: records, transactionIds: ['book-a', 'book-a'] });
    assert.equal(result.totalCount, 1);
    assert.equal(result.countsBySource.transaction, 1);
    assert.deepEqual(result.entries.map((e) => e.sourceId), ['book-a']);
  });

  it('an explicit empty book scope overrides a stale employeeIds mirror', () => {
    const records = [book('book-a', ['employee-a'])];
    assert.equal(build({ transactions: records, transactionIds: [] }).totalCount, 0);
    assert.equal(build({ transactions: records }).totalCount, 1);
  });

  it('unrelated books never appear because subject text resembles the employee', () => {
    const records = [book('unrelated', ['employee-b'])];
    assert.equal(build({ transactions: records, transactionIds: [] }).totalCount, 0);
  });

  it('repeated personnel and daily rows are deduplicated, but distinct source kinds remain', () => {
    const leave = {
      id: 'same-id', employeeId: 'employee-a', startDate: '2026-09-15',
      endDate: '2026-09-16', type: 'annual', status: 'registered',
    } as EmployeeLeave;
    const daily = {
      id: 'same-id', employeeId: 'employee-a',
      date: '2026-09-15', category: 'permanent_leaves',
    } as DailySituationRecord;
    const result = build({ leaves: [leave, leave], dailySituations: [daily, daily] });
    assert.equal(result.totalCount, 2);
    assert.equal(result.countsBySource.leave, 1);
    assert.equal(result.countsBySource.dailySituation, 1);
  });

  it('counts are based on unique source rows before filtering and limiting', () => {
    const result = build({
      transactions: [book('a', ['employee-a']), book('b', ['employee-a'])],
      transactionIds: ['a', 'b'],
      filter: { sourceTypes: ['transaction'], limit: 1 },
    });
    assert.equal(result.totalCount, 2);
    assert.equal(result.entries.length, 1);
    assert.equal(result.countsBySource.transaction, 2);
  });

  it('timeline API and UI filter by the event source date, not its optional end date', () => {
    const leave = {
      id: 'leave-span', employeeId: 'employee-a',
      startDate: '2026-09-15', endDate: '2026-10-10',
      type: 'annual', status: 'approved',
      notes: 'إجازة طويلة',
    } as EmployeeLeave;
    const result = build({
      leaves: [leave],
      filter: { dateTo: '2026-09-20', searchText: '  إجازة طويلة  ' },
    });
    assert.equal(result.totalCount, 1);
    assert.equal(result.entries.length, 1, 'start date is the chronological event anchor');
    assert.equal(result.entries[0].date, '2026-09-15');
    assert.equal(result.entries[0].endDate, '2026-10-10');
  });

  it('ISO week: Sunday belongs to preceding Monday, including 2020/2021 boundary', () => {
    const dates = ['2020-12-28', '2020-12-31', '2021-01-01', '2021-01-02', '2021-01-03', '2021-01-04'];
    const groups = TimelineService.groupByPeriod(dates.map((d) => entry(d, d)), 'week');
    assert.deepEqual(groups.map((g) => [g.period, g.count]), [
      ['2021-W01', 1], ['2020-W53', 5],
    ]);
  });

  it('ISO week-year of Dec 31 can be the following year', () => {
    const groups = TimelineService.groupByPeriod(
      [entry('a', '2018-12-31'), entry('b', '2019-01-01')], 'week',
    );
    assert.deepEqual(groups.map((g) => [g.period, g.count]), [['2019-W01', 2]]);
  });

  it('ascending and descending sort reorder both groups and events within each group', () => {
    const dates = [
      entry('jan-a', '2026-01-03'), entry('jan-b', '2026-01-01'),
      entry('feb-a', '2026-02-05'), entry('feb-b', '2026-02-01'),
    ];
    const original = dates.map((row) => row.id);
    const asc = TimelineService.groupByPeriod(dates, 'month', 'asc');
    const desc = TimelineService.groupByPeriod(dates, 'month', 'desc');
    assert.deepEqual(asc.map((g) => g.period), ['2026-01', '2026-02']);
    assert.deepEqual(asc[0].entries.map((g) => g.id), ['jan-b', 'jan-a']);
    assert.deepEqual(desc.map((g) => g.period), ['2026-02', '2026-01']);
    assert.deepEqual(desc[0].entries.map((g) => g.id), ['feb-a', 'feb-b']);
    assert.deepEqual(dates.map((row) => row.id), original, 'source entries must not be mutated');
  });

  it('unknown or non-calendar dates stay in last undated group in either sort direction', () => {
    const dates = [
      entry('unknown', ''), entry('feb30', '2026-02-30'),
      entry('known', '2026-01-01'),
    ];
    for (const sort of ['asc', 'desc'] as const) {
      const groups = TimelineService.groupByPeriod(dates, 'week', sort);
      assert.deepEqual(groups.map((g) => g.period), ['2026-W01', 'unknown']);
      assert.equal(groups[1].count, 2);
    }
  });
});
