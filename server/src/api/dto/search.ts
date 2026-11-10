/**
 * DTOs البحث الموحد (Phase 22 — §38 / UI-09 §39–40).
 *
 * النتيجة موحدة بين موردَين فقط: المعاملة (كتاب) والمنتسب. الطلبات خارج
 * نطاق هذه المرحلة صراحةً. كل نتيجة تحمل ما يكفي للعرض في واجهة البحث
 * والنقر لفتح المورد الحقيقي.
 *
 * لا حقول عمل جديدة هنا سوى ماwed في `src/core/models` و `repositories/contracts`.
 */
import type { AccessScope } from '../../../../src/core/models/accessScope';

/**
 * نتيجة واحدة في البحث الموحد.
 * `source` يحدد نوع المورد، و`sourceLabel` للعرض العربي في الواجهة.
 */
export interface SearchResultDto {
  /** نوع المورد: 'transaction' = كتاب/معاملة، 'employee' = منتسب. */
  source: 'transaction' | 'employee';
  /** معرّف المورد في قاعدته. */
  id: string;
  /** العنوان المعروض: موضوع المعاملة أو اسم المنتج. */
  title: string;
  /** الرقم الرسمي للمعاملة (غائب للمنتسب). */
  number?: string;
  /** تاريخ المعاملة بصيغة YYYY-MM-DD (غائب للمنتسب). */
  date?: string;
  /** الشخص المرتبط: اسم المنتج للمعاملة، أو القسم للمنتسب. */
  person?: string;
  /** مقتطف من المحتوى المطابق للعرض (مقتصر طوله). */
  excerpt?: string;
  /** تسمية المصدر للعرض في واجهة البحث. */
  sourceLabel: 'معاملة' | 'منتسب';
  /** نطاق رؤية المعاملة (للعرض الأمني فقط، غائب للمنتسب). */
  visibility?: AccessScope;
}

/** مُعاملات البحث الموحد القادمة من query string. */
export interface SearchQuery {
  /** نص البحث (إلزامي، غير فارغ بعد التحقق). */
  q: string;
  /** نوع المورد المراد البحث فيه: transaction | employee | all. الافتراضي all. */
  type?: 'transaction' | 'employee' | 'all';
  /** الحد الأقصى للنتائج لكل نوع (افتراضي 20). */
  limit?: number;
  /** عدد النتائج التي تُتخطى للترقيم. */
  offset?: number;
}