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
  PersonnelListQuery,
  UpdateEmployeeAssignmentDto,
  UpdateEmployeeCourseDto,
  UpdateEmployeeLeaveDto,
  UpdateEmployeeTimePermissionDto,
} from '../dto';

/** شكل الخدمة الذي يحتاجه المصنع (كل مورد يطابقه). */
interface CrudService<
  TCreate,
  TUpdate,
  TDto extends { id: string },
> {
  list(filter: PersonnelListQuery): Promise<TDto[]>;
  getById(id: string): Promise<TDto>;
  create(dto: TCreate): Promise<TDto>;
  update(id: string, dto: TUpdate): Promise<TDto>;
}

/** المصنع: يولّد خمسة معالجات HTTP لمورد واحد. */
export function createPersonnelController<TCreate, TUpdate, TDto extends { id: string }>(
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

/** معالجات سجلات الإجازات. */
export const leaveController = createPersonnelController<
  CreateEmployeeLeaveDto,
  UpdateEmployeeLeaveDto,
  { id: string }
>((services) => services.leaves);

/** معالجات سجلات الزمنيات. */
export const timePermissionController = createPersonnelController<
  CreateEmployeeTimePermissionDto,
  UpdateEmployeeTimePermissionDto,
  { id: string }
>((services) => services.timePermissions);

/** معالجات سجلات التكليفات. */
export const assignmentController = createPersonnelController<
  CreateEmployeeAssignmentDto,
  UpdateEmployeeAssignmentDto,
  { id: string }
>((services) => services.assignments);

/** معالجات سجلات الدورات. */
export const courseController = createPersonnelController<
  CreateEmployeeCourseDto,
  UpdateEmployeeCourseDto,
  { id: string }
>((services) => services.courses);
