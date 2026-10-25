/**
 * DTO الخط الزمني — Phase 10 (بند 6 من ترتيب النقل: قراءة فقط).
 *
 * الـTimeline ناتج مشتق وليس جدولاً (الخطة §22 و§7.17):
 * لا يوجد create/update/delete له، ولا جدول timeline في الـschema.
 * هذه الأنواع لعرض نتيجة التجميع فقط، وتطابق `src/services/timelineService.ts`
 * (Phase 7) التي تجري نفس الحساب على الخادم من مصادره الأصلية في القاعدة.
 */
import type { TimelineEntry } from '../../../../src/core/models/timeline';

export type TimelineEntryDto = TimelineEntry;

/** استجابة تجميع الخط الزمني لمنتسب: الأحداث + الإحصاءات قبل الفلاتر. */
export interface TimelineResponseDto {
  entries: TimelineEntryDto[];
  countsBySource: Record<string, number>;
  totalCount: number;
}

/** فلاتر القراءة الاختيارية للخط الزمني (تطابق TimelineFilterOptions في Phase 7). */
export interface TimelineQuery {
  employeeId: string;
  sourceTypes?: string[];
  dateFrom?: string;
  dateTo?: string;
  searchText?: string;
  limit?: number;
}
