/** Display-only book-open markers; not formal "اطلعت" acknowledgements. */
import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from '../../auth/sessionMiddleware';
import { AuthenticationRequiredError } from '../../auth/authErrors';
import { transactionScopeOf } from '../../authorization';
import { servicesOf } from '../serviceContext';
import { asyncHandler, noContent, ok, pathId } from './shared';

function userIdOf(req: Parameters<RequestHandler>[0]): string {
  const userId = (req as AuthenticatedRequest).auth?.userId;
  if (userId === undefined) throw new AuthenticationRequiredError();
  return userId;
}

/** GET /api/transactions/new-ids: only ids of currently visible recent books. */
export const listNewBookIds: RequestHandler = asyncHandler(async (req, res) => {
  const userId = userIdOf(req);
  const scope = transactionScopeOf(req) ?? undefined;
  ok(res, await servicesOf(req).newBooks.listNewIds(userId, scope));
});

/** POST /api/transactions/:id/opened: idempotent per user, never a ViewLog. */
export const markBookOpened: RequestHandler = asyncHandler(async (req, res) => {
  const userId = userIdOf(req);
  const scope = transactionScopeOf(req) ?? undefined;
  await servicesOf(req).newBooks.markOpened(pathId(req), userId, scope);
  noContent(res);
});
