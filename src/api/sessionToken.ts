/** In-memory-only API Bearer session. Never persist or log the raw token.
 * Reload requires login again; HTTP server remains the authorization source.
 */
let activeToken: string | null = null;
const invalidatedObservers = new Set<() => void>();

export function getBearerToken(): string | null {
  return activeToken;
}

export function setBearerToken(token: string | null): void {
  activeToken = token;
}

/** 401 / signout / completed secret change. Only notifies if a session existed. */
export function invalidateBearerToken(): void {
  if (activeToken === null) return;
  activeToken = null;
  for (const notify of invalidatedObservers) notify();
}

export function onBearerInvalidated(notify: () => void): () => void {
  invalidatedObservers.add(notify);
  return () => { invalidatedObservers.delete(notify); };
}
