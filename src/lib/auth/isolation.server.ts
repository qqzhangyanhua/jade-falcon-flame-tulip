import "server-only";
import { headers } from "next/headers";

/**
 * Fetch-Metadata sibling isolation — **server-only**.
 *
 * Apps deployed on `*.grok.me` are "same-site" to each other but MUTUALLY
 * UNTRUSTED, and a `SameSite=Lax` session cookie IS sent on same-site
 * subrequests — so without this, a malicious sibling could make a SCRIPTED
 * (fetch/XHR/form-POST) request to this app's server actions and ride this
 * app's session cookie.
 *
 * We allow only: same-origin requests, non-browser requests (no
 * `Sec-Fetch-Site`), and top-level navigations. Every cross-site / same-site
 * *scripted* request is rejected.
 */
export class CrossSiteRequestError extends Error {
  readonly status = 403;
  constructor() {
    super("Forbidden: cross-site request blocked");
    this.name = "CrossSiteRequestError";
  }
}

/** Throw `CrossSiteRequestError` for a scripted cross-site/sibling request. */
export async function assertSameSiteRequest(): Promise<void> {
  let h: Headers;
  try {
    h = new Headers(await headers());
  } catch {
    return;
  }
  const site = h.get("sec-fetch-site");
  if (!site || site === "same-origin" || site === "none") return;
  const dest = h.get("sec-fetch-dest");
  const isTopLevelGet =
    h.get("sec-fetch-mode") === "navigate" &&
    dest !== "object" &&
    dest !== "embed";
  if (isTopLevelGet) return;
  throw new CrossSiteRequestError();
}
