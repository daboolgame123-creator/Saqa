/** Personal-record reads (§10): independent of book/request visibility. */
import type { Request } from 'express';
import type { AuthenticatedRequest } from '../auth/sessionMiddleware';
import type { PersonnelReadScope } from '../repositories/contracts';

export type { PersonnelReadScope } from '../repositories/contracts';

export function personnelScopeOf(req: Request): PersonnelReadScope {
  const identity = (req as AuthenticatedRequest).auth;
  if (identity?.role === 'admin' || identity?.role === 'director') return { kind: 'all' };
  if (identity?.role === 'employee' && typeof identity.employeeId === 'string'
      && identity.employeeId.trim() !== '') {
    return { kind: 'owner', employeeId: identity.employeeId };
  }
  return { kind: 'empty' };
}

/** A missing/malformed internal context is a programming error, never unrestricted. */
export function requirePersonnelScope(scope: PersonnelReadScope): void {
  if (scope?.kind === 'all' || scope?.kind === 'empty') return;
  if (scope?.kind === 'owner' && typeof scope.employeeId === 'string'
      && scope.employeeId.trim() !== '') return;
  throw new Error('Personnel read scope is required');
}

/** Match PostgreSQL UUID spellings (case, braces and optional four-digit separators). */
function employeeIdKey(id: string): string {
  const value = id.startsWith('{') && id.endsWith('}') ? id.slice(1, -1) : id;
  return /^[0-9a-f]{4}(?:-?[0-9a-f]{4}){7}$/i.test(value)
    ? value.replace(/-/g, '').toLowerCase()
    : id;
}

export function canReadEmployee(scope: PersonnelReadScope, employeeId: string): boolean {
  requirePersonnelScope(scope);
  return scope.kind === 'all'
    || (scope.kind === 'owner' && employeeIdKey(scope.employeeId) === employeeIdKey(employeeId));
}

/** null means an empty intersection; callers must return before accessing a repository. */
export function personnelFilter<T extends { employeeId?: string }>(
  filter: T,
  scope: PersonnelReadScope,
): T | null {
  requirePersonnelScope(scope);
  if (scope.kind === 'empty') return null;
  if (scope.kind === 'all') return filter;
  if (filter.employeeId !== undefined && !canReadEmployee(scope, filter.employeeId)) return null;
  return { ...filter, employeeId: scope.employeeId };
}
