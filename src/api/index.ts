/** Data-source selection for the ALSQAYA client.
 *
 * Official API mode MUST NOT silently switch to localStorage on a network,
 * authentication, authorization, or server error. A local demo store is
 * selected only by explicit VITE_DATA_SOURCE=local configuration (or explicit
 * test adapter injection).
 */
import type { Employee } from '../core/models';
import type { IDataAdapter } from '../core/interfaces/dataAdapter';
import { createApiDataAdapter } from './apiDataAdapter';
import { LocalDataAdapter } from './localDataAdapter';

/** Adapter stays stable for the session; there is no automatic fallback. */
let activeAdapter: IDataAdapter | null = null;

function requestedKind(): 'api' | 'local' {
  return import.meta.env?.VITE_DATA_SOURCE === 'local' ? 'local' : 'api';
}

/** Defaults to API; local is available only when explicitly requested. */
export function getDataAdapter(): IDataAdapter {
  if (activeAdapter === null) {
    activeAdapter = requestedKind() === 'local'
      ? new LocalDataAdapter()
      : createApiDataAdapter();
  }
  return activeAdapter;
}

/** Legacy diagnostic kept for caller compatibility; fallback is forbidden. */
export function hasFallenBackToLocal(): boolean {
  return false;
}

/** Explicit override is reserved for testing and local development. */
export function setDataAdapter(adapter: IDataAdapter): void {
  activeAdapter = adapter;
}

export function resetDataAdapter(): void {
  activeAdapter = null;
}

/** Test the selected source before loading the rest of the UI.
 *
 * If the API is down, rejects 401/403, or returns a server failure, propagate
 * that error. Never hide it with an unrelated local dataset.
 */
export async function primeDataSource(): Promise<IDataAdapter> {
  const adapter = getDataAdapter();
  if (adapter.kind !== 'local') {
    await adapter.loadEmployees({});
  }
  return adapter;
}

export async function loadEmployeesAtStartup(): Promise<Employee[]> {
  return (await primeDataSource()).loadEmployees({});
}
