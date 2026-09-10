// "Played today" means the current local calendar day, not the last 24
// hours: a scene played at 11pm stops counting as played today at midnight,
// not at 11pm tomorrow.
//
// last_played_at arrives as an RFC3339 string in UTC; parsing it into a Date
// and reading the local getters is what moves the comparison into the
// viewer's day.
export function playedToday(
  lastPlayedAt: string | null | undefined,
  now: Date = new Date()
): boolean {
  if (!lastPlayedAt) return false;

  const played = new Date(lastPlayedAt);
  if (Number.isNaN(played.getTime())) return false;

  return (
    played.getFullYear() === now.getFullYear() &&
    played.getMonth() === now.getMonth() &&
    played.getDate() === now.getDate()
  );
}
