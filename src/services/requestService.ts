/**
 * RequestService — مركز الطلبات والموافقات (BR-11)
 *
 * التدفق المعتمد:
 *   Employee → Request → Director → Approve / Reject / Clarification
 *
 * قواعد التنفيذ:
 * - لا يستورد StorageService ولا يعرف localStorage ولا JSON ولا مفاتيح التخزين.
 * - لا يستخدم throw؛ كل النتائج صريحة (ServiceResult / ValidationResult).
 * - جميع العمليات immutable (تُرجع مصفوفات/كائنات جديدة ولا تعدّل مدخلاتها).
 * - لا تُنفَّذ قواعد الإلغاء أو إعادة الرصيد تلقائيًا (غير معتمدة وفق BR-09/BR-11) —
 *   ما يزال حاجة مسجَّلة ولم يُخترع سلوك لها.
 * - الربط بالسجل الناتج (linkedRecordId) يتم عند الاعتماد وفق المرحلة المسؤولة (نموذج request.ts).
 * - خدمة مجال بحتة؛ الحفظ مسؤولية طبقة التنسيق عبر IDataStorage (نقطة الفصل لـ PHASE 11/12).
 */

import type {
  Request,
  RequestPayload,
  RequestStatus,
  RequestDirectorAction,
  RequestClarification,
  RequestDirectorDecision,
  LeaveRequestPayload,
  TimePermissionRequestPayload,
} from '../core/models';

import { LEAVE_TYPE_LABELS } from '../core/models';

import type {
  ValidationOk,
  ValidationFail,
  ValidationResult,
  ServiceOk,
  ServiceFail,
  ServiceResult,
} from './personnelService';

export interface CreateRequestInput {
  employeeId: string;
  payload: RequestPayload;
  notes?: string;
  createdAt?: string;
}
export interface SubmitClarificationResponseInput {
  response: string;
  respondedAt?: string;
}
export interface DirectorDecisionOptions {
  comment?: string;
  decidedAt?: string;
  question?: string;
}

export interface LinkRecordInput {
  linkedRecordId: string;
}


// ─────────────────────────── أدوات داخلية ───────────────────────────

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const isNonEmptyString = (value) =>
  typeof value === 'string' && value.trim().length > 0;

const isCatalogMember = (catalog, value) =>
  typeof value === 'string' && Object.prototype.hasOwnProperty.call(catalog, value);

const toValidationResult = (errors) =>
  errors.length === 0 ? { ok: true } : { ok: false, errors };

const isValidDate = (value) => {
  if (!isNonEmptyString(value) || !DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
};

const isValidTime = (value) =>
  isNonEmptyString(value) && TIME_PATTERN.test(value);

const isValidRange = (start, end) => {
  if (!isValidDate(start) || !isValidDate(end)) return false;
  return start <= end;
};

const nowIso = () => new Date().toISOString();

const safeText = (value) =>
  isNonEmptyString(value) ? value : undefined;

// ─────────────────────────── 1) التحقق من الحمولة (BR-09 / BR-10) ───────────────────────────

function validateLeavePayload(payload) {
  const errors = [];
  if (!isCatalogMember(LEAVE_TYPE_LABELS, payload.leaveType)) {
    errors.push('نوع الإجازة غير صالح.');
  }
  if (!isValidDate(payload.startDate)) {
    errors.push('تاريخ البداية مطلوب بصيغة YYYY-MM-DD.');
  }
  if (!isValidDate(payload.endDate)) {
    errors.push('تاريخ النهاية مطلوب بصيغة YYYY-MM-DD.');
  }
  if (isValidDate(payload.startDate) && isValidDate(payload.endDate) && !isValidRange(payload.startDate, payload.endDate)) {
    errors.push('تاريخ النهاية يجب أن يكون بعد أو يساوي تاريخ البداية.');
  }
  if (payload.days !== undefined) {
    if (typeof payload.days !== 'number' || !Number.isFinite(payload.days) || payload.days < 0) {
      errors.push('عدد الأيام يجب أن يكون رقماً غير سالب.');
    }
  }
  if (payload.reason !== undefined && typeof payload.reason !== 'string') {
    errors.push('السبب (reason) يجب أن يكون نصاً.');
  }
  return toValidationResult(errors);
}

function validateTimePermissionPayload(payload) {
  const errors = [];
  if (!isValidDate(payload.date)) {
    errors.push('تاريخ الذنبية مطلوب بصيغة YYYY-MM-DD.');
  }
  if (!isValidTime(payload.timeOut)) {
    errors.push('وقت الخروج مطلوب بصيغة HH:mm.');
  }
  if (payload.timeIn !== undefined && !isValidTime(payload.timeIn)) {
    errors.push('وقت العودة يجب أن يكون بصيغة HH:mm عند تمريره.');
  }
  if (payload.reason !== undefined && typeof payload.reason !== 'string') {
    errors.push('السبب (reason) يجب أن يكون نصاً.');
  }
  return toValidationResult(errors);
}

/** التحقق من حمولة الطلب وفق نوعه (مميز بالنوع) */
export function validateRequestPayload(payload) {
  if (payload.kind === 'leave') {
    return validateLeavePayload(payload);
  }
  return validateTimePermissionPayload(payload);
}

// ─────────────────────────── 2) التحقق من الطلب ───────────────────────────

const REQUEST_STATUS_VALUES = [
  'submitted',
  'clarification_requested',
  'approved',
  'rejected',
  'cancelled',
];

/** تحقق من بيانات طلب */
export function validateRequest(input) {
  const errors = [];
  if (!isNonEmptyString(input.employeeId)) {
    errors.push('معرف المنتسب (employeeId) مطلوب.');
  }
  if (!input.payload || typeof input.payload !== 'object') {
    errors.push('حميلة الطلب (payload) مطلوبة.');
  } else {
    const payloadResult = validateRequestPayload(input.payload);
    if (payloadResult.ok === false) {
      errors.push(...payloadResult.errors);
    }
  }
  if (input.status !== undefined) {
    if (!REQUEST_STATUS_VALUES.includes(input.status)) {
      errors.push('حالة الطلب غير صالحة.');
    }
  }
  if (input.notes !== undefined && typeof input.notes !== 'string') {
    errors.push('الملاحظات (notes) يجب أن تكون نصاً.');
  }
  if (input.linkedRecordId !== undefined && !isNonEmptyString(input.linkedRecordId)) {
    errors.push('معرف السجل المرتبط (linkedRecordId) يجب أن يكون نصاً غير فارغ عند تمريره.');
  }
  return toValidationResult(errors);
}


/** تطبيع قائمة طلبات من بيانات خام */
export function normalizeRequests(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const record = item;
    const id = safeText(record.id);
    const employeeId = safeText(record.employeeId);
    if (!id || !employeeId || seen.has(id)) continue;
    seen.add(id);
    const payload = record.payload;
    if (!payload || typeof payload !== 'object' || !('kind' in payload)) continue;
    const kind = payload.kind;
    if (kind !== 'leave' && kind !== 'time_permission') continue;
    const clarification = (typeof record.clarification === 'object' && record.clarification !== null)
      ? record.clarification : undefined;
    const directorDecision = (typeof record.directorDecision === 'object' && record.directorDecision !== null)
      ? record.directorDecision : undefined;
    const status = (typeof record.status === 'string' && REQUEST_STATUS_VALUES.includes(record.status))
      ? record.status : 'submitted';
    out.push({
      id,
      employeeId,
      payload,
      status,
      createdAt: safeText(record.createdAt),
      updatedAt: safeText(record.updatedAt),
      clarification,
      directorDecision,
      linkedRecordId: safeText(record.linkedRecordId),
      notes: safeText(record.notes),
    });
  }
  return out;
}
// ─────────────────────────── 3) عمليات المجال (immutable، بلا throw) ───────────────────────────

export class RequestService {
  static generateId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
  }

  static createRequest(items, input) {
    const validation = validateRequest(input);
    if (validation.ok === false) return { ok: false, errors: validation.errors };
    const created = {
      id: this.generateId('req'),
      employeeId: input.employeeId,
      payload: input.payload,
      status: 'submitted',
      createdAt: input.createdAt != null ? input.createdAt : nowIso(),
      updatedAt: input.createdAt != null ? input.createdAt : nowIso(),
      notes: input.notes,
    };
    return { ok: true, value: [...items, created] };
  }

  static getById(items, id) {
    if (!isNonEmptyString(id)) return undefined;
    return items.find((r) => r.id === id);
  }

  static getByEmployee(items, employeeId) {
    if (!isNonEmptyString(employeeId)) return [];
    return items.filter((r) => r.employeeId === employeeId);
  }

  static getByStatus(items, status) {
    return items.filter((r) => r.status === status);
  }
  static applyDirectorDecision(items, id, action, options) {
    const allowedActions = ['approve', 'reject', 'request_clarification'];
    if (!allowedActions.includes(action)) {
      return { ok: false, errors: ['فعل قرار المدير غير صالح.'] };
    }
    const index = items.findIndex((r) => r.id === id);
    if (index === -1) {
      return { ok: false, errors: ['لا يوجد طلب بالمعرّف: ' + id] };
    }
    const current = items[index];
    if (current.status !== 'submitted' && current.status !== 'clarification_requested') {
      return {
        ok: false,
        errors: ['لا يمكن اتخاذ قرار على طلب في حالته الحالية. يجب أن يكون الطلب مُقدَّماً أو بانتظار توضيح.'],
      };
    }
    const decidedAt = (options != null ? options.decidedAt : undefined) || nowIso();
    const next = items.slice();
    const updated = Object.assign({}, next[index]);
    if (action === 'request_clarification') {
      const question = (options != null ? options.question : undefined);
      if (!isNonEmptyString(question)) {
        return { ok: false, errors: ['يجب تحديد سؤال التوضيح عند طلب التوضيح.'] };
      }
      updated.clarification = {
        question: question,
        askedAt: decidedAt,
        response: updated.clarification ? updated.clarification.response : undefined,
        respondedAt: updated.clarification ? updated.clarification.respondedAt : undefined,
      };
      updated.status = 'clarification_requested';
    } else {
      updated.directorDecision = { action: action, decidedAt: decidedAt, comment: options != null ? options.comment : undefined };
      updated.status = action === 'approve' ? 'approved' : 'rejected';
    }
    updated.updatedAt = decidedAt;
    next[index] = updated;
    return { ok: true, value: next };
  }






  static submitClarificationResponse(items, id, input) {
    if (!isNonEmptyString(input.response)) {
      return { ok: false, errors: ['يجب تحديد ردّ المنتسب على طلب التوضيح.'] };
    }
    const index = items.findIndex((r) => r.id === id);
    if (index === -1) {
      return { ok: false, errors: ['لا يوجد طلب بالمعرّف: ' + id] };
    }
    const current = items[index];
    if (current.status !== 'clarification_requested') {
      return {
        ok: false,
        errors: ['لا يمكن الرد على طلب التوضيح إلا عند طلب المدير للتوضيح (الحالة: قيد انتظار التوضيح).'],
      };
    }
    const respondedAt = (input.respondedAt != null ? input.respondedAt : undefined) || nowIso();
    const next = items.slice();
    const updated = Object.assign({}, next[index]);
    updated.clarification = {
      question: updated.clarification ? updated.clarification.question : undefined,
      askedAt: updated.clarification ? updated.clarification.askedAt : undefined,
      response: input.response,
      respondedAt: respondedAt,
    };
    updated.updatedAt = respondedAt;
    next[index] = updated;
    return { ok: true, value: next };
  }

  static linkRecordResult(items, id, input) {
    if (!isNonEmptyString(input.linkedRecordId)) {
      return { ok: false, errors: ['معرف السجل المرتبط (linkedRecordId) مطلوب.'] };
    }
    const index = items.findIndex((r) => r.id === id);
    if (index === -1) {
      return { ok: false, errors: ['لا يوجد طلب بالمعرّف: ' + id] };
    }
    const current = items[index];
    if (current.status !== 'approved') {
      return {
        ok: false,
        errors: ['يمكن ربط السجل الناتج بالطلب المعتمد فقط (الحالة: معتمد).'],
      };
    }
    const next = items.slice();
    next[index] = Object.assign({}, next[index], { linkedRecordId: input.linkedRecordId });
    return { ok: true, value: next };
  }

  static removeById(items, id) {
    return items.filter((r) => r.id !== id);
  }
}


