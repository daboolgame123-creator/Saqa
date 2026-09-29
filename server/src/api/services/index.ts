/**
 * طبقة خدمات الـAPI (Phase 10).
 *
 * هذه الطبقة هي «سياق التطبيق» فوق `repositories`:
 * - تستدعي المستودع (المصدر الوحيد للبيانات).
 * - تحوّل `null` إلى `NotFoundError` بدل تمرير null للواجهة.
 * - تحوّل سجل المستودع إلى DTO عبر `dto/recordMappers`.
 *
 * ما لا تفعله عمداً:
 * - لا تحقق (middleware التحقق سبق الخدمة) ولا صلاحيات (فرضها وسيط
 *   `authorization` على المسار — Phase 12) ولا حساب نطاق الرؤية
 *   (قرارها في `authorization/accessScope.ts` — Phase 13).
 * - لا تطبع ولا تشتق: كل قيمة من الـrecord كما أتت من القاعدة.
 *
 * Phase 13: خدمات الكتب والروابط تقبل `TransactionScopeFilter` مبنياً في
 * طبقة التفويض وتمرّره إلى المستودع، فلا تُفلتر السجلات في هذه الطبقة
 * ولا بعد قراءتها — التقييد في الاستعلام نفسه.

 *
 * إنشاء الخدمات: تمرير `db` يسمح باختبارها على `Client` داخل معاملة
 * أو على `Pool` مباشرة، بنفس نمط مستودعات Phase 9.
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
  PgTimePermissionRepository,
  PgTransactionAvailabilityRepository,
  PgTransactionEmployeeRepository,
  PgTransactionRepository,
  type AssignmentRepository,
  type AttachmentRepository,
  type CourseRepository,
  type DailySituationRepository,
  type EmployeeRepository,
  type LeaveRepository,
  type TimePermissionRepository,
  type TransactionAvailabilityRepository,
  type TransactionEmployeeRepository,
  type TransactionRepository,
} from '../../repositories';
import { getFileStorage, type FileStorage } from '../../storage';
import { EmployeeApiService } from './employeeService';
import { AttachmentApiService } from './attachmentService';
import { TransactionApiService } from './transactionService';
import { TransactionAvailabilityApiService } from './availabilityService';
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
  transactionAvailability: TransactionAvailabilityRepository;
  dailySituations: DailySituationRepository;
  attachments: AttachmentRepository;
}

/** كل خدمات الـAPI مجتمعة (ما يمرره الراوتر إلى الـcontroller). */
export interface ApiServices {
  employees: EmployeeApiService;
  transactions: TransactionApiService;
  transactionEmployees: TransactionEmployeeApiService;
  availability: TransactionAvailabilityApiService;
  transactionAvailability: TransactionAvailabilityApiService;
  dailySituations: DailySituationApiService;
  leaves: LeaveApiService;
  timePermissions: TimePermissionApiService;
  assignments: AssignmentApiService;
  courses: CourseApiService;
  timeline: TimelineApiService;
  attachments: AttachmentApiService;
}

/** ينشئ المستودعات على اتصال واحد (Pool أو Client داخل معاملة). */
export function createApiRepositories(db: Queryable): ApiRepositories {
  return {
    employees: new PgEmployeeRepository(db),
    transactions: new PgTransactionRepository(db),
    transactionEmployees: new PgTransactionEmployeeRepository(db),
    transactionAvailability: new PgTransactionAvailabilityRepository(db),
    dailySituations: new PgDailySituationRepository(db),
    attachments: new PgAttachmentRepository(db),
    leaves: new PgLeaveRepository(db),
    timePermissions: new PgTimePermissionRepository(db),
    assignments: new PgAssignmentRepository(db),
    courses: new PgCourseRepository(db),
  };
}

/**
 * ينشئ الخدمات على اتصال واحد.
 *
 * `fileStorage` اختياري: الإنتاج يتركه فيُبنى من إعدادات البيئة، والاختبار
 * يمرّر طبقة تخزين بجذر مؤقت. تمريره صريحاً (لا متغير بيئة) هو ما يمنع
 * اختبارات HTTP من الكتابة إلى مسار إنتاجي.
 */
export function createApiServices(
  db: Queryable = getSharedPool(),
  fileStorage?: FileStorage,
): ApiServices {
  const repositories = createApiRepositories(db);
  const availabilityService = new TransactionAvailabilityApiService(
    repositories.transactions,
    repositories.transactionAvailability,
    repositories.transactionEmployees,
    repositories.employees,
  );
  return {
    employees: new EmployeeApiService(repositories.employees),
    transactions: new TransactionApiService(repositories.transactions),
    transactionEmployees: new TransactionEmployeeApiService(repositories.transactionEmployees),
    availability: availabilityService,
    transactionAvailability: availabilityService,
    dailySituations: new DailySituationApiService(repositories.dailySituations),
    leaves: new LeaveApiService(repositories.leaves),
    timePermissions: new TimePermissionApiService(repositories.timePermissions),
    assignments: new AssignmentApiService(repositories.assignments),
    courses: new CourseApiService(repositories.courses),
    timeline: new TimelineApiService(repositories),
    // المرفقات تحتاج الطبقتين: مستودع الـmetadata وطبقة القرص، وتقرأ
    // الخدمة منهما معاً. `getFileStorage()` هنا لا يبني شيئاً على القرص —
    // البناء كسول حتى أول كتابة فعلية.
    attachments: new AttachmentApiService(
      repositories.attachments,
      repositories.transactions,
      fileStorage ?? getFileStorage(),
    ),
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
export function createApiServicesOnPool(pool: Pool, fileStorage?: FileStorage): ApiServices {
  return createApiServices(pool, fileStorage);
}
