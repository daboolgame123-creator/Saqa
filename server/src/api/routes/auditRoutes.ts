/**
 * راوتر سجل التدقيق (Phase 15 — §31).
 *
 * يُركَّب على `/api/audit-logs` من `api/routes/index.ts`. نصّ واحد فقط:
 * قراءة الأحدث. **لا مسار PATCH/PUT/DELETE/POST هنا ولا في أي مكان** —
 * السجل غير قابل للتعديل والحذف بالتصميم لا بحجب الزر (§31 Audit
 * Integrity)، ومن يحاول مساراً كهذا يصل 404 (غير موجود) أو 403 قبله
 * من خريطة الصلاحيات.
 *
 * `view_audit_logs` تُفرض هنا صراحةً رغم خريطة method العامة: القراءة
 * العادية (`view`) لا تفتح سجل التدقيق — عائلة مستقلة في §28 لمن
 * يملكها وحده (§10.1 «متابعة Audit Log»).
 */
import { Router } from 'express';
import { requirePermission } from '../../authorization';
import { listAuditLogs } from '../controllers';

/** يبني راوتر `/api/audit-logs` — قراءة فقط. */
export function createAuditRouter(): Router {
  const router = Router();
  router.get('/', requirePermission('view_audit_logs'), listAuditLogs);
  return router;
}
