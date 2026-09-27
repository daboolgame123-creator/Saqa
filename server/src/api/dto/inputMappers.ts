/**
 * تحويل DTOs ← مدخلات المستودعات (Phase 10) — الاتجاه للكتابة.
 *
 * الغرض: فصل «شكل النقل» عن «مدخل التخزين» حتى لا تتسرّب حقول العرض
 * أو التوقيتات (createdAt/updatedAt/importedAt) إلى الاستعلام،
 * ولا تُخترع قيم للحقول الاختيارية الغائبة.
 *
 * لا تحقق هنا — المدخل يمرّ على `api/validation` قبل الوصول لهذه الدوال.
 */
import type {
  ChangeEmployeeStatusInput,
  CreateEmployeeInput,
  CreateTransactionEmployeeLink,
  CreateTransactionInput,
  UpdateEmployeeInput,
} from '../../repositories/contracts';
import type {
  ChangeEmployeeStatusDto,
  CreateEmployeeDto,
  CreateTransactionDto,
  CreateTransactionEmployeeDto,
  UpdateEmployeeDto,
  UpdateTransactionDto,
} from '../dto';

/**
 * يزيل الحقول غير المعرَّفة من كائن DTO.
 * `exactOptionalPropertyTypes` مفعّل في tsconfig المشروع، فوجود مفتاح
 * بقيمة undefined يختلف عن غيابه في الاستعلام.
 */
function stripUndefined<T extends object>(source: T): Partial<T> {
  const out: Partial<T> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined) {
      (out as Record<string, unknown>)[key] = value;
    }
  }
  return out;
}

/** مدخل إنشاء الموظف بعد التحقق. */
export function toCreateEmployeeInput(dto: CreateEmployeeDto): CreateEmployeeInput {
  return stripUndefined(dto) as CreateEmployeeInput;
}

/** مدخل تعديل الموظف بعد التحقق (الحقول غير المذكورة تبقى كما هي). */
export function toUpdateEmployeeInput(dto: UpdateEmployeeDto): UpdateEmployeeInput {
  return stripUndefined(dto) as UpdateEmployeeInput;
}

/** مدخل تغيير حالة الموظف بعد التحقق. */
export function toChangeStatusInput(dto: ChangeEmployeeStatusDto): ChangeEmployeeStatusInput {
  return stripUndefined(dto) as ChangeEmployeeStatusInput;
}

/**
 * مدخل إنشاء الكتاب بعد التحقق.
 * month لا يُنقل أصلاً: يُشتق من date داخل المستودع (عقد CreateTransactionInput).
 */
export function toCreateTransactionInput(dto: CreateTransactionDto): CreateTransactionInput {
  return stripUndefined(dto) as CreateTransactionInput;
}

/** مدخل تعديل الكتاب بعد التحقق. */
export function toUpdateTransactionInput(dto: UpdateTransactionDto): Partial<CreateTransactionInput> {
  return stripUndefined(dto) as Partial<CreateTransactionInput>;
}

/** مدخل إنشاء رابط الكتاب بالمنتسب بعد التحقق. */
export function toCreateTransactionEmployeeInput(
  dto: CreateTransactionEmployeeDto,
): CreateTransactionEmployeeLink {
  return stripUndefined(dto) as CreateTransactionEmployeeLink;
}
