/**
 * controllers الإشعارات والتذكيرات (Phase 21 · §20 · §21) — HTTP فقط.
 *
 * لا صلاحية ولا نطاق هنا: الفرض كله على المسار عبر خريطة §28 القائمة
 * (`GET ← view` · `POST ← create` · `PATCH ← update`) — **بلا Role جديد وبلا
 * Permission جديدة**. ولا استثناء `requirePermission` كما في `auditRoutes`:
 * الإشعارات مورد §10.3 «يرى … الإشعارات الخاصة به»، فـ`view` كافية.
 *
 * **`userId` من هوية الجلسة حصراً** (`sessionUserId`) ولا يُقرأ من الجسم ولا
 * من الاستعلام أبداً (§28). هذا هو ما يجعل `GET /api/notifications?userId=<غيره>`
 * غير ممكن أصلاً: لا مُعامل له.
 */
import type { RequestHandler } from 'express';
import { servicesOf } from '../serviceContext';
import {
  asyncHandler,
  created,
  noContent,
  ok,
  pathId,
  validatedBody,
  validatedQuery,
} from './shared';
import type { AuthenticatedRequest } from '../../auth/sessionMiddleware';
import type {
  CreateReminderDto,
  NotificationListQuery,
  UpdateReminderDto,
} from '../dto/notification';

/**
 * معرّف صاحب الجلسة — هو صاحب الإشعارات بلا استثناء.
 *
 * `AuthenticatedIdentity.userId` نوعه `string` (مسجَّل ومدخل بـ`requireSession`)،
 * فالغياب يعني ترتيباً مكسوراً لا حالة مستعملة — وكل الحقول هنا **بلا**
 * شرط `userId` ولا قيمة افتراضية.
 */
function sessionUserId(req: Parameters<RequestHandler>[0]): string {
  const identity = (req as AuthenticatedRequest).auth;
  if (identity === undefined) {
    throw new Error('مسار إشعارات بلا هوية جلسة — requireSession يجب أن يسبق هذا المسار.');
  }
  return identity.userId;
}

/** GET /api/notifications — قائمة إشعارات صاحب الجلسة (الأحدث أولاً). */
export const listNotifications: RequestHandler = asyncHandler(async (req, res) => {
  const query = validatedQuery<NotificationListQuery>(req);
  ok(res, await servicesOf(req).notifications.list(sessionUserId(req), query));
});

/** GET /api/notifications/unread-count — عدّاد الجرس (§20 «حالة جديد»). */
export const countUnreadNotifications: RequestHandler = asyncHandler(async (req, res) => {
  ok(res, await servicesOf(req).notifications.unreadCount(sessionUserId(req)));
});

/** GET /api/notifications/:id — إشعار واحد ضمن مالكه (وإلا 404 حجب وجود). */
export const getNotification: RequestHandler = asyncHandler(async (req, res) => {
  ok(res, await servicesOf(req).notifications.getById(pathId(req), sessionUserId(req)));
});

/**
 * POST /api/notifications/:id/read — تعليم كمقروء (§20).
 *
 * `POST` لا يعني إنشاء: هي عملية على صف موجود (تعليم)، فالعائلة `view`
 * كـ«اطلعت» تماماً (Phase 15 · §9.1) في `PATH_PERMISSION_OVERRIDES`.
 * بلا ذلك لما استطاع المنتسب (§10.3 `view` فقط) تعليم ما قرأه — وهو
 * مكسور وظيفياً لا مشدود أمنياً.
 *
 * الصف لا يُحذف: `is_new=false` و`read_at` فقط (§20) ⇒ السجل التاريخي
 * محفوظ منفصلاً عن حالة «جديد».
 */
export const markNotificationRead: RequestHandler = asyncHandler(async (req, res) => {
  ok(res, await servicesOf(req).notifications.markRead(pathId(req), sessionUserId(req)));
});

/** GET /api/reminders — قائمة التذكيرات. */
export const listReminders: RequestHandler = asyncHandler(async (req, res) => {
  ok(res, await servicesOf(req).reminders.list());
});

/** GET /api/reminders/:id — تذكير واحد. */
export const getReminder: RequestHandler = asyncHandler(async (req, res) => {
  ok(res, await servicesOf(req).reminders.getById(pathId(req)));
});

/** POST /api/reminders — إنشاء تذكير (§21). `status` غير مقبول من العميل (TBD). */
export const createReminder: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<CreateReminderDto>(req);
  created(res, await servicesOf(req).reminders.create(body));
});

/**
 * PATCH /api/reminders/:id — تعديل جزئي.
 *
 * **بلا `DELETE`**: تعطيل التذكير هو `enabled: false` (§21)، والحذف كان
 * سيهدم صفاً تاريخياً بلا سند — نفس قاعدة §32 في بقية الموارد.
 */
export const updateReminder: RequestHandler = asyncHandler(async (req, res) => {
  const body = validatedBody<UpdateReminderDto>(req);
  ok(res, await servicesOf(req).reminders.update(pathId(req), body));
});