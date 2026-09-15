import "server-only";
import { assertSameSiteRequest } from "./isolation.server";
import { requireUserId } from "./verify.server";

/**
 * Auth gate for Next.js server actions. Resolves the caller to a verified
 * `userId` from the session cookie (or optional live-preview bearer token).
 *
 * Signed out with auth on -> throws `UnauthorizedError`.
 * Auth disabled (`VITE_AUTH_ENABLED=false`) + no DATABASE_URL -> shared dev user.
 * Auth disabled + DATABASE_URL -> throw (fail closed).
 */
export async function requireActionUser(bearerToken?: string): Promise<{ userId: string }> {
  await assertSameSiteRequest();
  const userId = await requireUserId(bearerToken);
  return { userId };
}
