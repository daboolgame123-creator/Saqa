/**
 * خدمة إتاحة الكتاب للمنتسب في طبقة الـAPI (Phase 13 — §9.3/§9.4 و§29).
 *
 * العمليات الأربع المعتمدة في §29:
 * - `grant` — منح إتاحة لمنتسب **واحد أو عدة منتسبين** (§9.3).
 * - `grantToLinked` — المنح الجماعي لكل **المرتبطين** بالكتاب (§9.4)،
 *   ومصدر المرتبطين جدول الروابط (`transaction_employees`) لا الاسم النصي.
 * - `revoke` — سحب الإتاحة، وهو تحديث لا حذف: الكتاب يبقى، وسجل الاطلاع
 *   السابق (Phase 15) لا يُمسّ (§9.3).
 * - `inspect` — فحص السجل للجهة الإدارية: الساري والمسحوب معاً.
 *
 * لا قرار صلاحية هنا: `manage_availability` مفروضة على المسارات، والمدير
 * لا يملكها (§9.5 و§10.2) فيُرفض بـ403 قبل هذه الطبقة. ولا قرار نطاق
 * هنا أيضاً: مسارات الإتاحة إدارية، والكتاب يُقرأ بلا قيد نطاق لأن الفاعل
 * المسموح له وحده هو المسؤول الذي يرى كل النطاقات (§10.1).
 */
import type {
  EmployeeRepository,
  TransactionAvailabilityRepository,
  TransactionEmployeeRepository,
  TransactionRepository,
} from '../../repositories/contracts';
import { ResourceNotFoundError } from '../errors';
import { toTransactionAvailabilityDto } from '../dto/recordMappers';
import type { TransactionAvailabilityDto } from '../dto';

const ARABIC_TRANSACTION = 'الكتاب';
const ARABIC_EMPLOYEE = 'المنتسب';
const ARABIC_AVAILABILITY = 'إتاحة الكتاب لهذا المنتسب';

export class TransactionAvailabilityApiService {
  constructor(
    private readonly transactions: TransactionRepository,
    private readonly availability: TransactionAvailabilityRepository,
    private readonly links: TransactionEmployeeRepository,
    private readonly employees: EmployeeRepository,
  ) {}

  /** فحص الإدارة لسجل الإتاحة (§29) — الأحدث أولاً، والساري والمسحوب معاً. */
  async inspect(transactionId: string): Promise<TransactionAvailabilityDto[]> {
    await this.requireTransaction(transactionId);
    const records = await this.availability.listByTransaction(transactionId);
    return records.map(toTransactionAvailabilityDto);
  }

  /**
   * منح إتاحة لمنتسب أو عدة منتسبين (§9.3).
   *
   * التكرار يُزال قبل الكتابة (طلب يحمل المعرّف مرتين ليس طلبين)، ومن له
   * إتاحة سارية يُتجاوَز في المستودع، والعائد الصفوف **المنشأة الآن** لا
   * كل السجل — فالفحص الكامل وظيفة `inspect`.
   */
  async grant(
    transactionId: string,
    employeeIds: readonly string[],
  ): Promise<TransactionAvailabilityDto[]> {
    await this.requireTransaction(transactionId);
    const unique = [...new Set(employeeIds)];
    await this.requireEmployees(unique);
    const records = await this.availability.grant(transactionId, unique);
    return records.map(toTransactionAvailabilityDto);
  }

  /**
   * المنح الجماعي: كل المنتسبين المرتبطين بالكتاب (§9.4).
   *
   * مرتبطون بلا روابط ⇒ لا شيء يُمنح، وتُعاد قائمة فارغة بلا خطأ: العملية
   * صحيحة لكن نتيجتها صفر (§9.4 لا تُلزم بوجود مرتبطين).
   */
  async grantToLinked(transactionId: string): Promise<TransactionAvailabilityDto[]> {
    await this.requireTransaction(transactionId);
    const links = await this.links.listByTransaction(transactionId);
    const employeeIds = [...new Set(links.map((link) => link.employeeId))];
    const records = await this.availability.grant(transactionId, employeeIds);
    return records.map(toTransactionAvailabilityDto);
  }

  /** سحب الإتاحة السارية؛ 404 إن لم تكن سارية (أو سُحبت سابقاً). */
  async revoke(transactionId: string, employeeId: string): Promise<{ employeeId: string }> {
    await this.requireTransaction(transactionId);
    const revoked = await this.availability.revoke(transactionId, employeeId);
    if (!revoked) {
      throw new ResourceNotFoundError('transactionAvailability', employeeId, ARABIC_AVAILABILITY);
    }
    return { employeeId };
  }

  /** الكتاب شرط كل عملية إتاحة: معرّف لا كتاب له ليس طلباً صالحاً. */
  private async requireTransaction(transactionId: string): Promise<void> {
    const found = await this.transactions.findById(transactionId);
    if (found === null) {
      throw new ResourceNotFoundError('transaction', transactionId, ARABIC_TRANSACTION);
    }
  }

  /**
   * كل معرّف في المنح يجب أن يقابل منتسباً موجوداً.
   *
   * القاعدة تحمل FK يمنع المنتسب المجهول، لكن ترك الخطأ يصل إليها يُنتج
   * 500 لمشكلة في المدخل: الخطأ 404 `RESOURCE_NOT_FOUND` هو العقد المستخدم
   * في بقية المسارات لسجل غير موجود، والـFK يبقى الحارس الأخير.
   */
  private async requireEmployees(employeeIds: readonly string[]): Promise<void> {
    const found = await Promise.all(employeeIds.map((id) => this.employees.findById(id)));
    const index = found.findIndex((employee) => employee === null);
    if (index >= 0) {
      throw new ResourceNotFoundError('employee', employeeIds[index], ARABIC_EMPLOYEE);
    }
  }
}
