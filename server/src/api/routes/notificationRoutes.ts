/**
 * راوتر الإشعارات والتذكيرات (Phase 21 · §20 · §21).
 *
 * مساران مستقلان على `/api/notifications` و`/api/reminders`، لأن موردَين
 * مختلفين: الإشعار **حدث موجه للمستخدم**، والتذكير **موعد/نص يحتاج متابعة**
 * (§7.13 · §7.14).
 *
 * الصلاحيات من خريطة §28 القائمة بلا Role جديد ولا Permission جديدة:
 * `GET ← view` · `POST ← create` · `PATCH ← update`. والاستثناء الوحيد
 * `POST /:id/read` بعائلة `view` (كـ«اطلعت» في Phase 15 · §9.1) وموسَّح في
 * `authorization/requirePermission.ts`.
 *
 * **بلا مسار إنشاء إشعار**: الإشعار يُنشأ **من الحدث** في
 * `services/notificationEvents.ts`، ولو قبلنا POST هنا لأمكن لأي مُصرَّح له
 * باختلاق إشعار لأحد — وهو ما تنعهض عليه §28.
 *
 * **بلا `userId` في أي استعلام**: `GET /api/notifications?userId=...` يرفضه
 * `notificationListQuery` كحقل غير معروف (400)، والملكية تُفرض من `req.auth`
 * داخل `WHERE` في المستودع.
 */
import { Router } from 'express';
import {
  countUnreadNotifications,
  createReminder,
  getNotification,
  getReminder,
  listNotifications,
  listReminders,
  markNotificationRead,
  updateReminder,
} from '../controllers/notificationController';
import { validateApiRequest } from '../validation/validateApiRequest';
import {
  createReminderBody,
  notificationListQuery,
  updateReminderBody,
} from '../validation';

/** يبني راوتر `/api/notifications`. */
export function createNotificationsRouter(): Router {
  const router = Router();
  router.get(
    '/',
    validateApiRequest({ query: { validator: notificationListQuery } }),
    listNotifications,
  );
  // قبل `/:id` لئلا يبتلع المسارَين مَعرّفاً واحداً.
  router.get('/unread-count', countUnreadNotifications);
  router.get('/:id', getNotification);
  router.post('/:id/read', markNotificationRead);
  return router;
}

/**
 * يبني راوتر `/api/reminders`.
 *
 * **بلا `DELETE`**: تعطيل التذكير هو `enabled: false` (§21)، والحذف كان
 * سيهدم صفاً تاريخياً بلا سند — نفس قاعدة §32 في بقية الموارد. وبلا مسار
 * لـ`processed_at`: هو حاجز تكرار تقني (§19) لا مورد يُدار من العميل.
 *
 * **ولا مسار «نفّذ» يدوي**: §21 «التنفيذ عبر Scheduled Jobs»، فمسار يدوي
 * كان سيتجاوز deque التكرار التقني ويعيد إنتاج المشكلة التي وُجد لأجلها.
 */
export function createRemindersRouter(): Router {
  const router = Router();
  router.get('/', listReminders);
  router.get('/:id', getReminder);
  router.post('/', validateApiRequest({ body: { validator: createReminderBody } }), createReminder);
  router.patch(
    '/:id',
    validateApiRequest({ body: { validator: updateReminderBody } }),
    updateReminder,
  );
  return router;
}