/**
 * controller الموقف اليومي (Phase 10 — بند 4، BR-13).
 *
 * HTTP فقط. لا مسار `delete`: القيود سجلات رسمية، وحذفها غير
 * مُعرَّف في هذه المرحلة (Soft Delete مرحلة لاحقة).
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import {
  asyncHandler,
  created,
  ok,
  pathId,
  validatedBody,
  validatedQuery,
} from './shared';
import type {
  CreateDailySituationDto,
  DailySituationListQuery,
  UpdateDailySituationDto,
} from '../dto';

/** GET /api/daily-situations — قائمة مع تصفية الموظف/التاريخ/القسم. */
export const listDailySituations: RequestHandler = asyncHandler(async (req, res) => {
  const filter = validatedQuery<DailySituationListQuery>(req);
  const services = servicesOf(req);
  ok(res, await services.dailySituations.list(filter));
});

/** GET /api/daily-situations/:id — قيد واحد. */
export const getDailySituation: RequestHandler = asyncHandler(async (req, res) => {
  const services = servicesOf(req);
  ok(res, await services.dailySituations.getById(pathId(req)));
});

/** POST /api/daily-situations — إنشاء قيد. */
export const createDailySituation: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<CreateDailySituationDto>(req);
  const services = servicesOf(req);
  created(res, await services.dailySituations.create(body));
});

/** PATCH /api/daily-situations/:id — تعديل جزئي. */
export const updateDailySituation: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<UpdateDailySituationDto>(req);
  const services = servicesOf(req);
  ok(res, await services.dailySituations.update(pathId(req), body));
});
