/** In-memory-only API Bearer session. Never persist or log the raw token.
 * Reload requires login again; HTTP server remains the authorization source.
 */
let activeToken: string | null = null;
/** Monotonic epoch: even reusing the same token string must never revive a stale response. */
let sessionRevision = 0;
const invalidatedObservers = new Set<() => void>();

export function getBearerToken(): string | null {
  return activeToken;
}

export function getBearerRevision(): number {
  return sessionRevision;
}

export function setBearerToken(token: string | null): void {
  activeToken = token;
  // Login/logout/identity switch always creates a new response ownership epoch.
  sessionRevision += 1;
}

/** 401 / signout / completed secret change. Only notifies if a session existed. */
export function invalidateBearerToken(): void {
  if (activeToken === null) return;
  activeToken = null;
  sessionRevision += 1;
  for (const notify of invalidatedObservers) notify();
}

export function onBearerInvalidated(notify: () => void): () => void {
  invalidatedObservers.add(notify);
  return () => { invalidatedObservers.delete(notify); };
}
