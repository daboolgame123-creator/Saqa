/**
 * نقطة تصدير راوترات الموارد (Phase 10).
 *
 * التصدير في مكان واحد يبقي `routes/index.ts` تجميعاً بحتاً، ويسهّل
 * استيراد راوتر بعينه في الاختبار دون معرفة أي ملف عُرِّف فيه.
 */
export {
  createDailySituationsRouter,
  createEmployeesRouter,
  createTransactionEmployeesRouter,
  createTransactionsRouter,
} from './resources';
export {
  createAssignmentsRouter,
  createCoursesRouter,
  createLeavesRouter,
  createTimePermissionsRouter,
  createTimelineRouter,
} from './personnelRoutes';
