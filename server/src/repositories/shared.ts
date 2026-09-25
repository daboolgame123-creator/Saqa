/**
 * أدوات مشتركة صغيرة لطبقات المستودعات (Phase 9) — بلا منطق أعمال.
 */
import type { Pool, Client } from 'pg';
import { Pool as PgPool } from 'pg';

/**
 * نوع كل استعلام SQL: Pool مستقل أو Client داخل معاملة —
 * نفس نوع قاعدة البيانات حتى تعمل الـrepositories داخل معاملة واحدة.
 */
export type Db = Pool | Client;

/** هل هو Pool (يُنشئ معاملات) أم Client (يمكن أن يكون داخل معاملة جارية)؟ */
export function isPool(db: Db): db is Pool {
  return db instanceof PgPool;
}

/** null ⇒ undefined للحقول الاختيارية في نماذج المجال. */
export function nullToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

/** يبني جزء WHERE من أزواج (عمود، قيمة) مع قيود مُرقَّمة آمنة (قيض معاملات فقط). */
export function buildWhere(
  conditions: readonly { column: string; value: unknown }[],
): { clause: string; params: unknown[] } {
  const parts: string[] = [];
  const params: unknown[] = [];
  for (const condition of conditions) {
    if (condition.value === undefined || condition.value === null) {
      continue;
    }
    params.push(condition.value);
    parts.push(`${condition.column} = $${params.length}`);
  }
  return { clause: parts.length > 0 ? ` WHERE ${parts.join(' AND ')}` : '', params };
}

/** يضيف LIMIT/OFFSET بأمان بعد مُعاملات WHERE (أعداد صحيحة موجبة فقط). */
export function limitOffsetClause(
  limit: number | undefined,
  offset: number | undefined,
  params: unknown[],
): string {
  let clause = '';
  if (Number.isInteger(limit) && (limit ?? 0) > 0) {
    params.push(limit);
    clause += ` LIMIT $${params.length}`;
  }
  if (Number.isInteger(offset) && (offset ?? 0) >= 0) {
    params.push(offset);
    clause += ` OFFSET $${params.length}`;
  }
  return clause;
}
