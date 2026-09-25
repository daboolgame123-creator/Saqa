/**
 * مستودع المعاملات (Phase 9) — الكتاب وروابطه ومرفقاته كوحدة واحدة.
 *
 * - الإنشاء يجري في معاملة واحدة: كتاب + transaction_employees + attachments
 *   (لا كيانات يتيمة على الإطلاق).
 * - لا delete: الكتاب لا يُحذف في الاستخدام الإداري العادي (§13/§32).
 * - employee_name للتوافق التراجعي فقط؛ employeeIds تُشتق من جدول الروابط.
 */
import { withTransaction } from '../database/pool';
import { deriveMonth } from '../database/dateTime';
import type {
  CreateAttachmentInput,
  CreateTransactionEmployeeInput,
  CreateTransactionInput,
  TransactionListFilter,
  TransactionRecord,
  TransactionRepository,
} from './contracts';
import { buildWhere, isPool, limitOffsetClause, nullToUndefined, type Db } from './shared';
import type { Attachment } from '../../../src/core/models/transaction';

const TRANSACTION_COLUMNS = `
  id, number, sequence, document_date AS "date", month, direction, category,
  sub_type AS "subType", entity, subject,
  addressed_to AS "addressedTo", content, employee_name AS "employeeName",
  visibility, target_scope AS "targetScope", priority,
  director_directive AS "directorDirective", reminder, status, notes,
  is_read AS "isRead", read_at AS "readAt",
  is_daily_situation AS "isDailySituation",
  daily_situation_data AS "dailySituationData",
  specific_details AS "specificDetails",
  created_at AS "createdAt", updated_at AS "updatedAt",
  imported_at AS "importedAt"
`;

const ATTACHMENT_COLUMNS = `
  id, name, type, file_size AS "fileSize", upload_date AS "uploadDate"
`;

interface TransactionRow {
  id: string;
  number: string;
  sequence: string;
  date: string;
  month: string;
  direction: TransactionRecord['direction'];
  category: TransactionRecord['category'];
  subType: string;
  entity: string;
  subject: string;
  addressedTo: string | null;
  content: string | null;
  employeeName: string | null;
  visibility: TransactionRecord['visibility'] | null;
  targetScope: string | null;
  priority: string | null;
  directorDirective: TransactionRecord['directorDirective'] | null;
  reminder: TransactionRecord['reminder'] | null;
  status: TransactionRecord['status'];
  notes: string | null;
  isRead: boolean | null;
  readAt: string | null;
  isDailySituation: boolean;
  dailySituationData: TransactionRecord['dailySituationData'] | null;
  specificDetails: TransactionRecord['specificDetails'] | null;
  createdAt: string;
  updatedAt: string;
  importedAt: string | null;
}

interface AttachmentRow {
  id: string;
  name: string;
  type: string;
  fileSize: string;
  uploadDate: string;
}

function toAttachment(row: AttachmentRow): Attachment {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    fileSize: row.fileSize,
    uploadDate: row.uploadDate,
  };
}

function toRecord(
  row: TransactionRow,
  employeeIds: string[],
  attachments: Attachment[],
): TransactionRecord {
  return {
    id: row.id,
    number: row.number,
    sequence: row.sequence,
    date: row.date,
    month: row.month,
    direction: row.direction,
    category: row.category,
    subType: row.subType,
    entity: row.entity,
    subject: row.subject,
    addressedTo: nullToUndefined(row.addressedTo),
    content: nullToUndefined(row.content),
    employeeName: nullToUndefined(row.employeeName),
    employeeIds,
    visibility: nullToUndefined(row.visibility),
    targetScope: nullToUndefined(row.targetScope as TransactionRecord['targetScope']),
    priority: nullToUndefined(row.priority as TransactionRecord['priority']),
    directorDirective: nullToUndefined(row.directorDirective),
    reminder: nullToUndefined(row.reminder),
    status: row.status,
    notes: nullToUndefined(row.notes),
    isRead: nullToUndefined(row.isRead),
    createdAt: row.createdAt,
    readAt: nullToUndefined(row.readAt),
    isDailySituation: row.isDailySituation,
    dailySituationData: nullToUndefined(row.dailySituationData),
    specificDetails: nullToUndefined(row.specificDetails),
    updatedAt: row.updatedAt,
    importedAt: row.importedAt,
    attachments,
  };
}

/** حقلاً ⇒ أعمدة SQL لتحديث الحقول الدلالية (month تُشتق من date). */
const FIELD_COLUMNS: Readonly<Record<string, string>> = {
  number: 'number',
  sequence: 'sequence',
  date: 'document_date',
  direction: 'direction',
  category: 'category',
  subType: 'sub_type',
  entity: 'entity',
  subject: 'subject',
  addressedTo: 'addressed_to',
  content: 'content',
  employeeName: 'employee_name',
  visibility: 'visibility',
  targetScope: 'target_scope',
  priority: 'priority',
  directorDirective: 'director_directive',
  reminder: 'reminder',
  status: 'status',
  notes: 'notes',
  isRead: 'is_read',
  readAt: 'read_at',
  isDailySituation: 'is_daily_situation',
  dailySituationData: 'daily_situation_data',
  specificDetails: 'specific_details',
  importedAt: 'imported_at',
};
/** يحمّل معرفات المنتسبين المرتبطين بكتب محددة في استعلام واحد. */
async function loadEmployeeIds(
  db: Db,
  transactionIds: readonly string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (transactionIds.length === 0) {
    return map;
  }
  const result = await db.query<{ transaction_id: string; employee_id: string }>(
    `SELECT transaction_id, employee_id FROM transaction_employees
     WHERE transaction_id = ANY($1) ORDER BY created_at, id`,
    [transactionIds],
  );
  for (const row of result.rows) {
    const list = map.get(row.transaction_id) ?? [];
    list.push(row.employee_id);
    map.set(row.transaction_id, list);
  }
  return map;
}

/** يحمّل مرفقات كتب محددة في استعلام واحد. */
async function loadAttachments(
  db: Db,
  transactionIds: readonly string[],
): Promise<Map<string, Attachment[]>> {
  const map = new Map<string, Attachment[]>();
  if (transactionIds.length === 0) {
    return map;
  }
  const result = await db.query<AttachmentRow & { transaction_id: string }>(
    `SELECT transaction_id, ${ATTACHMENT_COLUMNS} FROM attachments
     WHERE transaction_id = ANY($1) ORDER BY created_at, id`,
    [transactionIds],
  );
  for (const row of result.rows) {
    const list = map.get(row.transaction_id) ?? [];
    list.push(toAttachment(row));
    map.set(row.transaction_id, list);
  }
  return map;
}

/** مستودع المعاملات — إنشاء ذرّي وقراءة كاملة. */
export class PgTransactionRepository implements TransactionRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<TransactionRecord | null> {
    const result = await this.db.query<TransactionRow>(
      `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = $1`,
      [id],
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    const ids = await loadEmployeeIds(this.db, [id]);
    const attachments = await loadAttachments(this.db, [id]);
    return toRecord(row, ids.get(id) ?? [], attachments.get(id) ?? []);
  }

  async list(filter: TransactionListFilter = {}): Promise<TransactionRecord[]> {
    const { clause, params } = buildWhere([
      { column: 'month', value: filter.month },
      { column: 'status', value: filter.status },
      { column: 'direction', value: filter.direction },
    ]);
    let sql = `SELECT ${TRANSACTION_COLUMNS} FROM transactions${clause}`;
    sql += ' ORDER BY document_date DESC, created_at DESC, id';
    sql += limitOffsetClause(filter.limit, filter.offset, params);
    const result = await this.db.query<TransactionRow>(sql, params);
    const rows = result.rows;
    const transactionIds = rows.map((row) => row.id);
    const [ids, attachments] = await Promise.all([
      loadEmployeeIds(this.db, transactionIds),
      loadAttachments(this.db, transactionIds),
    ]);
    return rows.map((row) => toRecord(
      row,
      ids.get(row.id) ?? [],
      attachments.get(row.id) ?? [],
    ));
  }

  async create(input: CreateTransactionInput): Promise<TransactionRecord> {
    // شهر مشتق من تاريخ الكتاب — يُتحقق ويشتق هنا لا يُدخل يدوياً.
    const month = deriveMonth(input.date);
    const run = async (db: Db): Promise<TransactionRecord> => {
      const inserted = await db.query<TransactionRow>(
        `INSERT INTO transactions (
           number, sequence, document_date, month, direction, category, sub_type,
           entity, subject, addressed_to, content, employee_name, visibility,
           target_scope, priority, director_directive, reminder, status, notes,
           is_read, read_at, is_daily_situation, daily_situation_data,
           specific_details, imported_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                   $20,$21,$22,$23,$24,$25)
         RETURNING ${TRANSACTION_COLUMNS}`,
        [
          input.number,
          input.sequence,
          input.date,
          month,
          input.direction,
          input.category,
          input.subType,
          input.entity,
          input.subject,
          input.addressedTo ?? null,
          input.content ?? null,
          input.employeeName ?? null,
          input.visibility ?? null,
          input.targetScope ?? null,
          input.priority ?? null,
          input.directorDirective ?? null,
          input.reminder ?? null,
          input.status,
          input.notes ?? null,
          input.isRead ?? null,
          input.readAt ?? null,
          input.isDailySituation ?? false,
          input.dailySituationData ?? null,
          input.specificDetails ?? null,
          input.importedAt ?? null,
        ],
      );
      const row = inserted.rows[0];

      for (const link of input.employeeLinks ?? []) {
        await db.query(
          `INSERT INTO transaction_employees (transaction_id, employee_id, relationship_type, notes)
           VALUES ($1, $2, $3, $4)`,
          [row.id, link.employeeId, link.relationshipType ?? null, link.notes ?? null],
        );
      }
      for (const attachment of input.attachments ?? []) {
        await db.query(
          `INSERT INTO attachments (
             transaction_id, name, type, original_filename, mime_type,
             file_size, upload_date, content_hash, storage_key, ocr_state
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            row.id,
            attachment.name,
            attachment.type,
            attachment.originalFilename ?? attachment.name,
            attachment.mimeType ?? null,
            attachment.fileSize,
            attachment.uploadDate,
            attachment.contentHash ?? null,
            attachment.storageKey ?? null,
            attachment.ocrState ?? null,
          ],
        );
      }

      const ids = await loadEmployeeIds(db, [row.id]);
      const attachments = await loadAttachments(db, [row.id]);
      return toRecord(row, ids.get(row.id) ?? [], attachments.get(row.id) ?? []);
    };

    if (isPool(this.db)) {
      return withTransaction(this.db, (client) => run(client));
    }
    return run(this.db);
  }

  async update(id: string, patch: Partial<CreateTransactionInput>): Promise<TransactionRecord | null> {
    const sets: string[] = [];
    const params: unknown[] = [];
    for (const [field, column] of Object.entries(FIELD_COLUMNS)) {
      const value = (patch as Record<string, unknown>)[field];
      if (value === undefined) {
        continue;
      }
      params.push(value);
      sets.push(`${column} = $${params.length}`);
      if (field === 'date') {
        // إعادة اشتقاق الشهر كلما تغيّر تاريخ الكتاب (مشتق لا يدوّر).
        params.push(deriveMonth(value as string));
        sets.push(`month = $${params.length}`);
      }
    }
    if (sets.length === 0) {
      return this.findById(id);
    }
    params.push(id);
    const result = await this.db.query<TransactionRow>(
      `UPDATE transactions SET ${sets.join(', ')}, updated_at = now()
       WHERE id = $${params.length} RETURNING ${TRANSACTION_COLUMNS}`,
      params,
    );
    if (result.rows.length === 0) {
      return null;
    }
    const row = result.rows[0];
    const ids = await loadEmployeeIds(this.db, [id]);
    const attachments = await loadAttachments(this.db, [id]);
    return toRecord(row, ids.get(id) ?? [], attachments.get(id) ?? []);
  }
}
