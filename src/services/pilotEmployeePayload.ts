/**
 * Phase 23 official pilot personnel mutations.
 * Never send the domain model's server-assigned ID or account linkage as a
 * body field. Status transitions use their dedicated audited endpoint.
 */
import type { Employee } from '../core/models/employee';

const ALLOWED_EMPLOYEE_FIELDS = [
  'name', 'title', 'department', 'badgeNumber', 'joinedDate', 'category',
  'academicDegree', 'specialization',
] as const satisfies readonly (keyof Employee)[];

export type PilotEmployeeBody = Pick<Employee, 'name'|'title'|'department'> &
  Partial<Pick<Employee, typeof ALLOWED_EMPLOYEE_FIELDS[number]>>;

export function buildPilotEmployeeBody(employee: Omit<Employee, 'id'> | Employee): PilotEmployeeBody {
  const source = employee as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_EMPLOYEE_FIELDS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  if (typeof out.name !== 'string' || out.name.trim() === '' ||
      typeof out.title !== 'string' || out.title.trim() === '' ||
      typeof out.department !== 'string' || out.department.trim() === '') {
    throw new Error('INVALID_EMPLOYEE');
  }
  return out as PilotEmployeeBody;
}
