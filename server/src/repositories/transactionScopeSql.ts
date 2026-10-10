/**
 * الصيغة SQL الوحيدة لقيد نطاق الرؤية على الكتب (Phase 13).
 *
 * لماذا وحدة مستقلة: نفس القيد يُطبَّق في مستودع الكتب (قراءة كتاب/قائمة)
 * وفي مستودع الروابط (روابط كتاب أو منتسب)، وتكراره في موضعين يعني
 * احتمال تباعد بينهما — وهو تباعد أمني لا تنسيقي. القرار (من يرى أي
 * نطاق) لا يُتخذ هنا: يأتي في `TransactionScopeFilter` من
 * `authorization/accessScope.ts`، وهذا الملف ينفّذه في الاستعلام فقط.
 *
 * شكل القيد:
 *   (visibility ∈ المقبول) OR (visibility = SpecificEmployees AND إتاحة سارية)
 *
 * - `visibility` عمود jsonb ويُكتب فيه نص واحد من القيم الأربع (§12)،
 *   فاستخراج القيمة النصية يكون بـ`#>> '{}'`. أي شكل آخر (null أو بنية
 *   غير متوقعة) لا يطابق شيئاً ⇒ fail-closed.
 * - الإتاحة تُقرأ من `transaction_availability` بالصف غير المسحوب فقط،
 *   وتُشترط لها قيمة `availabilityScope` التي يمرّرها قرار النطاق —
 *   فغيابها يعني عدم استعمال الإتاحة في القيد.
 */
import type { AccessScope } from '../../../src/core/models/accessScope';
import type { TransactionScopeFilter } from './contracts';

/** القيمة النصية لنطاق الرؤية المخزَّن للكتاب (jsonb ← text). */
function visibilityText(alias: string): string {
  return `(${alias}.visibility #>> '{}')`;
}

/**
 * يبني شرط `WHERE` لقيد النطاق ويضيف مُعاملاته إلى `params`.
 *
 * يعيد `FALSE` حين لا يوجد أي مسار مرئي (قائمة نطاقات فارغة وبلا إتاحة):
 * النتيجة «لا صفوف» لا «بلا قيد» — وهذا هو الفرق بين القيد الفعلي
 * وبين نسيانه.
 */
export function transactionScopeCondition(
  scope: TransactionScopeFilter,
  alias: string,
  params: unknown[],
): string {
  const parts: string[] = [];

  if (scope.visibilityIn.length > 0) {
    params.push([...scope.visibilityIn]);
    parts.push(`${visibilityText(alias)} = ANY($${params.length}::text[])`);
  }

  const { availableToEmployeeId, availabilityScope } = scope;
  if (availableToEmployeeId !== undefined && availabilityScope !== undefined) {
    params.push(availabilityScope satisfies AccessScope);
    const scopeIndex = params.length;
    params.push(availableToEmployeeId);
    const employeeIndex = params.length;
    parts.push(
      `(${visibilityText(alias)} = $${scopeIndex} AND EXISTS (
         SELECT 1 FROM transaction_availability a
         WHERE a.transaction_id = ${alias}.id
           AND a.employee_id = $${employeeIndex}
           AND a.revoked_at IS NULL
       ))`,
    );
  }

  return parts.length === 0 ? 'FALSE' : `(${parts.join(' OR ')})`;
}
