/**
 * تحويل سجل ارتباط الكتب ← DTO (Phase 20).
 *
 * مورد واحد له تاريخ: كل `TransactionRelationRecord` يقابله
 * `TransactionRelationDto` بالضبط (معرّف + طرفان + فاعل + وقت). لا
 * اشتقاق ولا دمج ولا ترتيب — التحويل كامل النقالة، تماماً كما
 * `toTransactionEmployeeDto` لروابط الكتب (Phase 10).
 */
import type { TransactionRelationRecord } from '../../repositories/contracts';
import type { TransactionRelationDto } from '../dto';

export function toTransactionRelationDto(
  record: TransactionRelationRecord,
): TransactionRelationDto {
  return {
    id: record.id,
    transactionId: record.transactionId,
    relatedTransactionId: record.relatedTransactionId,
    ...(record.createdBy !== null && { createdBy: record.createdBy }),
    ...(record.createdAt !== undefined && { createdAt: record.createdAt }),
  };
}