/**
 * طبقة خدمات الـAPI (Phase 10).
 *
 * هذه الطبقة هي «سياق التطبيق» فوق `repositories`:
 * - تستدعي المستودع (المصدر الوحيد للبيانات).
 * - تحوّل `null` إلى `NotFoundError` بدل تمرير null للواجهة.
 * - تحوّل سجل المستودع إلى DTO عبر `dto/recordMappers`.
 *
 * ما لا تفعله عمداً:
 * - لا تحقق (middleware التحقق سبق الخدمة) ولا صلاحيات (Phase 12/13).
 * - لا تطبع ولا تشتق: كل قيمة من الـrecord كما أتت من القاعدة.
 *
 * إنشاء الخدمات: تمرير `db` يسمح باختبارها على `Client` داخل معاملة
 * أو على `Pool` مباشرة، بنفس نمط مستودعات Phase 9.
 */
import type { Pool } from 'pg';
import { getSharedPool, type Queryable } from '../../database';
import {
  PgAssignmentRepository,
  PgCourseRepository,
  PgDailySituationRepository,
  PgEmployeeRepository,
  PgLeaveRepository,
  PgTimePermissionRepository,
  PgTransactionEmployeeRepository,
  PgTransactionRepository,
  type AssignmentRepository,
  type CourseRepository,
  type DailySituationRepository,
  type EmployeeRepository,
  type LeaveRepository,
  type TimePermissionRepository,
  type TransactionEmployeeRepository,
  type TransactionRepository,
} from '../../repositories';
import { EmployeeApiService } from './employeeService';
import { TransactionApiService } from './transactionService';
import { TransactionEmployeeApiService } from './linkService';
import { DailySituationApiService } from './dailySituationService';
import {
  AssignmentApiService,
  CourseApiService,
  LeaveApiService,
  TimePermissionApiService,
  type PersonnelRepositories,
} from './personnelService';
import { TimelineApiService } from './timelineService';

/** المستودعات المتاحة لخدمات الـAPI. */
export interface ApiRepositories extends PersonnelRepositories {
  employees: EmployeeRepository;
  transactions: TransactionRepository;
  transactionEmployees: TransactionEmployeeRepository;
  dailySituations: DailySituationRepository;
}

/** كل خدمات الـAPI مجتمعة (ما يمرره الراوتر إلى الـcontroller). */
export interface ApiServices {
  employees: EmployeeApiService;
  transactions: TransactionApiService;
  transactionEmployees: TransactionEmployeeApiService;
  dailySituations: DailySituationApiService;
  leaves: LeaveApiService;
  timePermissions: TimePermissionApiService;
  assignments: AssignmentApiService;
  courses: CourseApiService;
  timeline: TimelineApiService;
}

/** ينشئ المستودعات الثمانية على اتصال واحد (Pool أو Client داخل معاملة). */
export function createApiRepositories(db: Queryable): ApiRepositories {
  return {
    employees: new PgEmployeeRepository(db),
    transactions: new PgTransactionRepository(db),
    transactionEmployees: new PgTransactionEmployeeRepository(db),
    dailySituations: new PgDailySituationRepository(db),
    leaves: new PgLeaveRepository(db),
    timePermissions: new PgTimePermissionRepository(db),
    assignments: new PgAssignmentRepository(db),
    courses: new PgCourseRepository(db),
  };
}

/** ينشئ الخدمات على اتصال واحد. */
export function createApiServices(db: Queryable = getSharedPool()): ApiServices {
  const repositories = createApiRepositories(db);
  return {
    employees: new EmployeeApiService(repositories.employees),
    transactions: new TransactionApiService(repositories.transactions),
    transactionEmployees: new TransactionEmployeeApiService(repositories.transactionEmployees),
    dailySituations: new DailySituationApiService(repositories.dailySituations),
    leaves: new LeaveApiService(repositories.leaves),
    timePermissions: new TimePermissionApiService(repositories.timePermissions),
    assignments: new AssignmentApiService(repositories.assignments),
    courses: new CourseApiService(repositories.courses),
    timeline: new TimelineApiService(repositories),
  };
}

/**
 * الخدمات الافتراضية على الـPool المشترك.
 * تُبنى عند أول استيراد، وهو ما يعني رمي خطأ واضح إن لم يكن
 * `DATABASE_URL` مهيأً — وهذا مقصود: لا مسار بيانات بلا قاعدة.
 */
let sharedServices: ApiServices | null = null;

/** يعيد الخدمات المشتركة، وينشئها بأول استدعاء. */
export function getApiServices(): ApiServices {
  if (sharedServices === null) {
    sharedServices = createApiServices(getSharedPool());
  }
  return sharedServices;
}

/** يبني الخدمات على Pool صريح (للاختبارات وCLI). */
export function createApiServicesOnPool(pool: Pool): ApiServices {
  return createApiServices(pool);
}
