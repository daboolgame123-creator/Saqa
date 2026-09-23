/**
 * DailySituationService — قواعد الموقف اليومي ككيان مستقل (PHASE 6 / BR-13).
 *
 * الموقف اليومي ليس كتابًا: العلاقة الأساسية مع المنتسب عبر `employeeId` (Rule 7).
 * يجمع هذا الملف منطق الموقف اليومي — لا منطق أعمال داخل مكونات React:
 * - التحقق والتطبيع (بلا استثناءات — نتيجة صريحة دائماً).
 * - الإنشاء/التعديل/الحذف بعمليات نقية (immutable).
 * - الاستعلام بالمنتسب/التاريخ/القسم/المعاملة.
 * - التحويل الآمن من النموذج المدمج الموروث (Transaction.dailySituationData) إلى
 *   DailySituationRecord بالتطابق الفريد فقط (لا تخمين — Rule 6/7)، مع إبقاء النص
 *   الأصلي في الطبقة الموروثة (Rule 3 — لا فقدان بيانات).
 *
 * لا يحتوي على: حساب حضور، أرصدة، موافقات، حالات إجرائية، أو أي قاعدة غير معتمدة.
 * مستقل عن React وlocalStorage — قابل للنقل إلى Backend لاحقاً دون إعادة تصميم.
 */
import type {
  DailySituationCategory,
  DailySituationData,
  DailySituationEntry,
  DailySituationRecord,
  DailySituationRelatedRecord,
  DailySituationRelatedRecordKind,
  Employee,
  Transaction,
} from '../core/models';
import { DAILY_SITUATION_CATEGORY_LABELS } from '../core/models';
import { PersonnelService } from './personnelService';
import { TransactionEmployeeService } from './transactionEmployeeService';

export interface DailySituationValidationOk {
  ok: true;
}

export interface DailySituationValidationFail {
  ok: false;
  errors: string[];
}

/** نتيجة تحقق صريحة (بلا throw) */
export type DailySituationValidationResult = DailySituationValidationOk | DailySituationValidationFail;

export interface DailySituationOk<T> {
  ok: true;
  value: T;
}

export interface DailySituationFail {
  ok: false;
  errors: string[];
}

/** نتيجة عملية خدمة صريحة (إنشاء/تعديل) */
export type DailySituationResult<T> = DailySituationOk<T> | DailySituationFail;

/** مدخل إنشاء قيد موقف يومي — المعرّف يُملأ آلياً إن لم يُمرَّر */
export type DailySituationInput = Omit<DailySituationRecord, 'id'> & { id?: string };

/** الحقول الأربعة+الستة لأقسام الاستمارة الرسمية داخل النموذج المدمج الموروث */
type LegacySectionField =
  | 'permanentLeaves'
  | 'permanentTimePermissions'
  | 'permanentShiftChanges'
  | 'temporaryLeaves'
  | 'temporaryTimePermissions'
  | 'temporaryShiftChanges';

/** خريطة أقسام الاستمارة الستة المعتمدة → الحقل المقابل في النموذج المدمج الموروث */
const LEGACY_SECTIONS: ReadonlyArray<{
  category: DailySituationCategory;
  field: LegacySectionField;
}> = [
  { category: 'permanent_leaves', field: 'permanentLeaves' },
  { category: 'permanent_time_permissions', field: 'permanentTimePermissions' },
  { category: 'permanent_shift_changes', field: 'permanentShiftChanges' },
  { category: 'temporary_leaves', field: 'temporaryLeaves' },
  { category: 'temporary_time_permissions', field: 'temporaryTimePermissions' },
  { category: 'temporary_shift_changes', field: 'temporaryShiftChanges' },
];

/** أنواع السجلات الإدارية المسموح ربط قيد الموقف بها (قيم النموذج المعتمد فقط) */
const RELATED_RECORD_KINDS: readonly DailySituationRelatedRecordKind[] = [
  'transaction',
  'leave',
  'time_permission',
  'assignment',
  'course',
];

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** يُبقي نصاً غير فارغ (مشذّباً) أو يعيد undefined */
const safeText = (value: unknown): string | undefined =>
  isNonEmptyString(value) ? value.trim() : undefined;

const isCatalogCategory = (value: unknown): value is DailySituationCategory =>
  typeof value === 'string' &&
  Object.prototype.hasOwnProperty.call(DAILY_SITUATION_CATEGORY_LABELS, value);

const isRelatedRecordKind = (value: unknown): value is DailySituationRelatedRecordKind =>
  typeof value === 'string' && (RELATED_RECORD_KINDS as readonly string[]).includes(value);

/**
 * معرّف القيد المستقل المشتق من قيد موروث — ثابت (deterministic) ليكون الترحيل
 * idempotent: إعادة البناء لا تُنشئ صفوفاً مكررة.
 */
const buildDerivedRecordId = (transactionId: string, entryId: string): string =>
  `ds-${transactionId}::${entryId}`;

export class DailySituationService {
  // ───────────────────── 1) أدوات حقلية نقية ─────────────────────

  /**
   * تطبيع التاريخ إلى YYYY-MM-DD (تحويل تنسيقي فقط — لا يغيّر معنى التاريخ).
   * يقبل الصيغ الشائعة في البيانات المخزنة: YYYY/M/D وYYYY-M-D وYYYY-MM-DD.
   * يُعيد undefined إذا لم يكن تاريخاً حقيقياً.
   */
  static normalizeDate(value?: string): string | undefined {
    if (!isNonEmptyString(value)) return undefined;
    const parts = value.trim().replace(/\//g, '-').split('-');
    if (parts.length !== 3) return undefined;
    const [year, month, day] = parts.map((part) => part.trim());
    if (!/^\d{4}$/.test(year) || !/^\d{1,2}$/.test(month) || !/^\d{1,2}$/.test(day)) return undefined;
    const iso = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    return PersonnelService.isValidDate(iso) ? iso : undefined;
  }

  /** هل القيمة قسم موقف يومي معتمد؟ */
  static isValidCategory(value: unknown): value is DailySituationCategory {
    return isCatalogCategory(value);
  }

  /** معرّف القيد المستقل المشتق من قيد موروث — يُستخدم للربط بين الطبقتين */
  static legacyRecordId(transactionId: string, entryId: string): string {
    return buildDerivedRecordId(transactionId, entryId);
  }

  // ───────────────────── 2) التحقق (بلا throw) ─────────────────────

  static validate(input: Partial<DailySituationRecord>): DailySituationValidationResult {
    const errors: string[] = [];

    if (!isNonEmptyString(input.employeeId)) {
      errors.push('معرف المنتسب (employeeId) مطلوب في قيد الموقف اليومي.');
    }
    if (!isCatalogCategory(input.category)) {
      errors.push('قسم/نوع قيد الموقف اليومي غير صالح.');
    }
    if (!PersonnelService.isValidDate(input.date)) {
      errors.push('تاريخ قيد الموقف اليومي مطلوب بصيغة YYYY-MM-DD.');
    }
    if (input.timeOrDuration !== undefined && typeof input.timeOrDuration !== 'string') {
      errors.push('الوقت/المدة يجب أن يكون نصاً عند تمريره.');
    }
    if (input.reason !== undefined && typeof input.reason !== 'string') {
      errors.push('سبب القيد يجب أن يكون نصاً عند تمريره.');
    }
    if (input.notes !== undefined && typeof input.notes !== 'string') {
      errors.push('الملاحظة يجب أن تكون نصاً عند تمريرها.');
    }
    if (input.relatedRecord !== undefined) {
      if (
        !input.relatedRecord ||
        !isRelatedRecordKind(input.relatedRecord.kind) ||
        !isNonEmptyString(input.relatedRecord.id)
      ) {
        errors.push('رابط السجل الإداري ذي الصلة غير صالح.');
      }
    }

    return errors.length === 0 ? { ok: true } : { ok: false, errors };
  }

  // ───────── 3) التطبيع عند التحميل (تحصين بنيوي بلا تعديل صامت للقيم) ─────────

  /** مساعد داخلي: يتحقق من رابط السجل الإداري ويعيده منظّفاً */
  private static safeRelatedRecord(value: unknown): DailySituationRelatedRecord | undefined {
    if (!value || typeof value !== 'object') return undefined;
    const record = value as Record<string, unknown>;
    if (!isRelatedRecordKind(record.kind)) return undefined;
    const id = safeText(record.id);
    if (!id) return undefined;
    return { kind: record.kind, id };
  }

  /**
   * تطبيع مجموعة قيود الموقف اليومي المقروءة من التخزين:
   * إسقاط الصفوف غير الصالحة (بلا معرّف/منتسب/تاريخ/قسم معتمد) وإزالة التكرار
   * بالمعرّف وتطبيع صيغة التاريخ. لا يُعدَّل أي حقل قيمة صالح.
   */
  static normalizeRecords(raw: unknown): DailySituationRecord[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: DailySituationRecord[] = [];

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const id = safeText(record.id);
      const employeeId = safeText(record.employeeId);
      const date = this.normalizeDate(safeText(record.date));
      if (!id || !employeeId || !date || seen.has(id)) continue;
      if (!isCatalogCategory(record.category)) continue;
      seen.add(id);

      out.push({
        ...(record as unknown as DailySituationRecord),
        id,
        employeeId,
        date,
        category: record.category,
        timeOrDuration: safeText(record.timeOrDuration),
        reason: safeText(record.reason),
        notes: safeText(record.notes),
        relatedRecord: this.safeRelatedRecord(record.relatedRecord),
        createdAt: safeText(record.createdAt),
      });
    }

    return out;
  }

  // ───────── 4) الإنشاء/التعديل/الحذف (عمليات نقية immutable) ─────────

  static create(input: DailySituationInput): DailySituationResult<DailySituationRecord> {
    const candidate: DailySituationRecord = {
      ...input,
      id: isNonEmptyString(input.id) ? input.id : PersonnelService.newId('ds'),
      date: this.normalizeDate(input.date) ?? input.date,
      timeOrDuration: safeText(input.timeOrDuration),
      reason: safeText(input.reason),
      notes: safeText(input.notes),
      createdAt: safeText(input.createdAt) ?? new Date().toISOString(),
    };

    const validation = this.validate(candidate);
    if (validation.ok === false) return { ok: false, errors: validation.errors };
    return { ok: true, value: candidate };
  }

  static update(
    records: DailySituationRecord[],
    id: string,
    patch: Partial<Omit<DailySituationRecord, 'id'>>
  ): DailySituationResult<DailySituationRecord[]> {
    const existing = this.getById(records, id);
    if (!existing) return { ok: false, errors: [`لا يوجد قيد موقف يومي بالمعرّف (${id}).`] };

    const merged: DailySituationRecord = {
      ...existing,
      ...patch,
      id: existing.id,
      date: this.normalizeDate(patch.date ?? existing.date) ?? existing.date,
    };

    const validation = this.validate(merged);
    if (validation.ok === false) return { ok: false, errors: validation.errors };
    return { ok: true, value: records.map((item) => (item.id === id ? merged : item)) };
  }

  /** حذف قيد واحد — لا يمس أي منتسب ولا أي قيد آخر (idempotent). */
  static remove(records: DailySituationRecord[], id: string): DailySituationRecord[] {
    return records.filter((item) => item.id !== id);
  }

  /**
   * حذف قيود الموقف اليومي التابعة لمعاملة موقف محذوفة (قرار الحذف في PHASE 6).
   * يحذف فقط الصفوف المرتبطة بتلك المعاملة عبر relatedRecord؛ لا يحذف منتسباً
   * ولا أي قيد لا يخص تلك المعاملة.
   */
  static removeForTransaction(
    records: DailySituationRecord[],
    transactionId: string
  ): DailySituationRecord[] {
    if (!isNonEmptyString(transactionId)) return records;
    return records.filter(
      (item) =>
        !(item.relatedRecord?.kind === 'transaction' && item.relatedRecord.id === transactionId)
    );
  }

  /**
   * دمج قيود (idempotent — Rule 3):
   * القيد الموجود مسبقاً بالمعرّف نفسه يبقى كما هو (لا استبدال ولا تكرار)،
   * وتُضاف القيود الجديدة فقط. لا يُحذف أي قيد موجود.
   */
  static mergeRecords(
    existing: DailySituationRecord[],
    incoming: DailySituationRecord[]
  ): DailySituationRecord[] {
    const byId = new Map<string, DailySituationRecord>();
    for (const record of existing) {
      if (record && isNonEmptyString(record.id) && !byId.has(record.id)) byId.set(record.id, record);
    }
    for (const record of incoming) {
      if (record && isNonEmptyString(record.id) && !byId.has(record.id)) byId.set(record.id, record);
    }
    return Array.from(byId.values());
  }

  // ───────────────────── 5) الاستعلامات (نقية) ─────────────────────

  static getById(records: DailySituationRecord[], id: string): DailySituationRecord | undefined {
    return records.find((item) => item.id === id);
  }

  /** كل قيود منتسب واحد — الرابط الأساسي employeeId (Rule 7) */
  static getByEmployee(records: DailySituationRecord[], employeeId: string): DailySituationRecord[] {
    if (!isNonEmptyString(employeeId)) return [];
    return records.filter((item) => item.employeeId === employeeId);
  }

  static getByDate(records: DailySituationRecord[], date: string): DailySituationRecord[] {
    const iso = this.normalizeDate(date);
    if (!iso) return [];
    return records.filter((item) => item.date === iso);
  }

  static getByCategory(
    records: DailySituationRecord[],
    category: DailySituationCategory
  ): DailySituationRecord[] {
    return records.filter((item) => item.category === category);
  }

  /** قيود موقف يومي تابعة لمعاملة (روابط relatedRecord من نوع transaction فقط) */
  static getByTransaction(
    records: DailySituationRecord[],
    transactionId: string
  ): DailySituationRecord[] {
    if (!isNonEmptyString(transactionId)) return [];
    return records.filter(
      (item) =>
        item.relatedRecord?.kind === 'transaction' && item.relatedRecord.id === transactionId
    );
  }

  /** المعرّفات المميزة للمنتسبين في مجموعة قيود */
  static getEmployeeIds(records: DailySituationRecord[]): string[] {
    const ids = new Set<string>();
    for (const record of records) {
      if (isNonEmptyString(record.employeeId)) ids.add(record.employeeId);
    }
    return Array.from(ids);
  }

  // ───────── 6) التحويل الآمن من النموذج المدمج الموروث (Rule 3/6/7) ─────────

  /**
   * قراءة قيود النموذج المدمج الموروث بأقسامها الستة المعتمدة فقط — لا حقول تجميعية.
   */
  static legacyEntries(
    data: DailySituationData | undefined
  ): Array<{ category: DailySituationCategory; entry: DailySituationEntry }> {
    if (!data) return [];
    const out: Array<{ category: DailySituationCategory; entry: DailySituationEntry }> = [];
    for (const section of LEGACY_SECTIONS) {
      const entries = data[section.field];
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        out.push({ category: section.category, entry });
      }
    }
    return out;
  }

  /**
   * حل اسم منتسب إلى معرّف — بالتطابق الفريد فقط (نفس آلية PHASE 5 المعتمدة):
   * صفر تطابقات أو أكثر من تطابق ⇒ undefined (بلا تخمين — Rule 6/7).
   */
  static resolveEmployeeId(name: string | undefined, employees: Employee[]): string | undefined {
    if (!isNonEmptyString(name)) return undefined;
    const ids = TransactionEmployeeService.resolveEmployeeIds([name], employees);
    return ids.length === 1 ? ids[0] : undefined;
  }

  /**
   * بناء قيود مستقلة من نموذج موقف موروث (يُستخدم عند الإنشاء وعند التهيئة).
   * - القيد الذي لا يمكن ربطه بمنتسب واحد بالتطابق الفريد لا يُحوَّل: يبقى نصاً في
   *   الطبقة الموروثة (لا تخمين، ولا حالة "غير محلول"، ولا فقدان بيانات).
   * - `details` الموروث يُنقل كما هو إلى timeOrDuration (بلا تحليل أو تقسيم تخميني).
   * - المعرّفات مشتقة وثابتة ليكون البناء idempotent.
   * - رابط المعاملة يحفظ انتماء القيد لمعاملة الموقف (يُستخدم عند حذفها).
   */
  static buildRecordsFromLegacyForm(params: {
    transactionId: string;
    data?: DailySituationData;
    fallbackDate?: string;
    employees: Employee[];
  }): DailySituationRecord[] {
    const { transactionId, data, fallbackDate, employees } = params;
    if (!isNonEmptyString(transactionId) || !data) return [];

    const formDate = this.normalizeDate(data.situationDate) ?? this.normalizeDate(fallbackDate);
    const out: DailySituationRecord[] = [];

    for (const { category, entry } of this.legacyEntries(data)) {
      const entryId = safeText(entry.id);
      if (!entryId) continue;

      const employeeId = this.resolveEmployeeId(entry.employeeName, employees);
      if (!employeeId) continue; // يبقى في الطبقة الموروثة كما هو

      const date = this.normalizeDate(entry.date) ?? formDate;
      if (!date) continue;

      const record: DailySituationRecord = {
        id: buildDerivedRecordId(transactionId, entryId),
        employeeId,
        date,
        category,
        timeOrDuration: safeText(entry.details),
        notes: safeText(entry.notes),
        relatedRecord: { kind: 'transaction', id: transactionId },
      };

      const validation = this.validate(record);
      if (validation.ok) out.push(record);
    }

    return out;
  }

  /**
   * تهيئة/ترحيل idempotent للبيانات الحالية (Rule 3 — بلا حذف وبلا فقدان):
   * يدمج القيود المخزّنة مع المشتقة من النماذج المدمجة في المعاملات الحالية.
   * - القيود المخزّنة تبقى كما هي (بما فيها أي تعديل لاحق) ولا تُستبدل ولا تتكرر.
   * - المشتقة تُضاف مرة واحدة فقط بمعرّفات ثابتة.
   * - لا حذف لأي قيد موجود، ولا استنتاج لهوية منتسب من سجلات أخرى أو من التواريخ.
   */
  static seedFromTransactions(
    records: DailySituationRecord[],
    transactions: Transaction[],
    employees: Employee[]
  ): DailySituationRecord[] {
    let next = this.normalizeRecords(records);

    for (const transaction of transactions) {
      if (!transaction || !transaction.dailySituationData) continue;
      const derived = this.buildRecordsFromLegacyForm({
        transactionId: transaction.id,
        data: transaction.dailySituationData,
        fallbackDate: transaction.date,
        employees,
      });
      next = this.mergeRecords(next, derived);
    }

    return next;
  }
}
