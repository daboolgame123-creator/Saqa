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

// One pending authentication at a time. A cancelled asynchronous login is
// forbidden from installing a Bearer session after a user initiated logout.
let loginAttemptGeneration = 0;
let loginInProgress = false;

function cancelPendingLogin(): void {
  loginAttemptGeneration++;
  loginInProgress = false;
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
  if (getBearerToken() !== null || loginInProgress) {
    throw new Error('Existing or pending session must be closed first');
  }
  loginInProgress = true;
  const attempt = ++loginAttemptGeneration;
  let tokenFromThisAttempt: string | null = null;

  try {
    const payload = validateLoginResult(
      await client.post<unknown>('/auth/login', {identifier: identifier.trim(), secret}),
    );
    // A prior logout can cancel a pending /auth/login before it returned.
    // A successful old POST must not resurrect a local session.
    if (attempt !== loginAttemptGeneration || getBearerToken() !== null) {
      throw new Error('Session changed during login');
    }
    tokenFromThisAttempt = payload.sessionToken;
    setBearerToken(tokenFromThisAttempt);
    const identity = await client.get<MeResponse>('/auth/me');
    if (!isRecord(identity) || identity.userId !== payload.account.id ||
        identity.employeeId !== payload.account.employeeId ||
        identity.username !== payload.account.username ||
        identity.displayName !== payload.account.displayName ||
        identity.role !== payload.account.role) {
      throw new Error('Session identity mismatch');
    }
    if (attempt !== loginAttemptGeneration ||
        getBearerToken() !== tokenFromThisAttempt) {
      throw new Error('Session changed during verification');
    }
    return payload.account;
  } catch (error) {
    // Never revoke a different user's newer token after a late failure.
    if (tokenFromThisAttempt !== null && getBearerToken() === tokenFromThisAttempt) {
      invalidateBearerToken();
    }
    throw error;
  } finally {
    // Out-of-order completion of a cancelled attempt cannot unlock another.
    if (attempt === loginAttemptGeneration) loginInProgress = false;
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
  // Even without a bearer token, logout invalidates an in-flight /auth/login.
  cancelPendingLogin();
  const token = getBearerToken();
  if (token === null) return;

  // The API client snapshots the Bearer synchronously upon post() invocation.
  // Clear the local account immediately, rather than waiting for a slow
  // network response to grant the user a false sense of being signed out.
  let revoke: Promise<unknown>;
  try {
    revoke = client.post<unknown>('/auth/logout', undefined);
  } finally {
    if (getBearerToken() === token) invalidateBearerToken();
  }
  await revoke; // failure remains observable, but local session stays closed.
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
