export const BEIJING_TIME_ZONE = "Asia/Shanghai";

const beijingDayFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: BEIJING_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Calendar date in Asia/Shanghai for an instant (YYYY-MM-DD). */
export function beijingCalendarDay(atMs: number): string {
  return beijingDayFormatter.format(new Date(atMs));
}

/**
 * Move a Beijing calendar day by whole days. Noon +08:00 is the only anchor,
 * so a copy of this shift cannot drift from the quota chart.
 */
export function shiftBeijingDay(day: string, deltaDays: number): string {
  const noon = Date.parse(`${day}T12:00:00+08:00`);
  return beijingCalendarDay(noon + deltaDays * 86_400_000);
}
