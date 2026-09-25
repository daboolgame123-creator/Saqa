/**
 * طبقة المستودعات (Phase 9) — العقود + تنفيذ PostgreSQL.
 * الواجهات في contracts.ts هي ما يستهلكه Phase 10.
 */
export * from './contracts';
export { PgAssignmentRepository } from './assignmentRepository';
export { PgCourseRepository } from './courseRepository';
export { PgDailySituationRepository } from './dailySituationRepository';
export { PgEmployeeRepository } from './employeeRepository';
export { PgLeaveRepository } from './leaveRepository';
export { PgTimePermissionRepository } from './timePermissionRepository';
export { PgTransactionEmployeeRepository } from './transactionEmployeeRepository';
export { PgTransactionRepository } from './transactionRepository';
export { buildWhere, isPool, limitOffsetClause, nullToUndefined, type Db } from './shared';
