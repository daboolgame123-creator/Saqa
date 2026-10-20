/**
 * ط·ط¨ظ‚ط© ط®ط¯ظ…ط§طھ ط§ظ„ظ€API (Phase 10).
 *
 * ظ‡ط°ظ‡ ط§ظ„ط·ط¨ظ‚ط© ظ‡ظٹ آ«ط³ظٹط§ظ‚ ط§ظ„طھط·ط¨ظٹظ‚آ» ظپظˆظ‚ `repositories`:
 * - طھط³طھط¯ط¹ظٹ ط§ظ„ظ…ط³طھظˆط¯ط¹ (ط§ظ„ظ…طµط¯ط± ط§ظ„ظˆط­ظٹط¯ ظ„ظ„ط¨ظٹط§ظ†ط§طھ).
 * - طھط­ظˆظ‘ظ„ `null` ط¥ظ„ظ‰ `NotFoundError` ط¨ط¯ظ„ طھظ…ط±ظٹط± null ظ„ظ„ظˆط§ط¬ظ‡ط©.
 * - طھط­ظˆظ‘ظ„ ط³ط¬ظ„ ط§ظ„ظ…ط³طھظˆط¯ط¹ ط¥ظ„ظ‰ DTO ط¹ط¨ط± `dto/recordMappers`.
 *
 * ظ…ط§ ظ„ط§ طھظپط¹ظ„ظ‡ ط¹ظ…ط¯ط§ظ‹:
 * - ظ„ط§ طھط­ظ‚ظ‚ (middleware ط§ظ„طھط­ظ‚ظ‚ ط³ط¨ظ‚ ط§ظ„ط®ط¯ظ…ط©) ظˆظ„ط§ طµظ„ط§ط­ظٹط§طھ (ظپط±ط¶ظ‡ط§ ظˆط³ظٹط·
 *   `authorization` ط¹ظ„ظ‰ ط§ظ„ظ…ط³ط§ط± â€” Phase 12) ظˆظ„ط§ ط­ط³ط§ط¨ ظ†ط·ط§ظ‚ ط§ظ„ط±ط¤ظٹط©
 *   (ظ‚ط±ط§ط±ظ‡ط§ ظپظٹ `authorization/accessScope.ts` â€” Phase 13).
 * - ظ„ط§ طھط·ط¨ط¹ ظˆظ„ط§ طھط´طھظ‚: ظƒظ„ ظ‚ظٹظ…ط© ظ…ظ† ط§ظ„ظ€record ظƒظ…ط§ ط£طھطھ ظ…ظ† ط§ظ„ظ‚ط§ط¹ط¯ط©.
 *
 * Phase 13: ط®ط¯ظ…ط§طھ ط§ظ„ظƒطھط¨ ظˆط§ظ„ط±ظˆط§ط¨ط· طھظ‚ط¨ظ„ `TransactionScopeFilter` ظ…ط¨ظ†ظٹط§ظ‹ ظپظٹ
 * ط·ط¨ظ‚ط© ط§ظ„طھظپظˆظٹط¶ ظˆطھظ…ط±ظ‘ط±ظ‡ ط¥ظ„ظ‰ ط§ظ„ظ…ط³طھظˆط¯ط¹طŒ ظپظ„ط§ طھظڈظپظ„طھط± ط§ظ„ط³ط¬ظ„ط§طھ ظپظٹ ظ‡ط°ظ‡ ط§ظ„ط·ط¨ظ‚ط©
 * ظˆظ„ط§ ط¨ط¹ط¯ ظ‚ط±ط§ط،طھظ‡ط§ â€” ط§ظ„طھظ‚ظٹظٹط¯ ظپظٹ ط§ظ„ط§ط³طھط¹ظ„ط§ظ… ظ†ظپط³ظ‡.

 *
 * ط¥ظ†ط´ط§ط، ط§ظ„ط®ط¯ظ…ط§طھ: طھظ…ط±ظٹط± `db` ظٹط³ظ…ط­ ط¨ط§ط®طھط¨ط§ط±ظ‡ط§ ط¹ظ„ظ‰ `Client` ط¯ط§ط®ظ„ ظ…ط¹ط§ظ…ظ„ط©
 * ط£ظˆ ط¹ظ„ظ‰ `Pool` ظ…ط¨ط§ط´ط±ط©طŒ ط¨ظ†ظپط³ ظ†ظ…ط· ظ…ط³طھظˆط¯ط¹ط§طھ Phase 9.
 */
import type { Pool } from 'pg';
import { getSharedPool, type Queryable } from '../../database';
import {
  PgAssignmentRepository,
  PgAttachmentRepository,
  PgCourseRepository,
  PgDailySituationRepository,
  PgEmployeeRepository,
  PgLeaveRepository,
  PgNotificationRepository,
  PgTimePermissionRepository,
  PgLeaveBalanceRepository,
  PgLeaveLedgerRepository,
  PgReminderRepository,
  PgRequestRepository,
  PgTransactionRelationRepository,
  PgTransactionAvailabilityRepository,
  PgTransactionEmployeeRepository,
  PgTransactionRepository,
  PgSearchRepository,
  type AssignmentRepository,
  type AttachmentRepository,
  type CourseRepository,
  type DailySituationRepository,
  type EmployeeRepository,
  type LeaveRepository,
  type LeaveBalanceRepository,
  type LeaveLedgerRepository,
  type NotificationRepository,
  type ReminderRepository,
  type RequestRepository,
  type TimePermissionRepository,
  type TransactionAvailabilityRepository,
  type TransactionEmployeeRepository,
  type TransactionRelationRepository,
  type TransactionRepository,
  type SearchRepository,
} from '../../repositories';
import { PersonnelRulesEngine } from '../../services/personnelRules';
import { getFileStorage, type FileStorage } from '../../storage';
import { EmployeeApiService } from './employeeService';
import { SearchApiService } from './searchService';
import { AttachmentApiService } from './attachmentService';
import { TransactionApiService } from './transactionService';
import { TransactionAvailabilityApiService } from './availabilityService';
import { TransactionEmployeeApiService } from './linkService';
import { TransactionRelationApiService } from './relationService';
import { AuditApiService } from './auditService';
import { ViewLogApiService } from './viewLogService';

import { DailySituationApiService } from './dailySituationService';
import {
  AssignmentApiService,
  CourseApiService,
  LeaveApiService,
  LeaveBalanceApiService,
  TimePermissionApiService,
  type PersonnelRepositories,
} from './personnelService';
import { TimelineApiService } from './timelineService';
import { RequestApiService } from './requestService';
import { NotificationApiService, ReminderApiService } from './notificationService';
import { NotificationEventService } from '../../services/notificationEvents';

/** ط§ظ„ظ…ط³طھظˆط¯ط¹ط§طھ ط§ظ„ظ…طھط§ط­ط© ظ„ط®ط¯ظ…ط§طھ ط§ظ„ظ€API. */
export interface ApiRepositories extends PersonnelRepositories {
  employees: EmployeeRepository;
  transactions: TransactionRepository;
  transactionEmployees: TransactionEmployeeRepository;
  transactionAvailability: TransactionAvailabilityRepository;
  /** Phase 20 â€” ط§ط±طھط¨ط§ط· ط§ظ„ظƒطھط¨ (Related BooksطŒ آ§36). */
  transactionRelations: TransactionRelationRepository;
  dailySituations: DailySituationRepository;
  attachments: AttachmentRepository;
  /** Phase 19 â€” ط§ظ„ط·ظ„ط¨ط§طھ ظˆط³ط¬ظ„ طھط؛ظٹظٹط±ط§طھ ط­ط§ظ„طھظ‡ط§ (آ§18/آ§35). */
  requests: RequestRepository;
  /** Phase 21 â€” ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ ظˆط§ظ„طھط°ظƒظٹط±ط§طھ (آ§20/آ§21). */
  notifications: NotificationRepository;
  reminders: ReminderRepository;
  search: SearchRepository;
}

/** ظƒظ„ ط®ط¯ظ…ط§طھ ط§ظ„ظ€API ظ…ط¬طھظ…ط¹ط© (ظ…ط§ ظٹظ…ط±ط±ظ‡ ط§ظ„ط±ط§ظˆطھط± ط¥ظ„ظ‰ ط§ظ„ظ€controller). */
export interface ApiServices {
  employees: EmployeeApiService;
  transactions: TransactionApiService;
  transactionRelations: TransactionRelationApiService;
  transactionEmployees: TransactionEmployeeApiService;
  availability: TransactionAvailabilityApiService;
  transactionAvailability: TransactionAvailabilityApiService;
  dailySituations: DailySituationApiService;
  leaves: LeaveApiService;
  timePermissions: TimePermissionApiService;
  assignments: AssignmentApiService;
  courses: CourseApiService;
  /** Phase 18 â€” ط§ظ„ط£ط±طµط¯ط© ظˆط³ط¬ظ„ ط­ط±ظƒط§طھ ط§ظ„ط±طµظٹط¯ (آ§7.9/آ§7.10/آ§15). */
  leaveBalances: LeaveBalanceApiService;
  /** Phase 19 â€” ط§ظ„ط·ظ„ط¨ط§طھ ظˆط³ظٹط± ط§ظ„ظ…ظˆط§ظپظ‚ط©: ظ‚ط±ط§ط،ط© + طھط¹ط¯ظٹظ„ ظ…ط³ظˆظ‘ط¯ + ط¹ظ…ظ„ظٹط§طھ Workflow. */
  requests: RequestApiService;
  timeline: TimelineApiService;
  attachments: AttachmentApiService;
  /** ط³ط¬ظ„ ط§ظ„طھط¯ظ‚ظٹظ‚ (Phase 15) â€” ظƒطھط§ط¨ط© ط§ظ„ط£ط­ط¯ط§ط« ط§ظ„ط­ط³ط§ط³ط© ظˆظ‚ط±ط§ط،ط© `view_audit_logs`. */
  audit: AuditApiService;
  /** ط³ط¬ظ„ ط§ظ„ط§ط·ظ„ط§ط¹ ط§ظ„ط±ط³ظ…ظٹ (Phase 15) â€” ط®طھظ… آ«ط§ط·ظ„ط¹طھآ» idempotent. */
  viewLogs: ViewLogApiService;
  /**
   * Phase 21 â€” ظ‚ط±ط§ط،ط© ط¥ط´ط¹ط§ط±ط§طھ طµط§ط­ط¨ ط§ظ„ط¬ظ„ط³ط© ظˆطھط¹ظ„ظٹظ…ظ‡ط§ ظƒظ…ظ‚ط±ظˆط، (آ§20).
   *
   * `userId` ظٹط£طھظٹ ظ…ظ† `req.auth` ط­طµط±ط§ظ‹ط› ظ„ط§ طھظ‚ط¨ظ„ ط§ظ„ط®ط¯ظ…ط© ظ‚ظٹظ…ط© ظ…ظ† ط§ظ„ط¹ظ…ظٹظ„.
   */
  notifications: NotificationApiService;
  /** Phase 21 â€” ط§ظ„طھط°ظƒظٹط±ط§طھ: ط¥ظ†ط´ط§ط، ظˆظ‚ط±ط§ط،ط© ظˆطھط¹ط¯ظٹظ„ (آ§21). */
  reminders: ReminderApiService;
  /**
   * Phase 21 â€” **ظ…ط­ط±ظ‘ظƒ ط¥ظ†ط´ط§ط، ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ ظ…ظ† ط§ظ„ط£ط­ط¯ط§ط«** (آ§20).
   *
   * ظٹظڈط³طھط¯ط¹ظ‰ ظ…ظ† ط§ظ„ظ€controllers **ط¨ط¹ط¯ ظ†ط¬ط§ط­ ط§ظ„ط¹ظ…ظ„ظٹط©** (ظ†ظپط³ ظ…ظˆط¶ط¹ طھط¯ظ‚ظٹظ‚
   * `AuditApiService`)طŒ ظپطھط±طھظٹط¨ Event â†’ Notification ظ…ط­ظپظˆط¸: ظ„ط§ ط¥ط´ط¹ط§ط±
   * ظ„ط¹ظ…ظ„ظٹط© ظ„ظ… طھظ†ط¬ط­طŒ ظˆظ„ط§ ط¥ط´ط¹ط§ط± ظ‚ط¨ظ„ ط§ط¬طھظٹط§ط² ط§ظ„طµظ„ط§ط­ظٹط§طھ ظˆط§ظ„ظ†ط·ط§ظ‚ (آ§28).
   */
  notificationEvents: NotificationEventService;
  search: SearchApiService;
}

/** ظٹظ†ط´ط¦ ط§ظ„ظ…ط³طھظˆط¯ط¹ط§طھ ط¹ظ„ظ‰ ط§طھطµط§ظ„ ظˆط§ط­ط¯ (Pool ط£ظˆ Client ط¯ط§ط®ظ„ ظ…ط¹ط§ظ…ظ„ط©). */
export function createApiRepositories(db: Queryable): ApiRepositories {
  return {
    employees: new PgEmployeeRepository(db),
    transactions: new PgTransactionRepository(db),
    transactionEmployees: new PgTransactionEmployeeRepository(db),
    transactionAvailability: new PgTransactionAvailabilityRepository(db),
    // Phase 20 â€” ط¬ط¯ظˆظ„ ط§ط±طھط¨ط§ط· ط§ظ„ظƒطھط¨ (`transaction_relations`).
    transactionRelations: new PgTransactionRelationRepository(db),
    dailySituations: new PgDailySituationRepository(db),
    attachments: new PgAttachmentRepository(db),
    leaves: new PgLeaveRepository(db),
    timePermissions: new PgTimePermissionRepository(db),
    assignments: new PgAssignmentRepository(db),
    courses: new PgCourseRepository(db),
    // Phase 18 â€” ط§ظ„ط£ط±طµط¯ط© ظˆط³ط¬ظ„ ط§ظ„ط­ط±ظƒط§طھ (ظ†ظپط³ ط§ظ„ط§طھطµط§ظ„).
    leaveBalances: new PgLeaveBalanceRepository(db),
    leaveLedger: new PgLeaveLedgerRepository(db),
    // Phase 19 â€” ط§ظ„ط·ظ„ط¨ط§طھ ظˆط³ط¬ظ„ طھط؛ظٹظٹط±ط§طھ ط§ظ„ط­ط§ظ„ط© (ظ†ظپط³ ط§ظ„ط§طھطµط§ظ„).
    requests: new PgRequestRepository(db),
    // Phase 21 â€” ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ ظˆط§ظ„طھط°ظƒظٹط±ط§طھ (ظ†ظپط³ ط§ظ„ط§طھطµط§ظ„).
    notifications: new PgNotificationRepository(db),
    reminders: new PgReminderRepository(db),
    // U3
    search: new PgSearchRepository(db),
  };
}

/**
 * ظٹظ†ط´ط¦ ط§ظ„ط®ط¯ظ…ط§طھ ط¹ظ„ظ‰ ط§طھطµط§ظ„ ظˆط§ط­ط¯.
 *
 * `fileStorage` ط§ط®طھظٹط§ط±ظٹ: ط§ظ„ط¥ظ†طھط§ط¬ ظٹطھط±ظƒظ‡ ظپظٹظڈط¨ظ†ظ‰ ظ…ظ† ط¥ط¹ط¯ط§ط¯ط§طھ ط§ظ„ط¨ظٹط¦ط©طŒ ظˆط§ظ„ط§ط®طھط¨ط§ط±
 * ظٹظ…ط±ظ‘ط± ط·ط¨ظ‚ط© طھط®ط²ظٹظ† ط¨ط¬ط°ط± ظ…ط¤ظ‚طھ. طھظ…ط±ظٹط±ظ‡ طµط±ظٹط­ط§ظ‹ (ظ„ط§ ظ…طھط؛ظٹط± ط¨ظٹط¦ط©) ظ‡ظˆ ظ…ط§ ظٹظ…ظ†ط¹
 * ط§ط®طھط¨ط§ط±ط§طھ HTTP ظ…ظ† ط§ظ„ظƒطھط§ط¨ط© ط¥ظ„ظ‰ ظ…ط³ط§ط± ط¥ظ†طھط§ط¬ظٹ.
 *
 * Phase 18: ط§ظ„ظ…ط­ط±ظ‘ظƒ ظٹط­طھط§ط¬ `Pool` ظ„ظٹط¹ظ‚ط¯ ظ…ط¹ط§ظ…ظ„ط§طھ ط°ط±ظ‘ظٹط©طŒ ظپظٹظڈط¨ظ†ظ‰ ط¹ظ„ظ‰ ط§ظ„ظ€Pool
 * ظ…ط¨ط§ط´ط±ط©ظ‹. ظ†ط¯ط§ط،ط§طھ `createApiServices` ط¨ظ€`Client` (ط¯ط§ط®ظ„ ظ…ط¹ط§ظ…ظ„ط© ظ‚ط§ط¦ظ…ط©) طھط¨ظ‚ظٹ
 * طھط¹ظ…ظ„ ظ„ظ„ط¨ظ‚ظٹط©طŒ ظˆظ…ط­ط±ظ‘ظƒ ط§ظ„ظ‚ظˆط§ط¹ط¯ ظ‡ظˆ ط§ظ„ظ…ظˆط±ط¯ ط§ظ„ظˆط­ظٹط¯ ط§ظ„ط°ظٹ ظٹط·ظ„ط¨ ط§ظ„ظ€Pool.
 */
export function createApiServices(
  db: Queryable = getSharedPool(),
  fileStorage?: FileStorage,
): ApiServices {
  const repositories = createApiRepositories(db);
  const rules = new PersonnelRulesEngine(db as Pool, {
    employees: repositories.employees,
    leaves: repositories.leaves,
    timePermissions: repositories.timePermissions,
    balances: repositories.leaveBalances,
    ledger: repositories.leaveLedger,
  });
  const availabilityService = new TransactionAvailabilityApiService(
    repositories.transactions,
    repositories.transactionAvailability,
    repositories.transactionEmployees,
    repositories.employees,
  );
  return {
    employees: new EmployeeApiService(repositories.employees),
    transactions: new TransactionApiService(repositories.transactions, db),
    transactionRelations: new TransactionRelationApiService(
      repositories.transactions,
      repositories.transactionRelations,
    ),
    transactionEmployees: new TransactionEmployeeApiService(repositories.transactionEmployees),
    availability: availabilityService,
    transactionAvailability: availabilityService,
    dailySituations: new DailySituationApiService(repositories.dailySituations),
    leaves: new LeaveApiService(repositories.leaves, rules, repositories.leaveBalances),
    timePermissions: new TimePermissionApiService(
      repositories.timePermissions,
      rules,
      repositories.leaveBalances,
    ),
    leaveBalances: new LeaveBalanceApiService(
      repositories.leaveBalances,
      repositories.leaveLedger,
      rules,
    ),
    assignments: new AssignmentApiService(repositories.assignments),
    courses: new CourseApiService(repositories.courses),
    // Phase 19 â€” ط§ظ„ط·ظ„ط¨ط§طھ: ط§ظ„ظ†ط·ط§ظ‚ ظˆط§ظ„ظ‚ظپظ„ ظˆط§ظ„ط°ط±ظ‘ظٹط© ط¯ط§ط®ظ„ ط§ظ„ظ…ط³طھظˆط¯ط¹طŒ ظˆط§ظ„ظپط±ط¶
    // ط§ظ„ظپط¹ظ„ظٹ ظ„ظ„طµظ„ط§ط­ظٹط© ط¹ظ„ظ‰ ط§ظ„ظ…ط³ط§ط± ظپظٹ `routes/requestRoutes.ts`.
    requests: new RequestApiService(repositories.requests),
    timeline: new TimelineApiService(repositories),
    // ط§ظ„ظ…ط±ظپظ‚ط§طھ طھط­طھط§ط¬ ط§ظ„ط·ط¨ظ‚طھظٹظ†: ظ…ط³طھظˆط¯ط¹ ط§ظ„ظ€metadata ظˆط·ط¨ظ‚ط© ط§ظ„ظ‚ط±طµطŒ ظˆطھظ‚ط±ط£
    // ط§ظ„ط®ط¯ظ…ط© ظ…ظ†ظ‡ظ…ط§ ظ…ط¹ط§ظ‹. `getFileStorage()` ظ‡ظ†ط§ ظ„ط§ ظٹط¨ظ†ظٹ ط´ظٹط¦ط§ظ‹ ط¹ظ„ظ‰ ط§ظ„ظ‚ط±طµ â€”
    // ط§ظ„ط¨ظ†ط§ط، ظƒط³ظˆظ„ ط­طھظ‰ ط£ظˆظ„ ظƒطھط§ط¨ط© ظپط¹ظ„ظٹط©.
    attachments: new AttachmentApiService(
      repositories.attachments,
      repositories.transactions,
      fileStorage ?? getFileStorage(),
    ),
    // Phase 15: ط·ط¨ظ‚طھط§ ط§ظ„ط³ط¬ظ„ظٹظ† â€” ط§ظ„طھط¯ظ‚ظٹظ‚ ط¹ظ„ظ‰ ظ†ظپط³ ط§ظ„ط§طھطµط§ظ„طŒ ظˆط³ط¬ظ„ ط§ظ„ط§ط·ظ„ط§ط¹
    // ظٹظ‚ط±ط£ ط§ظ„ظƒطھط¨ ط¹ط¨ط± ط§ظ„ظ…ط³طھظˆط¯ط¹ ظ†ظپط³ظ‡ ظ„ظٹطھظˆط§ظپظ‚ ظپط­طµ ط§ظ„ظ…ط±ط¦ظٹط© ظ…ط¹ ط§ظ„ظ‚ط±ط§ط،ط©.
    audit: new AuditApiService(db),
    viewLogs: new ViewLogApiService(db, repositories.transactions),
    // Phase 21 â€” ط§ظ„ط¥ط´ط¹ط§ط±ط§طھ ظˆط§ظ„طھط°ظƒظٹط±ط§طھ. `NotificationApiService` ظٹظ‚ط±ط£
    // (`userId` ظ…ظ† ط§ظ„ط¬ظ„ط³ط©)طŒ ظˆ`ReminderApiService` ظٹط¯ظٹط± ط§ظ„طھط°ظƒظٹط±ط§طھطŒ ظˆ
    // `NotificationEventService` ظ‡ظˆ **ظ…ط­ط±ظ‘ظƒ ط§ظ„ط¥ظ†ط´ط§ط، ظ…ظ† ط§ظ„ط£ط­ط¯ط§ط«** â€” ظ†ظپط³
    // ط§ظ„ط§طھطµط§ظ„طŒ ظپظ„ط§ ظٹظڈظپطھط­ ط§ط³طھط¹ظ„ط§ظ… ط«ط§ظ†ظچ ط¹ظ„ظ‰ ط؛ظٹط± ظ…ط§ ظƒظڈطھط¨.
    notifications: new NotificationApiService(repositories.notifications),
    reminders: new ReminderApiService(repositories.reminders),
    // U4
    search: new SearchApiService(repositories.search),
    notificationEvents: new NotificationEventService(db),
  };
}

/**
 * ط§ظ„ط®ط¯ظ…ط§طھ ط§ظ„ط§ظپطھط±ط§ط¶ظٹط© ط¹ظ„ظ‰ ط§ظ„ظ€Pool ط§ظ„ظ…ط´طھط±ظƒ.
 * طھظڈط¨ظ†ظ‰ ط¹ظ†ط¯ ط£ظˆظ„ ط§ط³طھظٹط±ط§ط¯طŒ ظˆظ‡ظˆ ظ…ط§ ظٹط¹ظ†ظٹ ط±ظ…ظٹ ط®ط·ط£ ظˆط§ط¶ط­ ط¥ظ† ظ„ظ… ظٹظƒظ†
 * `DATABASE_URL` ظ…ظ‡ظٹط£ظ‹ â€” ظˆظ‡ط°ط§ ظ…ظ‚طµظˆط¯: ظ„ط§ ظ…ط³ط§ط± ط¨ظٹط§ظ†ط§طھ ط¨ظ„ط§ ظ‚ط§ط¹ط¯ط©.
 */
let sharedServices: ApiServices | null = null;

/** ظٹط¹ظٹط¯ ط§ظ„ط®ط¯ظ…ط§طھ ط§ظ„ظ…ط´طھط±ظƒط©طŒ ظˆظٹظ†ط´ط¦ظ‡ط§ ط¨ط£ظˆظ„ ط§ط³طھط¯ط¹ط§ط،. */
export function getApiServices(): ApiServices {
  if (sharedServices === null) {
    sharedServices = createApiServices(getSharedPool());
  }
  return sharedServices;
}

/** ظٹط¨ظ†ظٹ ط§ظ„ط®ط¯ظ…ط§طھ ط¹ظ„ظ‰ Pool طµط±ظٹط­ (ظ„ظ„ط§ط®طھط¨ط§ط±ط§طھ ظˆCLI). */
export function createApiServicesOnPool(pool: Pool, fileStorage?: FileStorage): ApiServices {
  return createApiServices(pool, fileStorage);
}