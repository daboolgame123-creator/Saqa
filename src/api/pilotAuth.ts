/** Phase 23 pilot: authenticated UI identity always comes from the server.
 * Token lives exclusively in sessionToken.ts module memory.
 */
import type { User } from '../core/models/user';
import { getApiClient, type ApiClient } from './apiClient';
import { getBearerToken, invalidateBearerToken, setBearerToken } from './sessionToken';

export type ServerRole = 'admin' | 'director' | 'employee';

export interface ServerAccount {
  id: string;
  employeeId: string | null;
  username: string;
  displayName: string;
  role: ServerRole;
  status: 'active';
  mustChangeSecret: boolean;
}

interface LoginResponse {
  account: ServerAccount;
  sessionToken: string;
  mustChangeSecret: boolean;
}

interface MeResponse {
  userId: string;
  employeeId: string | null;
  username: string;
  displayName: string;
  role: ServerRole;
}

function isRecord(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}
function isNonempty(x: unknown): x is string {
  return typeof x === 'string' && x.trim().length > 0;
}

/** Unknown, legacy archivist, disabled and employee-without-owner all fail closed. */
export function validateLoginResult(value: unknown): LoginResponse {
  if (!isRecord(value) || !isRecord(value.account)) throw new Error('Invalid login response');
  const account = value.account;
  if (!isNonempty(value.sessionToken) || !isNonempty(account.id) ||
      !isNonempty(account.username) || !isNonempty(account.displayName) ||
      !['admin','director','employee'].includes(String(account.role)) ||
      account.status !== 'active' || typeof account.mustChangeSecret !== 'boolean' ||
      typeof value.mustChangeSecret !== 'boolean' ||
      value.mustChangeSecret !== account.mustChangeSecret ||
      (account.employeeId !== null && !isNonempty(account.employeeId)) ||
      (account.role === 'employee' && !isNonempty(account.employeeId))) {
    throw new Error('Invalid or unapproved account');
  }
  return value as unknown as LoginResponse;
}

/** Read account only from a validated login and corroborating /auth/me call. */
export async function loginWithServer(
  identifier: string, secret: string, client: ApiClient = getApiClient(),
): Promise<ServerAccount> {
  if (!isNonempty(identifier) || !isNonempty(secret)) throw new Error('Credentials required');
  if (getBearerToken() !== null) throw new Error('Existing session must be closed first');
  const payload = validateLoginResult(await client.post<unknown>('/auth/login',{identifier:identifier.trim(),secret}));
  setBearerToken(payload.sessionToken);
  try {
    const identity = await client.get<MeResponse>('/auth/me');
    if (!isRecord(identity) || identity.userId !== payload.account.id ||
        identity.employeeId !== payload.account.employeeId ||
        identity.username !== payload.account.username ||
        identity.displayName !== payload.account.displayName ||
        identity.role !== payload.account.role) {
      throw new Error('Session identity mismatch');
    }
    // /me may finish after logout or after a different session was installed.
    // A stale verification must not re-authorize the UI.
    if (getBearerToken() !== payload.sessionToken) {
      throw new Error('Session changed during verification');
    }
    return payload.account;
  } catch(error) {
    // A late failed /me must not revoke a newer user's Bearer token.
    if (getBearerToken() === payload.sessionToken) invalidateBearerToken();
    throw error;
  }
}

export function userFromServerAccount(account: ServerAccount): User {
  return {
    id:account.id,
    username:account.username,
    displayName:account.displayName,
    role:account.role,
    ...(account.employeeId !== null && {employeeId:account.employeeId}),
    isActive:true,
  };
}

/** One session only. UI clears on logout even when the server is offline. */
export async function logoutFromServer(client: ApiClient = getApiClient()): Promise<void> {
  const token = getBearerToken();
  try {
    if (token !== null) await client.post<unknown>('/auth/logout',undefined);
  } finally {
    // Out-of-order responses must not revoke another, newer session.
    if (token !== null && getBearerToken() === token) invalidateBearerToken();
  }
}

/** Backend revokes previous session upon successful own-secret change. */
export async function changeSecretWithServer(
  currentSecret:string,newSecret:string, client: ApiClient = getApiClient(),
):Promise<void> {
  const token = getBearerToken();
  if (token === null) throw new Error('Not authenticated');
  const result = await client.post<unknown>('/auth/secret',{currentSecret,newSecret});
  if (!isRecord(result) || !isRecord(result.account)) throw new Error('Invalid secret change response');
  if (getBearerToken() !== token) throw new Error('Session changed during secret update');
  invalidateBearerToken();
}
