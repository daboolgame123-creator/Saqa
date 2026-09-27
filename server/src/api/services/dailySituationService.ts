/**
 * خدمة الموقف اليومي المستقل في طبقة الـAPI (Phase 10 — بند 4، BR-13).
 *
 * الربط الأساسي عبر `employeeId` (القاعدة 7) — لا بالأسماء النصية.
 * `relatedRecord` رابط اختياري بسجل إداري واحد، يبقى كما هو في الـDTO
 * ويتحول إلى أعمدة FK داخل المستودع.
 *
 * لا `delete`: القيود سجلات رسمية ولا تُحذف من مسار CRUD في هذه المرحلة.
 */
import type { DailySituationRepository } from '../../repositories/contracts';
import { ResourceNotFoundError } from '../errors';
import type {
  CreateDailySituationDto,
  DailySituationListQuery,
  DailySituationRecordDto,
  UpdateDailySituationDto,
} from '../dto';
import type { DailySituationRecord } from '../../../../src/core/models/dailySituation';

const ARABIC_DAILY_SITUATION = 'قيد الموقف اليومي';

/** يحوّل سجل الموقف اليومي إلى DTO (الحقول من القاعدة كما هي). */
function toDto(record: DailySituationRecord): DailySituationRecordDto {
  return {
    id: record.id,
    employeeId: record.employeeId,
    date: record.date,
    category: record.category,
    ...(record.timeOrDuration !== undefined && { timeOrDuration: record.timeOrDuration }),
    ...(record.reason !== undefined && { reason: record.reason }),
    ...(record.notes !== undefined && { notes: record.notes }),
    ...(record.relatedRecord !== undefined && {
      relatedRecord: { kind: record.relatedRecord.kind, id: record.relatedRecord.id },
    }),
    ...(record.createdAt !== undefined && { createdAt: record.createdAt }),
  };
}

/** يُسقط الحقول غير المعرَّفة قبل الإرسال (PATCH = تعريف تغيّر فقط). */
function definedOnly(dto: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(dto)) {
    if (value !== undefined) {
      out[key] = value;
    }
  }
  return out;
}

export class DailySituationApiService {
  constructor(private readonly records: DailySituationRepository) {}

  /** قائمة القيود مع تصفية المنتسب/التاريخ/القسم. */
  async list(filter: DailySituationListQuery = {}): Promise<DailySituationRecordDto[]> {
    const found = await this.records.list({
      employeeId: filter.employeeId,
      date: filter.date,
      category: filter.category,
    });
    return found.map(toDto);
  }

  /** قيد واحد، أو 404. */
  async getById(id: string): Promise<DailySituationRecordDto> {
    const record = await this.records.findById(id);
    if (record === null) {
      throw new ResourceNotFoundError('dailySituation', id, ARABIC_DAILY_SITUATION);
    }
    return toDto(record);
  }

  /** إنشاء قيد وإعادته بمعرّفه الحقيقي. */
  async create(dto: CreateDailySituationDto): Promise<DailySituationRecordDto> {
    const input = definedOnly(dto) as Omit<
      DailySituationRecord,
      'id' | 'createdAt'
    > & { createdAt?: string };
    const created = await this.records.create(input);
    return toDto(created);
  }

  /** تعديل جزئي: الحقول غير المرسلة تبقى كما هي. */
  async update(id: string, dto: UpdateDailySituationDto): Promise<DailySituationRecordDto> {
    const patch = definedOnly(dto) as Partial<Omit<DailySituationRecord, 'id' | 'createdAt'>>;
    const record = await this.records.update(id, patch);
    if (record === null) {
      throw new ResourceNotFoundError('dailySituation', id, ARABIC_DAILY_SITUATION);
    }
    return toDto(record);
  }
}
