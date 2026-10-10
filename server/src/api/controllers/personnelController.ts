/**
 * controller شؤون المنتسبين (Phase 10 — بند 5).
 *
 * أربعة موارد (إجازة/زمنية/تكليف/دورة) لها نفس شكل القراءة والكتابة،
 * فبدل أربعة ملفات متطابقة يُبنى المصنع أدناه مرة واحدة.
 *
 * لا مسار `delete` لأيٍّ منها: هذه سجلات رسمية، والحذف غير معرَّف في
 * هذه المرحلة.
 */
import type { RequestHandler } from 'express';
import { servicesOf, type ApiServices } from '../serviceContext';
import {
  asyncHandler,
  created,
  ok,
  pathId,
  validatedBody,
  validatedQuery,
} from './shared';
import type {
  CreateEmployeeAssignmentDto,
  CreateEmployeeCourseDto,
  CreateEmployeeLeaveDto,
  CreateEmployeeTimePermissionDto,
  LeaveWithBalanceDto,
  PersonnelListQuery,
  TimePermissionWithBalanceDto,
  UpdateEmployeeAssignmentDto,
  UpdateEmployeeCourseDto,
  UpdateEmployeeLeaveDto,
  UpdateEmployeeTimePermissionDto,
} from '../dto';

/**
 * شكل الخدمة الذي يحتاجه المصنع.
 *
 * `list` تُعيد `unknown[]` لأن شكل عنصر القائمة يختلف عن عنصر المفرد منذ
 * Phase 18: القائمة سجلات خام (بلا رصيد مكرر لكل صف)، بينما المفرد يحمل
 * الرصيد المحسوب معه. توحيد النوعين كان يفرض تكرار الرصيد في كل صف أو
 * `as` في الـcontroller — وهو ما لا نريده.
 */
interface CrudService<TCreate, TUpdate, TDto> {
  list(filter: PersonnelListQuery): Promise<unknown[]>;
  getById(id: string): Promise<TDto>;
  create(dto: TCreate): Promise<TDto>;
  update(id: string, dto: TUpdate): Promise<TDto>;
}

/**
 * المصنع: يولّد أربعة معالجات HTTP لمورد واحد.
 *
 * `TDto` غير مقيّد بـ`{ id: string }` عمداً منذ Phase 18: استجابة
 * الإجازة/الزمنية صارت `{ leave, balance, unpaidDays }` — الرصيد جزء من
 * الإجابة لا مورد منفصل (§34). قيود `pathId`/المُحقِّقات هي ما يضمن شكل
 * الطلب، لا هذا القيد على الإجابة.
 */
export function createPersonnelController<TCreate, TUpdate, TDto>(
  pick: (services: ApiServices) => CrudService<TCreate, TUpdate, TDto>,
): {
  list: RequestHandler;
  getById: RequestHandler;
  create: RequestHandler;
  update: RequestHandler;
} {
  return {
    list: asyncHandler(async (req, res) => {
      const filter = validatedQuery<PersonnelListQuery>(req);
      ok(res, await pick(servicesOf(req)).list(filter));
    }),
    getById: asyncHandler(async (req, res) => {
      ok(res, await pick(servicesOf(req)).getById(pathId(req)));
    }),
    create: asyncHandler(async (req, res) => {
      const body = validatedBody<TCreate>(req);
      created(res, await pick(servicesOf(req)).create(body));
    }),
    update: asyncHandler(async (req, res) => {
      const body = validatedBody<TUpdate>(req);
      ok(res, await pick(servicesOf(req)).update(pathId(req), body));
    }),
  };
}

/** معالجات سجلات الإجازات — Phase 18: الاستجابة تحمل الرصيد أيضاً. */
export const leaveController = createPersonnelController<
  CreateEmployeeLeaveDto,
  UpdateEmployeeLeaveDto,
  LeaveWithBalanceDto
>((services) => services.leaves);

/** معالجات سجلات الزمنيات — Phase 18: المدة والتحويل ومؤشر الأسبوع. */
export const timePermissionController = createPersonnelController<
  CreateEmployeeTimePermissionDto,
  UpdateEmployeeTimePermissionDto,
  TimePermissionWithBalanceDto
>((services) => services.timePermissions);

/** معالجات سجلات التكليفات. */
export const assignmentController = createPersonnelController<
  CreateEmployeeAssignmentDto,
  UpdateEmployeeAssignmentDto,
  { id: string }
>((services) => services.assignments);

// ══════════════════════════════════════════════════════════════════
// الأرصدة وسجل الحركات (Phase 18)
// ══════════════════════════════════════════════════════════════════

/**
 * معالجات الأرصدة وسجل الـledger (§7.9/§7.10/§15).
 *
 * مساران كاتبان فقط: `POST /opening` و`POST /adjustment`. **لا مسار لتعديل
 * رقم رصيد مباشرة** — §15 يشترط حركة لكل تغيير، والكتابة تمرّ بالمحرّك
 * الذي ينشئ الحركة داخل معاملة واحدة.
 *
 * إلغاء الإجازة ليس هنا: هو `POST /leaves/:id/cancel` — عملية على سجل
 * الإجازة التي أثرها على الرصيد معكوس.
 */
export const leaveBalanceController = {
  listBalances: asyncHandler(async (req, res) => {
    ok(res, await servicesOf(req).leaveBalances.listBalances(validatedQuery(req)));
  }),
  listLedger: asyncHandler(async (req, res) => {
    ok(res, await servicesOf(req).leaveBalances.listLedger(validatedQuery(req)));
  }),
  opening: asyncHandler(async (req, res) => {
    created(res, await servicesOf(req).leaveBalances.opening(validatedBody(req)));
  }),
  adjust: asyncHandler(async (req, res) => {
    created(res, await servicesOf(req).leaveBalances.adjust(validatedBody(req)));
  }),
};

/** إلغاء إجازة — ينشئ حركة عكسية مرتبطة ولا يحذف (§15). */
export const cancelLeave = asyncHandler(async (req, res) => {
  ok(res, await servicesOf(req).leaves.cancel(pathId(req)));
});

/** معالجات سجلات الدورات. */
export const courseController = createPersonnelController<
  CreateEmployeeCourseDto,
  UpdateEmployeeCourseDto,
  { id: string }
>((services) => services.courses);
