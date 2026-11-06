/** Phase 23/P1b: report authorization is derived exclusively from the session.
 * This context is NOT a query filter and must never be populated from req.query.
 * Employee reports are internally limited to audited owner-personnel sources and the separately gated incoming book report; HTTP reports remain blocked.
 */
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../auth/sessionMiddleware';
import type { ReportAccessContext, ReportType } from '../repositories/contracts';
import { RoleDeniedError } from './authorizationErrors';
import { transactionScopeFilterFor, type ScopeViewer } from './accessScope';
import { requestScopeFilterFor } from './requestScope';

export class ReportScopeNotReadyError extends Error {
  readonly code = 'REPORT_SCOPE_NOT_READY';
  constructor(readonly reportType: ReportType) {
    super(`Scoped report SQL is not verified: ${reportType}`);
    this.name = 'ReportScopeNotReadyError';
  }
}

/** Compute all independent scopes from the authenticated role and employee ID. */
export function reportAccessFor(viewer: ScopeViewer | undefined): ReportAccessContext {
  if (viewer?.role === 'admin' || viewer?.role === 'director') {
    return {
      role: viewer.role,
      employeeId: viewer.employeeId,
      transactionScope: null,
      personnelScope: { kind: 'all' },
      requestScope: { kind: 'all' },
    };
  }
  if (viewer?.role === 'employee' && typeof viewer.employeeId === 'string'
      && viewer.employeeId.trim() !== '') {
    const transactionScope = transactionScopeFilterFor(viewer);
    const requestScope = requestScopeFilterFor(viewer);
    if (transactionScope === null || requestScope.kind !== 'owner') {
      throw new Error('Report scope derivation failed');
    }
    return {
      role: 'employee',
      employeeId: viewer.employeeId,
      transactionScope,
      personnelScope: { kind: 'owner', employeeId: viewer.employeeId },
      requestScope,
    };
  }
  // Unlinked employees, absent sessions, and legacy/unknown roles fail closed.
  throw new RoleDeniedError(['admin', 'director', 'employee']);
}

/** HTTP boundary: session identity is authoritative; no fallback to null scope. */
export function reportAccessOf(req: Request): ReportAccessContext {
  return reportAccessFor((req as AuthenticatedRequest).auth);
}

/** Shared service/repository guard, including direct non-HTTP invocations.
 * 23-C1c-S2: only incoming is additionally permitted for employees, with exact\n * identity-derived visibility scope; all other book reports remain denied.
 * All other report types still fail before any database read.
 */
export function assertReportAccess(
  access: ReportAccessContext | undefined,
  reportType: ReportType,
): void {
  if (!access || (access.role !== 'admin' && access.role !== 'director' && access.role !== 'employee')) {
    throw new Error('Report access context is required');
  }
  if (access.role === 'employee') {
    // Only individually reviewed owner-only sources; never infer permissions from a filter.
    const id = access.employeeId;
    const allowed = reportType === 'employees' || reportType === 'requests' ||
      reportType === 'leaves' || reportType === 'timePermissions' ||
      reportType === 'incoming';
    const scope = access.transactionScope;
    if (!allowed
        || typeof id !== 'string' || !id.trim()
        || access.personnelScope?.kind !== 'owner'
        || access.personnelScope.employeeId !== id
        || access.requestScope?.kind !== 'owner'
        || access.requestScope.ownerEmployeeId !== id
        || scope === null
        || scope?.availableToEmployeeId !== id
        || scope?.excludeDailySituations !== true
        // A new book report must not trust an arbitrary narrowed/widened
        // caller-built visibility array or availability override.
        || (reportType === 'incoming' && (
          scope.availabilityScope !== 'SpecificEmployees' ||
          !Array.isArray(scope.visibilityIn) ||
          scope.visibilityIn.length !== 1 ||
          scope.visibilityIn[0] !== 'PublicToEmployees'
        ))) {
      throw new ReportScopeNotReadyError(reportType);
    }
    return;
  }
  if (access.transactionScope !== null || access.personnelScope?.kind !== 'all'
      || access.requestScope?.kind !== 'all') {
    throw new Error('Privileged report access context is inconsistent');
  }
}
