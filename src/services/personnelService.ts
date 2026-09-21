/**
 * PersonnelService — طبقة مجال شؤون المنتسبين (PHASE 2)
 *
 * القواعد المعمارية الملتزم بها:
 * - لا يستورد StorageService ولا يعرف localStorage ولا JSON ولا مفاتيح التخزين.
 * - لا يستخدم throw كجزء من التدفق الطبيعي: كل النتائج صريحة
 *   (ServiceResult / ValidationResult).
 * - جميع العمليات immutable (تُرجع مصفوفات/كائنات جديدة ولا تعدّل مدخلاتها).
 * - لا قواعد إدارية غير متفق عليها: لا أرصدة، لا تداخل إجازات، لا موافقات متعددة.
 * - الحفظ مسؤولية طبقة التنسيق عبر عقد IDataStorage (نقطة الفصل لـ PHASE 11/12).
 */

import type {
  EmployeeLeave,
  LeaveStatus,
  EmployeeTimePermission,
  TimePermissionStatus,
  EmployeeAssignment,
  AssignmentStatus,
  EmployeeCourse,
  ParticipationStatus,
} from '../core/models';

import {
  LEAVE_TYPE_LABELS,
  LEAVE_STATUS_LABELS,
  TIME_PERMISSION_STATUS_LABELS,
  ASSIGNMENT_TYPE_LABELS,
  ASSIGNMENT_STATUS_LABELS,
  PARTICIPATION_TYPE_LABELS,
  PARTICIPATION_STATUS_LABELS,
} from '../core/models';

// ─────────────────────────── أنواع النتائج (بلا استثناءات) ───────────────────────────

export interface ValidationOk {
  ok: true;
}

export interface ValidationFail {
  ok: false;
  errors: string[];
}

/** نتيجة تحقق صريحة — تعرضها الواجهة المستقبلية كجزء طبيعي من التدفق */
export type ValidationResult = ValidationOk | ValidationFail;

export interface ServiceOk<T> {
  ok: true;
  value: T;
}

export interface ServiceFail {
  ok: false;
  errors: string[];
}

/** نتيجة عملية خدمة صريحة (إنشاء/تعديل/ربط) — بلا throw */
export type ServiceResult<T> = ServiceOk<T> | ServiceFail;

// ─────────────────────────── أنواع المدخلات ───────────────────────────

/** مدخل إنشاء إجازة (المعرّف والحالة يُملآن آلياً إن لم تُمرَّر) */
export type LeaveInput = Omit<EmployeeLeave, 'id' | 'status'> & { status?: LeaveStatus };

/** مدخل إنشاء زمنية */
export type TimePermissionInput = Omit<EmployeeTimePermission, 'id' | 'status'> & {
  status?: TimePermissionStatus;
};

/** مدخل إنشاء تكليف */
export type AssignmentInput = Omit<EmployeeAssignment, 'id' | 'status'> & {
  status?: AssignmentStatus;
};

/** مدخل إنشاء مشاركة دورة */
export type CourseInput = Omit<EmployeeCourse, 'participationStatus'> & {
  participationStatus?: ParticipationStatus;
};

// ─────────────────────────── أدوات داخلية ───────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

/** فحص العضوية في قيم الكتالوج (القيم البرمجية الثابتة) */
const isCatalogMember = (catalog: Record<string, string>, value: unknown): boolean =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(catalog, value);

/** إرجاع نتيجة تحقق من قائمة أخطاء */
const toValidationResult = (errors: string[]): ValidationResult =>
  errors.length === 0 ? { ok: true } : { ok: false, errors };

export class PersonnelService {
  // ───────────────────── 1) أدوات حقلية نقية ─────────────────────

  /** تحقق من تاريخ بصيغة YYYY-MM-DD (مع التأكد أنه تاريخ حقيقي) */
  static isValidDate(value?: string): boolean {
    if (!isNonEmptyString(value) || !DATE_PATTERN.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }

  /** تحقق من وقت بصيغة HH:mm (نظام 24 ساعة) */
  static isValidTime(value?: string): boolean {
    return isNonEmptyString(value) && TIME_PATTERN.test(value);
  }

  /** تحقق من ترتيب نطاق تاريخي (البداية <= النهاية) */
  static isValidRange(start?: string, end?: string): boolean {
    if (!this.isValidDate(start) || !this.isValidDate(end)) return false;
    return (start as string) <= (end as string);
  }

  /** توليد معرّف سجل — معزول هنا ليُستبدل بـ UUID عند الانتقال إلى الخادم */
  private static generateId(prefix: string): string {
    return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
  }

  // ───────────────────── 2) التحقق (بلا throw) ─────────────────────

  static validateLeave(input: Partial<EmployeeLeave>): ValidationResult {
    const errors: string[] = [];

    if (!isNonEmptyString(input.employeeId)) {
      errors.push('معرف المنتسب (employeeId) مطلوب.');
    }
    if (!isCatalogMember(LEAVE_TYPE_LABELS, input.type)) {
      errors.push('نوع الإجازة غير صالح.');
    }
    if (!this.isValidDate(input.startDate)) {
      errors.push('تاريخ البداية مطلوب بصيغة YYYY-MM-DD.');
    }
    if (!this.isValidDate(input.endDate)) {
      errors.push('تاريخ النهاية مطلوب بصيغة YYYY-MM-DD.');
    }
    if (
      this.isValidDate(input.startDate) &&
      this.isValidDate(input.endDate) &&
      !this.isValidRange(input.startDate, input.endDate)
    ) {
      errors.push('تاريخ النهاية يجب أن يكون بعد أو يساوي تاريخ البداية.');
    }
    if (input.days !== undefined) {
      if (typeof input.days !== 'number' || !Number.isFinite(input.days) || input.days < 0) {
        errors.push('عدد الأيام يجب أن يكون رقماً غير سالب.');
      }
    }
    if (input.isPaid !== undefined && typeof input.isPaid !== 'boolean') {
      errors.push('حقل «براتب» (isPaid) يجب أن يكون قيمة منطقية.');
    }
    if (input.status !== undefined && !isCatalogMember(LEAVE_STATUS_LABELS, input.status)) {
      errors.push('حالة الإجازة غير صالحة.');
    }
    if (input.transactionId !== undefined && !isNonEmptyString(input.transactionId)) {
      errors.push('معرف المعاملة (transactionId) يجب أن يكون نصاً غير فارغ عند تمريره.');
    }
    if (input.notes !== undefined && typeof input.notes !== 'string') {
      errors.push('الملاحظات (notes) يجب أن تكون نصاً.');
    }

    return toValidationResult(errors);
  }

  static validateTimePermission(input: Partial<EmployeeTimePermission>): ValidationResult {
    const errors: string[] = [];

    if (!isNonEmptyString(input.employeeId)) {
      errors.push('معرف المنتسب (employeeId) مطلوب.');
    }
    if (!this.isValidDate(input.date)) {
      errors.push('تاريخ الزمنية مطلوب بصيغة YYYY-MM-DD.');
    }
    if (!this.isValidTime(input.timeOut)) {
      errors.push('وقت الخروج مطلوب بصيغة HH:mm.');
    }
    if (input.timeIn !== undefined && !this.isValidTime(input.timeIn)) {
      errors.push('وقت العودة يجب أن يكون بصيغة HH:mm عند تمريره.');
    }
    if (input.reason !== undefined && typeof input.reason !== 'string') {
      errors.push('سبب الزمنية (reason) يجب أن يكون نصاً.');
    }
    if (
      input.status !== undefined &&
      !isCatalogMember(TIME_PERMISSION_STATUS_LABELS, input.status)
    ) {
      errors.push('حالة الزمنية غير صالحة.');
    }
    if (input.transactionId !== undefined && !isNonEmptyString(input.transactionId)) {
      errors.push('معرف المعاملة (transactionId) يجب أن يكون نصاً غير فارغ عند تمريره.');
    }

    return toValidationResult(errors);
  }

  static validateAssignment(input: Partial<EmployeeAssignment>): ValidationResult {
    const errors: string[] = [];

    if (!isNonEmptyString(input.employeeId)) {
      errors.push('معرف المنتسب (employeeId) مطلوب.');
    }
    if (!isCatalogMember(ASSIGNMENT_TYPE_LABELS, input.type)) {
      errors.push('نوع التكليف غير صالح.');
    }
    if (!isNonEmptyString(input.entity)) {
      errors.push('الجهة (entity) مطلوبة.');
    }
    if (!this.isValidDate(input.startDate)) {
      errors.push('تاريخ البداية مطلوب بصيغة YYYY-MM-DD.');
    }
    if (!this.isValidDate(input.endDate)) {
      errors.push('تاريخ النهاية مطلوب بصيغة YYYY-MM-DD.');
    }
    if (
      this.isValidDate(input.startDate) &&
      this.isValidDate(input.endDate) &&
      !this.isValidRange(input.startDate, input.endDate)
    ) {
      errors.push('تاريخ النهاية يجب أن يكون بعد أو يساوي تاريخ البداية.');
    }
    if (input.place !== undefined && typeof input.place !== 'string') {
      errors.push('المكان (place) يجب أن يكون نصاً.');
    }
    if (input.purpose !== undefined && typeof input.purpose !== 'string') {
      errors.push('الغرض (purpose) يجب أن يكون نصاً.');
    }
    if (input.status !== undefined && !isCatalogMember(ASSIGNMENT_STATUS_LABELS, input.status)) {
      errors.push('حالة التكليف غير صالحة.');
    }
    if (input.transactionId !== undefined && !isNonEmptyString(input.transactionId)) {
      errors.push('معرف المعاملة (transactionId) يجب أن يكون نصاً غير فارغ عند تمريره.');
    }

    return toValidationResult(errors);
  }

  static validateCourse(input: Partial<EmployeeCourse>): ValidationResult {
    const errors: string[] = [];

    if (!isNonEmptyString(input.employeeId)) {
      errors.push('معرف المنتسب (employeeId) مطلوب.');
    }
    if (!isNonEmptyString(input.name)) {
      errors.push('اسم الدورة مطلوب.');
    }
    if (!isNonEmptyString(input.organizer)) {
      errors.push('الجهة المنظمة مطلوبة.');
    }
    // التواريخ اختيارية في الدورات — تُفحص فقط عند تمريرها
    if (input.startDate !== undefined && !this.isValidDate(input.startDate)) {
      errors.push('تاريخ البداية يجب أن يكون بصيغة YYYY-MM-DD عند تمريره.');
    }
    if (input.endDate !== undefined && !this.isValidDate(input.endDate)) {
      errors.push('تاريخ النهاية يجب أن يكون بصيغة YYYY-MM-DD عند تمريره.');
    }
    if (
      this.isValidDate(input.startDate) &&
      this.isValidDate(input.endDate) &&
      !this.isValidRange(input.startDate, input.endDate)
    ) {
      errors.push('تاريخ النهاية يجب أن يكون بعد أو يساوي تاريخ البداية.');
    }
    if (
      input.participationType !== undefined &&
      !isCatalogMember(PARTICIPATION_TYPE_LABELS, input.participationType)
    ) {
      errors.push('نوع المشاركة غير صالح.');
    }
    if (
      input.participationStatus !== undefined &&
      !isCatalogMember(PARTICIPATION_STATUS_LABELS, input.participationStatus)
    ) {
      errors.push('حالة المشاركة غير صالحة.');
    }
    if (input.place !== undefined && typeof input.place !== 'string') {
      errors.push('المكان (place) يجب أن يكون نصاً.');
    }
    if (input.certificateRef !== undefined && typeof input.certificateRef !== 'string') {
      errors.push('مرجع الشهادة (certificateRef) يجب أن يكون نصاً.');
    }
    if (input.transactionId !== undefined && !isNonEmptyString(input.transactionId)) {
      errors.push('معرف المعاملة (transactionId) يجب أن يكون نصاً غير فارغ عند تمريره.');
    }

    return toValidationResult(errors);
  }

    // ───────── 3) التطبيع عند التحميل (تحصين بنيوي بلا تعديل صامت للقيم) ─────────

  /** مساعد داخلي: يُبقي نصاً غير فارغ أو يعيد undefined */
  private static safeText(value: unknown): string | undefined {
    return isNonEmptyString(value) ? value : undefined;
  }

  static normalizeLeaves(raw: unknown): EmployeeLeave[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: EmployeeLeave[] = [];

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const id = this.safeText(record.id);
      const employeeId = this.safeText(record.employeeId);
      if (!id || !employeeId || seen.has(id)) continue;
      seen.add(id);

      out.push({
        ...(record as unknown as EmployeeLeave),
        id,
        employeeId,
        isPaid: typeof record.isPaid === 'boolean' ? record.isPaid : true,
        status: isCatalogMember(LEAVE_STATUS_LABELS, record.status)
          ? (record.status as LeaveStatus)
          : 'registered',
        transactionId: this.safeText(record.transactionId),
      });
    }
    return out;
  }

  static normalizeTimePermissions(raw: unknown): EmployeeTimePermission[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: EmployeeTimePermission[] = [];

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const id = this.safeText(record.id);
      const employeeId = this.safeText(record.employeeId);
      if (!id || !employeeId || seen.has(id)) continue;
      seen.add(id);

      out.push({
        ...(record as unknown as EmployeeTimePermission),
        id,
        employeeId,
        status: isCatalogMember(TIME_PERMISSION_STATUS_LABELS, record.status)
          ? (record.status as TimePermissionStatus)
          : 'registered',
        transactionId: this.safeText(record.transactionId),
      });
    }
    return out;
  }

  static normalizeAssignments(raw: unknown): EmployeeAssignment[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: EmployeeAssignment[] = [];

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const id = this.safeText(record.id);
      const employeeId = this.safeText(record.employeeId);
      if (!id || !employeeId || seen.has(id)) continue;
      seen.add(id);

      out.push({
        ...(record as unknown as EmployeeAssignment),
        id,
        employeeId,
        status: isCatalogMember(ASSIGNMENT_STATUS_LABELS, record.status)
          ? (record.status as AssignmentStatus)
          : 'registered',
        transactionId: this.safeText(record.transactionId),
      });
    }
    return out;
  }

  static normalizeCourses(raw: unknown): EmployeeCourse[] {
    if (!Array.isArray(raw)) return [];
    const seen = new Set<string>();
    const out: EmployeeCourse[] = [];

    for (const item of raw) {
      if (!item || typeof item !== 'object') continue;
      const record = item as Record<string, unknown>;
      const id = this.safeText(record.id);
      const employeeId = this.safeText(record.employeeId);
      if (!id || !employeeId || seen.has(id)) continue;
      seen.add(id);

      out.push({
        ...(record as unknown as EmployeeCourse),
        id,
        employeeId,
        participationStatus: isCatalogMember(PARTICIPATION_STATUS_LABELS, record.participationStatus)
          ? (record.participationStatus as ParticipationStatus)
          : 'registered',
        transactionId: this.safeText(record.transactionId),
      });
    }
    return out;
  }

  // ───────── 4) الإنشاء — يتحقق ثم يُرجع نتيجة صريحة (immutable) ─────────

  static createLeave(input: LeaveInput): ServiceResult<EmployeeLeave> {
    const candidate: EmployeeLeave = {
      ...input,
      id: this.generateId('leave'),
      status: input.status ?? 'registered',
      isPaid: input.isPaid ?? true,
    };
    const validation = this.validateLeave(candidate);
    if (validation.ok === false) return { ok: false, errors: validation.errors };
    return { ok: true, value: candidate };
  }

  static createTimePermission(
    input: TimePermissionInput
  ): ServiceResult<EmployeeTimePermission> {
    const candidate: EmployeeTimePermission = {
      ...input,
      id: this.generateId('time'),
      status: input.status ?? 'registered',
    };
    const validation = this.validateTimePermission(candidate);
    if (validation.ok === false) return { ok: false, errors: validation.errors };
    return { ok: true, value: candidate };
  }

  static createAssignment(input: AssignmentInput): ServiceResult<EmployeeAssignment> {
    const candidate: EmployeeAssignment = {
      ...input,
      id: this.generateId('assign'),
      status: input.status ?? 'registered',
    };
    const validation = this.validateAssignment(candidate);
    if (validation.ok === false) return { ok: false, errors: validation.errors };
    return { ok: true, value: candidate };
  }

  static createCourse(input: CourseInput): ServiceResult<EmployeeCourse> {
    const candidate: EmployeeCourse = {
      ...input,
      id: this.generateId('course'),
      participationStatus: input.participationStatus ?? 'registered',
    };
    const validation = this.validateCourse(candidate);
    if (validation.ok === false) return { ok: false, errors: validation.errors };
    return { ok: true, value: candidate };
  }

  // ───────── 5) التعديل والحذف — عمليات نقية (immutable) ─────────

  /** مساعد داخلي: تعديل عنصر بمعرّف عبر دمج رقعة (id غير قابل للتغيير) */
  private static patchById<T extends { id: string }>(
    items: T[],
    id: string,
    patch: Partial<T>,
    validate: (candidate: T) => ValidationResult
  ): ServiceResult<T[]> {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, errors: [`لا يوجد سجل بالمعرّف: ${id}`] };

    const merged: T = { ...items[index], ...patch, id: items[index].id };
    const validation = validate(merged);
    if (validation.ok === false) return { ok: false, errors: validation.errors };

    const next = items.slice();
    next[index] = merged;
    return { ok: true, value: next };
  }

  static updateLeave(
    items: EmployeeLeave[],
    id: string,
    patch: Partial<EmployeeLeave>
  ): ServiceResult<EmployeeLeave[]> {
    return this.patchById(items, id, patch, (candidate) => this.validateLeave(candidate));
  }

  static updateTimePermission(
    items: EmployeeTimePermission[],
    id: string,
    patch: Partial<EmployeeTimePermission>
  ): ServiceResult<EmployeeTimePermission[]> {
    return this.patchById(items, id, patch, (candidate) => this.validateTimePermission(candidate));
  }

  static updateAssignment(
    items: EmployeeAssignment[],
    id: string,
    patch: Partial<EmployeeAssignment>
  ): ServiceResult<EmployeeAssignment[]> {
    return this.patchById(items, id, patch, (candidate) => this.validateAssignment(candidate));
  }

  static updateCourse(
    items: EmployeeCourse[],
    id: string,
    patch: Partial<EmployeeCourse>
  ): ServiceResult<EmployeeCourse[]> {
    return this.patchById(items, id, patch, (candidate) => this.validateCourse(candidate));
  }

  /** حذف بمعرّف — يُرجع مصفوفة جديدة (الحذف النهائي/الناعم مسؤولية مرحلة لاحقة) */
  static removeById<T extends { id: string }>(items: T[], id: string): T[] {
    return items.filter((item) => item.id !== id);
  }

  // ───────── 6) الاستعلامات (نقية) ─────────

  /** كل سجلات منتسب — الرابط الأساسي (employeeId) */
  static getByEmployee<T extends { employeeId: string }>(items: T[], employeeId: string): T[] {
    if (!isNonEmptyString(employeeId)) return [];
    return items.filter((item) => item.employeeId === employeeId);
  }

  /** كل السجلات المرتبطة بكتاب/معاملة (العلاقة الاختيارية أحادية الاتجاه) */
  static getByTransaction<T extends { transactionId?: string }>(
    items: T[],
    transactionId: string
  ): T[] {
    if (!isNonEmptyString(transactionId)) return [];
    return items.filter((item) => item.transactionId === transactionId);
  }

  // ───────── 7) ربط/فك ربط الكتاب (أحادي الاتجاه فقط) ─────────

  static linkTransaction<T extends { id: string; transactionId?: string }>(
    items: T[],
    id: string,
    transactionId: string
  ): ServiceResult<T[]> {
    if (!isNonEmptyString(transactionId)) {
      return { ok: false, errors: ['معرف المعاملة (transactionId) مطلوب.'] };
    }
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, errors: [`لا يوجد سجل بالمعرّف: ${id}`] };

    const next = items.slice();
    next[index] = { ...items[index], transactionId };
    return { ok: true, value: next };
  }

  static unlinkTransaction<T extends { id: string; transactionId?: string }>(
    items: T[],
    id: string
  ): ServiceResult<T[]> {
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) return { ok: false, errors: [`لا يوجد سجل بالمعرّف: ${id}`] };

    const next = items.slice();
    next[index] = { ...items[index], transactionId: undefined };
    return { ok: true, value: next };
  }
}
