// "Viewed today" means the current local calendar day, not the last 24 hours:
// a scene viewed at 11pm stops counting as viewed today at midnight, not at
// 11pm tomorrow.
//
// last_viewed_at arrives as an RFC3339 string in UTC; parsing it into a Date
// and reading the local getters is what moves the comparison into the
// viewer's day.
export function viewedToday(
  lastViewedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastViewedAt) return false;

  const viewed = new Date(lastViewedAt);
  if (Number.isNaN(viewed.getTime())) return false;

  return (
    viewed.getFullYear() === now.getFullYear() &&
    viewed.getMonth() === now.getMonth() &&
    viewed.getDate() === now.getDate()
  );
}
