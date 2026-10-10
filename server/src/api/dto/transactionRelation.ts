/**
 * DTOs ارتباط الكتب (Phase 20 — §36 «Related Books»).
 *
 * السطر نفسه هو العقد: `id` + الطرفان + الفاعل + وقت الإنشاء. لا
 * `relationshipType` لأن نصّ الخطة لا يحدّد أنواعاً للعلاقة (TBD في
 * `PHASE_20_REPORT.md` §5).
 *
 * الاستجابة تُعيد **قسمين** لا قائمة واحدة مسطّحة: `outgoing` (ما يشير
 * إليه هذا الكتاب) و`incoming` (ما يشير إليه). سبب التقسيم أن §8.1
 * تطلب حقل «الكتاب المشار إليه» (اتجاه واحد)، وواجهة الكتب المرتبطة
 * (`ALSQAYA_UI_PLAN` §35) تطلب عرض الاتجاهين — والعلاقة نفسها
 * تحفظ اتجاهاً واحداً في كل صف، فالاستجابة تعرض الصفّين كما هي.
 */
export interface TransactionRelationDto {
  id: string;
  /** الطرف المُشير (A). */
  transactionId: string;
  /** الطرف المُشار إليه (B). */
  relatedTransactionId: string;
  createdBy?: string;
  createdAt?: string;
}

/**
 * DTOs نطاق الكتب في Phase 20 — ارتباط الكتب و«Duplicate Detection»
 * وانتقال الحالة (§36).
 *
 * **تحذير التشابه ليس خطأ** (§36: «لا يمنع الإدخال تلقائياً»): لا
 * `ValidationError` ولا `AppError` لفحص التشابه. العنصر الذي يصفه هذا
 * الملف يُقرأ بعد نجاح الإدخال، ويعيد `201` مع الكتاب المنشأ كالمعتاد —
 * فالفحص **لا يمنع شيئاً ولا يحذف سجلاً ولا يغيّر نتيجة الطلب**.
 */
import type { CreateTransactionDto } from './transaction';

/** سطر ارتباط كتابين كما يعود من القاعدة. */
export interface TransactionRelationDto {
  id: string;
  /** الطرف المُشير (A). */
  transactionId: string;
  /** الطرف المُشار إليه (B). */
  relatedTransactionId: string;
  createdBy?: string;
  createdAt?: string;
}

/** إنشاء ارتباط: كتاب يشير إلى كتاب. */
export interface CreateTransactionRelationDto {
  relatedTransactionId: string;
}

/**
 * الكتب المرتبطة بكتاب — الاتجاهان كما هما في القاعدة.
 *
 * `outgoing` = ما يشير إليه هذا الكتاب (§8.1 «الكتاب المشار إليه»)،
 * و`incoming` = ما يشير إليه. التقسيم لأن كل صف يحفظ اتجاهاً واحداً،
 * والواجهة (`ALSQAYA_UI_PLAN` §35) تطلب عرض الاتجاهين.
 */
export interface TransactionRelationsDto {
  outgoing: TransactionRelationDto[];
  incoming: TransactionRelationDto[];
}

/** سبب الاشتباه — قيمة واحدة من خمسة مسندة إلى بنود §36 نصّاً. */
export type DuplicateReason =
  | 'officialNumber'
  | 'date'
  | 'source'
  | 'topic'
  | 'fileHash';

/** تسمية عربية لكل سبب — للعرض فقط؛ القرار يبقى للمستخدم. */
export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  officialNumber: 'تطابق العدد الرسمي',
  date: 'تطابق التاريخ',
  source: 'تطابق جهة الكتاب',
  topic: 'تطابق الموضوع',
  fileHash: 'تطابق بصمة الملف',
};

/** كتاب قائم يشتبه في التكرار مع الكتاب المُدخَل. */
export interface DuplicateCandidateDto {
  /** معرّف الكتاب القائم — النقر يفتح المصدر الحقيقي، لا رابطاً نصياً. */
  id: string;
  number: string;
  date: string;
  entity: string;
  subject: string;
  /** الأسباب التي اشتُبه على أساسها هذا الكتاب بعينه. */
  reasons: DuplicateReason[];
}

/** نتيجة فحص التشابه المرفقة بالكتاب المُنشأ (تحذير لا رفض). */
export interface DuplicateWarningDto {
  suspected: boolean;
  /** الأسباب مجمّعة: فريدة وبترتيب ثابت. */
  reasons: DuplicateReason[];
  candidates: DuplicateCandidateDto[];
}

/**
 * إنشاء كتاب — نفس `CreateTransactionDto` بلا حقل جديد.
 *
 * الفحص لا يُطلب من العميل ولا يُرسل: الخادم يحسبه بعد نجاح الكتابة.
 * (التصدير موجود ليكون المرجع لأصل الـDTO واحداً بدل تعريف ثانٍ.)
 */
export type CreateTransactionWithDuplicatesDto = CreateTransactionDto;

/**
 * انتقال حالة الكتاب (§36 «status transition»).
 *
 * `status` من `TRANSACTION_STATUSES` — الحالتان المعتمدتان فقط (§8.1)،
 * و`expectedVersion` إلزامية (Phase 17: القفل التفاؤلي لا يُتجاوز
 * بعملية انتقال جديدة).
 *
 * **لا حقل `notes` ولا `reason`**: الخطة لم تحدّد نصّاً يرافق الانتقال،
 * و§19 لا تمنح المدير صلاحية عامة على التعليقات — فإضافة حقل تعليق
 * كانت اجتهاداً. ملاحظة الانتقال إن أُضيفت مستقبلاً: TBD.
 */
export interface TransitionTransactionStatusDto {
  status: string;
  expectedVersion: number;
}