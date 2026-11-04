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
import { RoleDeniedError } from '../../authorization/authorizationErrors';
import {
  requirePersonnelScope,
  type PersonnelReadScope,
} from '../../authorization/personnelScope';
import { ResourceNotFoundError } from '../errors';
import type {
  CreateDailySituationDto,
  DailySituationListQuery,
  DailySituationRecordDto,
  UpdateDailySituationDto,
} from '../dto';
import type { DailySituationRecord } from '../../../../src/core/models/dailySituation';

const ARABIC_DAILY_SITUATION = 'قيد الموقف اليومي';
const DAILY_SITUATION_ROLES = ['admin', 'director'] as const;

/**
 * Phase N1: قراءة الموقف اليومي إدارية بالكامل.
 *
 * لا تُترجم `owner` إلى صفوف المنتسب: كتاب الموقف اليومي ليس سجلاً
 * شخصياً، وسياسة المالك تمنع المنتسب من أي موقف حتى لو ورد اسمه فيه.
 * `requirePersonnelScope` أولاً حتى لا يتحول غياب السياق إلى `all`.
 */
function requireAdministrativeRead(scope: PersonnelReadScope): void {
  requirePersonnelScope(scope);
  if (scope.kind !== 'all') {
    throw new RoleDeniedError(DAILY_SITUATION_ROLES);
  }
}

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

  /** قائمة القيود مع تصفية المنتسب/التاريخ/القسم — admin/director فقط. */
  async list(
    filter: DailySituationListQuery,
    scope: PersonnelReadScope,
  ): Promise<DailySituationRecordDto[]> {
    requireAdministrativeRead(scope);
    const found = await this.records.list({
      employeeId: filter.employeeId,
      date: filter.date,
      category: filter.category,
    });
    return found.map(toDto);
  }

  /** قيد واحد، أو 404 — admin/director فقط. */
  async getById(id: string, scope: PersonnelReadScope): Promise<DailySituationRecordDto> {
    requireAdministrativeRead(scope);
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
