/** Small date-formatting helpers shared across the redesigned pages -
 * no date library needed for what these two need to do. */

export function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = Math.max(0, now - then);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  const week = 7 * day;

  if (diffMs < minute) return "just now";
  if (diffMs < hour) {
    const m = Math.floor(diffMs / minute);
    return `${m} minute${m === 1 ? "" : "s"} ago`;
  }
  if (diffMs < day) {
    const h = Math.floor(diffMs / hour);
    return `${h} hour${h === 1 ? "" : "s"} ago`;
  }
  if (diffMs < 2 * day) return "yesterday";
  if (diffMs < week) {
    const d = Math.floor(diffMs / day);
    return `${d} days ago`;
  }
  if (diffMs < 4 * week) {
    const w = Math.floor(diffMs / week);
    return `${w} week${w === 1 ? "" : "s"} ago`;
  }
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

/** Buckets a due-date ISO string into the label the Revision Queue shows.
 * Compares by calendar day (not raw milliseconds) so "today" is accurate
 * no matter what time of day it currently is. */
export function formatDueBucket(iso: string): { label: string; overdue: boolean } {
  const due = new Date(iso);
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(due) - startOfDay(now)) / 86_400_000);

  if (diffDays < 0) return { label: "Overdue", overdue: true };
  if (diffDays === 0) return { label: "Due Today", overdue: false };
  if (diffDays === 1) return { label: "Tomorrow", overdue: false };
  return { label: `In ${diffDays} Days`, overdue: false };
}
