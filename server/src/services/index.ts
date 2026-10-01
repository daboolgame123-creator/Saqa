/**
 * طبقة خدمات المجال (Phase 18) — محرّك قواعد الإجازات والزمنيات.
 *
 * `PersonnelRulesEngine` يحتاج `Pool` ليعقد معاملات ذرّية، بينما
 * `api/services` يعمل على `Queryable` (قد يكون `Client` داخل معاملة
 * قائمة). لذلك يُبنى المحرّك في `api/services/index.ts` بتمرير الـPool
 * صراحةً، ولا تُعاد خدمات الـAPI من هنا.
 */
export * from './requestWorkflow';
export { RequestTransitionError, type RejectedTransition } from './requestErrors';
export * from './personnelRules';
export { BalanceConflictError, LeaveRuleError } from './personnelErrors';