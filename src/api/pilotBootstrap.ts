/**
 * Phase 23 — pilot startup: one scoped read of each required resource.
 *
 * API mode is fail-closed: no fallback to mock/local data on 401/403 or
 * network errors. A visible transaction's link rows are read through
 * the existing scoped route, with bounded fan-out to protect the LAN server.
 */
import type {
  Employee, Transaction, TransactionEmployee, DailySituationRecord,
  EmployeeLeave, EmployeeTimePermission, EmployeeAssignment, EmployeeCourse,
} from '../core/models';
import type { IDataAdapter } from '../core/interfaces/dataAdapter';

export type PilotBootstrapSource = Pick<IDataAdapter,
  'kind' | 'loadEmployees' | 'loadTransactions' | 'loadDailySituations' |
  'loadLinksByTransaction' | 'loadLeaves' | 'loadTimePermissions' |
  'loadAssignments' | 'loadCourses'
>;

export interface PilotStartupData {
  employees: Employee[];
  transactions: Transaction[];
  transactionEmployees: TransactionEmployee[];
  dailySituations: DailySituationRecord[];
  employeeLeaves: EmployeeLeave[];
  employeeTimePermissions: EmployeeTimePermission[];
  employeeAssignments: EmployeeAssignment[];
  employeeCourses: EmployeeCourse[];
}

const MAX_PARALLEL_LINK_READS = 8;

/** Every visible transaction is consulted, but never all at once. */
async function loadScopedLinks(
  source: PilotBootstrapSource,
  transactions: Transaction[],
): Promise<TransactionEmployee[]> {
  const groups: TransactionEmployee[][] = new Array(transactions.length);
  let next = 0;
  const count = Math.min(MAX_PARALLEL_LINK_READS, transactions.length);
  await Promise.all(Array.from({ length: count }, async () => {
    while (next < transactions.length) {
      const index = next++;
      const transaction = transactions[index];
      if (!transaction) continue;
      // If any link request fails, the entire startup rejects: never show
      // an apparently complete dossier assembled from a partial response.
      groups[index] = await source.loadLinksByTransaction(transaction.id);
    }
  }));
  return groups.flat();
}

/**
 * Source role is the login-validated server role in API mode; demo may use
 * its mock role. The employee's daily register is explicitly forbidden by
 * the backend, so do not request it as part of startup.
 */
export async function loadPilotStartupData(
  source: PilotBootstrapSource,
  role: 'admin' | 'director' | 'employee',
): Promise<PilotStartupData> {
  const mayReadDaily = source.kind === 'local' || role === 'admin' || role === 'director';

  // Fetch exactly once per resource, with no extra "preflight employees"
  // call. All personnel endpoints enforce per-user scope on the server.
  const [
    employees, transactions, dailySituations,
    employeeLeaves, employeeTimePermissions, employeeAssignments, employeeCourses,
  ] = await Promise.all([
    source.loadEmployees({}),
    source.loadTransactions(),
    mayReadDaily
      ? source.loadDailySituations()
      : Promise.resolve([] as DailySituationRecord[]),
    source.loadLeaves(),
    source.loadTimePermissions(),
    source.loadAssignments(),
    source.loadCourses(),
  ]);

  const transactionEmployees = await loadScopedLinks(source, transactions);
  return {
    employees, transactions, transactionEmployees, dailySituations,
    employeeLeaves, employeeTimePermissions, employeeAssignments, employeeCourses,
  };
}
