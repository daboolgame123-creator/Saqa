/**
 * TransactionEmployeeService — قواعد علاقة الكتاب↔المنتسب (PHASE 5 / BR-05).
 *
 * العلاقة domain (TransactionEmployee — Many-to-Many) هي المصدر المنطقي للربط
 * بين Transaction وEmployee. جميع القواعد هنا — لا في React Views:
 * - إنشاء علاقة / حذف علاقة / جلب علاقات معاملة أو منتبس / التحقق من الوجود.
 * - مزامنة علاقات معاملة مع قائمة Employee IDs.
 * - تحويل legacy آمن: employeeName → employeeId بالتطابق الفريد فقط
 *   (لا يخمّن هوية الموظف عند تعدّد التطابقات أو غيابها — Rule 6/7).
 *
 * employeeIds/employeeName داخل Transaction يبقتا طبقتَي توافق (Compatibility):
 * - employeeIds: مرآة تُشتق من العلاقة عند الحفظ (ليست علاقة domain ثانية).
 * - employeeName: للعرض والبيانات القديمة (لا يعتمد النظام عليه كنقطة ربط).
 *
 * مستقل عن React وlocalStorage وطبقات Authentication/Authorization —
 * قابل للنقل إلى Backend لاحقاً دون إعادة تصميم Domain.
 */
import type { Employee, Transaction, TransactionEmployee } from '../core/models';
import { isEmployeeMatch, splitEmployeeNames } from '../utils/employeeUtils';
import { PersonnelService } from './personnelService';

export type TransactionEmployeeServiceResult =
  | { ok: true; value: TransactionEmployee[] }
  | { ok: false; errors: string[] };

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

export class TransactionEmployeeService {
  // ───────────────────── 1) إنشاء / حذف / تحقق ─────────────────────

  /**
   * إنشاء علاقة (idempotent): العلاقة الموجودة مسبقاً لا تُكرَّر وتُرجع كما هي.
   * لا يمس الموظف ولا المعاملة — يضيف سطر علاقة واحداً فقط.
   */
  static link(
    relations: TransactionEmployee[],
    transactionId: string,
    employeeId: string
  ): TransactionEmployeeServiceResult {
    const errors: string[] = [];
    if (!isNonEmptyString(transactionId)) errors.push('معرف المعاملة (transactionId) مطلوب.');
    if (!isNonEmptyString(employeeId)) errors.push('معرف المنتسب (employeeId) مطلوب.');
    if (errors.length > 0) return { ok: false, errors };

    if (this.exists(relations, transactionId, employeeId)) {
      return { ok: true, value: relations };
    }

    const created: TransactionEmployee = {
      id: PersonnelService.newId('txe'),
      transactionId,
      employeeId,
      createdAt: new Date().toISOString(),
    };
    return { ok: true, value: [...relations, created] };
  }

  /**
   * حذف علاقة واحدة (unlink) — لا يحذف الموظف ولا المعاملة، يزيل سطر العلاقة فقط.
   * ملاحظة: حذف الكيانين أنفسهما تدفقات مستقلة في طبقة التنسيق وليست من هنا.
   */
  static unlink(
    relations: TransactionEmployee[],
    transactionId: string,
    employeeId: string
  ): TransactionEmployeeServiceResult {
    if (!this.exists(relations, transactionId, employeeId)) {
      return { ok: false, errors: [`لا توجد علاقة بين المعاملة (${transactionId}) والمنتسب (${employeeId}).`] };
    }
    return {
      ok: true,
      value: relations.filter(
        (r) => !(r.transactionId === transactionId && r.employeeId === employeeId)
      ),
    };
  }

  /** الوجود الصريح للعلاقة (يُستخدم قبل الإنشاء/الحذف عند الحاجة). */
  static exists(
    relations: TransactionEmployee[],
    transactionId: string,
    employeeId: string
  ): boolean {
    return relations.some(
      (r) => r.transactionId === transactionId && r.employeeId === employeeId
    );
  }

  // ───────────────────── 2) الاستعلام ─────────────────────

  /** علاقات معاملة واحدة. */
  static getByTransaction(relations: TransactionEmployee[], transactionId: string): TransactionEmployee[] {
    return relations.filter((r) => r.transactionId === transactionId);
  }

  /** علاقات منتسب واحد. */
  static getByEmployee(relations: TransactionEmployee[], employeeId: string): TransactionEmployee[] {
    return relations.filter((r) => r.employeeId === employeeId);
  }

  /** مرآة التوافق: معرّفات المنتسبين المرتبطين بمعاملة — تُشتق من العلاقة لا من الحقل المخزّن. */
  static employeeIdsForTransaction(relations: TransactionEmployee[], transactionId: string): string[] {
    return this.getByTransaction(relations, transactionId).map((r) => r.employeeId);
  }

  // ───────────────────── 3) المزامنة والترحيل ─────────────────────

  /**
   * مزامنة علاقات معاملة واحدة مع قائمة مطلوبة من Employee IDs (immutable):
   * - تُبقي العلاقات الموجودة ضمن القائمة (بنفس id/createdAt).
   * - تُضيف العلاقات الناقصة.
   * - تحذف علاقات هذه المعاملة الخارجة عن القائمة.
   * - لا تمس علاقات أي معاملة أخرى.
   * هذه العملية المركزية التي يجعل عبرها الحفظ في التطبيق العلاقة هي المصدر المنطقي.
   */
  static syncForTransaction(
    relations: TransactionEmployee[],
    transactionId: string,
    employeeIds: string[]
  ): TransactionEmployee[] {
    if (!isNonEmptyString(transactionId)) return relations;

    const desired: string[] = [];
    for (const id of employeeIds) {
      if (isNonEmptyString(id) && !desired.includes(id)) desired.push(id);
    }
    const desiredSet = new Set(desired);

    const kept = relations.filter(
      (r) => r.transactionId !== transactionId || desiredSet.has(r.employeeId)
    );
    const existingIds = new Set(
      kept.filter((r) => r.transactionId === transactionId).map((r) => r.employeeId)
    );

    const added: TransactionEmployee[] = desired
      .filter((id) => !existingIds.has(id))
      .map((id) => ({
        id: PersonnelService.newId('txe'),
        transactionId,
        employeeId: id,
        createdAt: new Date().toISOString(),
      }));

    return [...kept, ...added];
  }

  /** إزالة كل علاقات معاملة (عند حذفها) — idempotent ولا تمس أي معاملة أخرى. */
  static removeForTransaction(relations: TransactionEmployee[], transactionId: string): TransactionEmployee[] {
    return relations.filter((r) => r.transactionId !== transactionId);
  }

  /** إزالة كل علاقات منتسب (عند حذفه) — idempotent ولا تمس أي منتسب آخر. */
  static removeForEmployee(relations: TransactionEmployee[], employeeId: string): TransactionEmployee[] {
    return relations.filter((r) => r.employeeId !== employeeId);
  }

  // ───────────────────── 4) التحويل الآمن والترحيل ─────────────────────

  /**
   * تحويل legacy آمن (Rule 7 + قسم C من نطاق PHASE 5):
   * أسماء نصية → معرّفات، **عند التطابق الفريد فقط**:
   * - اسم يطابق منتسباً واحداً بالضبط → معرّفه.
   * - صفر تطابقات أو أكثر من تطابق → لا شيء (لا تخمين أبداً).
   * النص غير المحوَّل يبقى في employeeName دون فقدان.
   */
  static resolveEmployeeIds(names: string[], employees: Employee[]): string[] {
    const resolved: string[] = [];
    for (const rawName of names) {
      const name = typeof rawName === 'string' ? rawName.trim() : '';
      if (!name) continue;
      const matches = employees.filter((emp) => isEmployeeMatch(emp.name, name));
      if (matches.length === 1 && !resolved.includes(matches[0].id)) {
        resolved.push(matches[0].id);
      }
    }
    return resolved;
  }

  /**
   * ترحيل/تطبيع idempotent لعلاقات البيانات الحالية (الحفاظ على البيانات — Rule 3):
   * يدمج العلاقات المخزّنة مع المشتقة من employeeIds في كل معاملة، ويحوّل الأسماء
   * القديمة (في غياب employeeIds) بالتطابق الفريد الآمن فقط، ويزيل فقط سطور
   * العلاقات التي أُشير إلى معاملات لم تعد موجودة (أو سطوراً مكرّرة/فارغة).
   *
   * تحذير: تُمرَّر قائمة المعاملات **الكاملة** (ليست مصفاة RBAC) لأنها مرجع التنظيف.
   * العلاقات المشتقة من employeeIds تُنشأ كما هي (معرّفات صريحة لا تخمين)،
   * والاسم لا يُحوَّل إلى معرّف إلا بتطابق فريد وحده.
   */
  static seedFromTransactions(
    relations: TransactionEmployee[],
    transactions: Transaction[],
    employees: Employee[]
  ): TransactionEmployee[] {
    const transactionIds = new Set(transactions.map((t) => t.id));
    const seenPairs = new Set<string>();
    const next: TransactionEmployee[] = [];

    // 1) الاحتفاظ بالعلاقات الصالحة وإزالة التكرارات وسطور المعاملات غير الموجودة.
    for (const r of relations) {
      if (!r || !isNonEmptyString(r.transactionId) || !isNonEmptyString(r.employeeId)) continue;
      if (!transactionIds.has(r.transactionId)) continue;
      const pairKey = `${r.transactionId}::${r.employeeId}`;
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      next.push(r);
    }

    // 2) إضافة العلاقات الناقصة المشتقة من employeeIds (أو من الاسم القديم عند التطابق الآمن).
    for (const tr of transactions) {
      const desired = new Set<string>();
      if (Array.isArray(tr.employeeIds)) {
        for (const id of tr.employeeIds) {
          if (isNonEmptyString(id)) desired.add(id);
        }
      }
      if (desired.size === 0 && tr.employeeName) {
        for (const id of this.resolveEmployeeIds(splitEmployeeNames(tr.employeeName), employees)) {
          desired.add(id);
        }
      }
      for (const employeeId of desired) {
        const pairKey = `${tr.id}::${employeeId}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        next.push({
          id: PersonnelService.newId('txe'),
          transactionId: tr.id,
          employeeId,
          createdAt: new Date().toISOString(),
        });
      }
    }

    return next;
  }
}
