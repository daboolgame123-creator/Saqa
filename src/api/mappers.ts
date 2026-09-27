/**
 * تحويل DTO ← Domain في الواجهة (Phase 10).
 *
 * الاتجاه المعاكس (Domain ← DTO) في `server/src/api/dto/recordMappers.ts`.
 * الفصل مقصود: كل جهة تحوّل ما تستقبله فقط، فلا تتكرر قواعد التحويل
 * في مكانين وتختلفان.
 *
 * قاعدة المرحلة: التحويل **نقل فقط** — لا اشتقاق ولا تطبيع ولا قيمة
 * افتراضية. الحقول الاختيارية تبقى اختيارية، وغيابها يعني غياباً لا
 * fabrication. أي تطبيع للنطاق المرئي أو relationships يبقى مسؤولية
 * خدمات المجال في الواجهة (`AuthService`، `TransactionEmployeeService`).
 *
 * أنواع الـDTO نفسها تُعاد من الخادم ولا تُعاد كتابتها هنا.
 */
import type {
  EmployeeLeave,
  EmployeeTimePermission,
  EmployeeAssignment,
  EmployeeCourse,
  TransactionEmployee,
  DailySituationRecord,
  Employee,
  Transaction,
  Attachment,
} from '../core/models';
import type { TimelineEntry } from '../core/models';

/** DTO الموظف كما يعيده الخادم. */
export interface EmployeeDto {
  id: string;
  name: string;
  title: string;
  department: string;
  badgeNumber?: string;
  joinedDate?: string;
  category?: string;
  academicDegree?: string;
  specialization?: string;
  status: string;
  phone?: string;
  photo?: string;
  userId?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** DTO مرفق. */
export interface AttachmentDto {
  id: string;
  name: string;
  type: string;
  fileSize: string;
  uploadDate: string;
}

/** DTO الكتاب. */
export interface TransactionDto {
  id: string;
  number: string;
  sequence: string;
  date: string;
  month: string;
  direction: string;
  category: string;
  subType: string;
  entity: string;
  subject: string;
  addressedTo?: string;
  content?: string;
  employeeIds: string[];
  employeeName?: string;
  visibility?: Transaction['visibility'];
  targetScope?: string;
  priority?: string;
  directorDirective?: Transaction['directorDirective'];
  reminder?: Transaction['reminder'];
  status: string;
  notes?: string;
  attachments: AttachmentDto[];
  isRead?: boolean;
  readAt?: string;
  isDailySituation?: boolean;
  dailySituationData?: Transaction['dailySituationData'];
  specificDetails?: Transaction['specificDetails'];
  createdAt?: string;
  updatedAt?: string;
}

/** DTO رابط الكتاب بالمنتسب. */
export interface TransactionEmployeeDto {
  id: string;
  transactionId: string;
  employeeId: string;
  relationshipType?: string;
  notes?: string;
  createdAt?: string;
}

/** DTO قيد الموقف اليومي. */
export interface DailySituationDto {
  id: string;
  employeeId: string;
  date: string;
  category: string;
  timeOrDuration?: string;
  reason?: string;
  notes?: string;
  relatedRecord?: { kind: string; id: string };
  createdAt?: string;
}

/** DTO استجابة الخط الزمني. */
export interface TimelineResponseDto {
  entries: TimelineEntry[];
  countsBySource: Record<string, number>;
  totalCount: number;
}

/**
 * يبني كائناً يحتفظ بالحقول المعرَّفة فقط.
 *
 * لماذا لا نُرجع `{ value }`: لأن ذلك يُنتج مفتاحاً باسم `value`.
 * الغرض هنا هو **حذف مفاتيح undefined** فعلاً، لأن `exactOptionalPropertyTypes`
 * مفعّل: وجود المفتاح بقيمة undefined يختلف عن غيابه في السلوك.
 *
 * تُستدعى بالمعادلة: `pick({ a, b }, 'a', 'b')` ← ترجع نفس الكائن بلا
 * الحقول غير المعرَّفة، وبنوعها الأصلي.
 */
function pick<T extends object, TKeys extends keyof T>(source: T, ...keys: TKeys[]): Pick<T, TKeys> {
  const result = {} as Pick<T, TKeys>;
  for (const key of keys) {
    if (source[key] !== undefined) {
      result[key] = source[key];
    }
  }
  return result;
}

/** DTO الموظف ← نموذج المجال. */
export function toEmployee(dto: EmployeeDto): Employee {
  return {
    id: dto.id,
    name: dto.name,
    title: dto.title,
    department: dto.department,
    ...pick(
      dto,
      'badgeNumber',
      'joinedDate',
      'academicDegree',
      'specialization',
      'phone',
      'photo',
      'userId',
    ),
    ...(dto.category !== undefined && { category: dto.category as Employee['category'] }),
  };
}

/** DTO مرفق ← نموذج المجال. `previewUrl`/`isImage` لا تُنقل (عرضي، Phase 14). */
export function toAttachment(dto: AttachmentDto): Attachment {
  return {
    id: dto.id,
    name: dto.name,
    type: dto.type,
    fileSize: dto.fileSize,
    uploadDate: dto.uploadDate,
  };
}

/** DTO الكتاب ← نموذج المجال. */
export function toTransaction(dto: TransactionDto): Transaction {
  return {
    id: dto.id,
    number: dto.number,
    sequence: dto.sequence,
    date: dto.date,
    month: dto.month,
    direction: dto.direction as Transaction['direction'],
    category: dto.category as Transaction['category'],
    subType: dto.subType,
    entity: dto.entity,
    subject: dto.subject,
    status: dto.status as Transaction['status'],
    attachments: (dto.attachments ?? []).map(toAttachment),
    employeeIds: dto.employeeIds ?? [],
    ...(dto.addressedTo !== undefined && { addressedTo: dto.addressedTo }),
    ...(dto.content !== undefined && { content: dto.content }),
    ...(dto.employeeName !== undefined && { employeeName: dto.employeeName }),
    ...(dto.visibility !== undefined && { visibility: dto.visibility }),
    ...(dto.priority !== undefined && { priority: dto.priority as Transaction['priority'] }),
    ...(dto.directorDirective !== undefined && {
      directorDirective: dto.directorDirective,
    }),
    ...(dto.reminder !== undefined && { reminder: dto.reminder }),
    ...(dto.notes !== undefined && { notes: dto.notes }),
    ...(dto.isRead !== undefined && { isRead: dto.isRead }),
    ...(dto.readAt !== undefined && { readAt: dto.readAt }),
    ...(dto.isDailySituation !== undefined && { isDailySituation: dto.isDailySituation }),
    ...(dto.dailySituationData !== undefined && {
      dailySituationData: dto.dailySituationData,
    }),
    ...(dto.specificDetails !== undefined && { specificDetails: dto.specificDetails }),
    ...(dto.createdAt !== undefined && { createdAt: dto.createdAt }),
  };
}

/** DTO الرابط ← نموذج المجال. */
export function toTransactionEmployee(dto: TransactionEmployeeDto): TransactionEmployee {
  return {
    id: dto.id,
    transactionId: dto.transactionId,
    employeeId: dto.employeeId,
    ...(dto.relationshipType !== undefined && {
      relationshipType: dto.relationshipType as TransactionEmployee['relationshipType'],
    }),
    ...(dto.notes !== undefined && { notes: dto.notes }),
    ...(dto.createdAt !== undefined && { createdAt: dto.createdAt }),
  };
}

/** DTO القيد ← نموذج المجال. */
export function toDailySituation(dto: DailySituationDto): DailySituationRecord {
  return {
    id: dto.id,
    employeeId: dto.employeeId,
    date: dto.date,
    category: dto.category as DailySituationRecord['category'],
    ...(dto.timeOrDuration !== undefined && { timeOrDuration: dto.timeOrDuration }),
    ...(dto.reason !== undefined && { reason: dto.reason }),
    ...(dto.notes !== undefined && { notes: dto.notes }),
    ...(dto.relatedRecord !== undefined && {
      relatedRecord: {
        kind: dto.relatedRecord.kind,
        id: dto.relatedRecord.id,
      } as DailySituationRecord['relatedRecord'],
    }),
    ...(dto.createdAt !== undefined && { createdAt: dto.createdAt }),
  };
}

/** سجلات شؤون المنتسبين تُنقل كما هي: الـDTO هو نموذج المجال نفسه. */
export function toLeave(dto: EmployeeLeave): EmployeeLeave {
  return dto;
}
export function toTimePermission(dto: EmployeeTimePermission): EmployeeTimePermission {
  return dto;
}
export function toAssignment(dto: EmployeeAssignment): EmployeeAssignment {
  return dto;
}
export function toCourse(dto: EmployeeCourse): EmployeeCourse {
  return dto;
}
