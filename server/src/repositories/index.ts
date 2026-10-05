/**
 * طبقة المستودعات (Phase 9) — العقود + تنفيذ PostgreSQL.
 * الواجهات في contracts.ts هي ما يستهلكه Phase 10.
 */
export * from './contracts';
export { PgAssignmentRepository } from './assignmentRepository';
export { PgAttachmentRepository } from './attachmentRepository';
export { PgCourseRepository } from './courseRepository';
export { PgDailySituationRepository } from './dailySituationRepository';
export { PgEmployeeRepository } from './employeeRepository';
export { PgLeaveRepository } from './leaveRepository';
export { PgLeaveBalanceRepository } from './leaveBalanceRepository';
export { PgLeaveLedgerRepository } from './leaveLedgerRepository';
export { PgTimePermissionRepository } from './timePermissionRepository';
export { PgTransactionAvailabilityRepository } from './availabilityRepository';
export { PgTransactionEmployeeRepository } from './transactionEmployeeRepository';
export { PgTransactionRepository } from './transactionRepository';
export { PgRequestRepository } from './requestRepository';
export { PgNotificationRepository } from './notificationRepository';
export { PgReminderRepository } from './reminderRepository';
export { PgTransactionRelationRepository } from './transactionRelationRepository';
export { transactionScopeCondition } from './transactionScopeSql';
export { buildWhere, isPool, limitOffsetClause, nullToUndefined, type Db } from './shared';
