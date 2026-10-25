/**
 * DTO الموقف اليومي ككيان مستقل (BR-13) — Phase 10.
 *
 * الموقف اليومي ليس كتاباً: الربط الأساسي عبر employeeId (القاعدة 7).
 * `relatedRecord` يبقى {kind,id} ويترجم إلى أعمدة FK مفروضة في القاعدة.
 */
import type { DailySituationCategory } from '../../../../src/core/models/dailySituation';

export interface DailySituationRecordDto {
  id: string;
  employeeId: string;
  date: string;
  category: DailySituationCategory;
  timeOrDuration?: string;
  reason?: string;
  notes?: string;
  relatedRecord?: { kind: string; id: string };
  createdAt?: string;
}

export type CreateDailySituationDto = Omit<DailySituationRecordDto, 'id' | 'createdAt'>;

export type UpdateDailySituationDto = Partial<CreateDailySituationDto>;

/** فلترة الموقف اليومي القادمة من الـquery string. */
export interface DailySituationListQuery {
  employeeId?: string;
  date?: string;
  category?: DailySituationCategory;
}
