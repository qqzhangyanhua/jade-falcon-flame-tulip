/** Studio link for the rev the user is looking at. The saved line may still be older. */
export function brandGuideHref(projectId: string, styleId: string, rev: number): string {
  return `/guide/${encodeURIComponent(projectId)}/${encodeURIComponent(styleId)}?rev=${rev}`;
}

/**
 * The query rev wins only when that rev is already on the style line.
 * Otherwise the saved current rev is what the page can actually show.
 */
export function styleForGuide<T extends { currentRev: number; revs: readonly { rev: number }[] }>(
  style: T,
  revParam: string | readonly string[] | undefined | null,
): T {
  const raw = Array.isArray(revParam) ? revParam[0] : revParam;
  if (typeof raw !== "string" || !/^[0-9]+$/.test(raw)) return style;
  const rev = Number(raw);
  if (!style.revs.some((record) => record.rev === rev)) return style;
  if (style.currentRev === rev) return style;
  return { ...style, currentRev: rev };
}

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
