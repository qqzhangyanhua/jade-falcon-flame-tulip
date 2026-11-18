/**
 * Signed out always goes to sign-in. Every other refusal is the same
 * not-found, so a caller cannot tell forbidden, deleted and missing apart.
 */
export function resolveBrandGuideAccess(input: {
  signedIn: boolean;
  code: string | null;
  hasDocument: boolean;
  hasStyle: boolean;
}): "redirect" | "not_found" | "show" {
  if (!input.signedIn) return "redirect";
  if (input.code !== "ok" || !input.hasDocument || !input.hasStyle) return "not_found";
  return "show";
}
