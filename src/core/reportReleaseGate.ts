/**
 * Phase 23 / C14 official report release gate — intentionally code-locked.
 *
 * No environment variable, URL, localStorage flag or request input can activate
 * official reports. The owner must approve a separate source change, exact-SHA
 * CI, post-wiring security review, and institutional host acceptance.
 *
 * This same gate controls BOTH real Express /api/reports access and the
 * server-authenticated React report screen. PDF has an independent host gate.
 */
export const OFFICIAL_REPORTS_RELEASE_APPROVED: boolean = false;

export interface ReportViewerAccount {
  id: string;
  role: string;
  mustChangeSecret: boolean;
}

/**
 * Presentation-only identity, not an authorization context.
 * Role and account come from the verified login + /api/auth/me contract.
 * Express must independently enforce session/RBAC and resource scope.
 */
export function officialReportViewer(
  isLocalDemo: boolean,
  account: ReportViewerAccount | null,
): { role: 'admin' | 'director' | 'employee'; sessionKey: string } | null {
  if (!OFFICIAL_REPORTS_RELEASE_APPROVED ||
      isLocalDemo ||
      account === null ||
      account.mustChangeSecret ||
      !['admin', 'director', 'employee'].includes(account.role) ||
      typeof account.id !== 'string' || account.id.trim().length === 0) {
    return null;
  }
  return {
    role: account.role as 'admin' | 'director' | 'employee',
    sessionKey: account.id,
  };
}
