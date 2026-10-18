import { Info } from 'luxon';

/** ISO weekdays 1 (Mon) … 7 (Sun) with short and long names. */
export const WEEKDAYS = Info.weekdays('short').map((short, i) => ({ day: i + 1, short, long: Info.weekdays('long')[i] }));

/** "Mon–Fri", "Sun–Thu" for runs, otherwise a list: "Mon, Wed, Fri". */
export function describeWeek(days: readonly number[]): string {
  if (!days.length) return 'No working days';
  const names = WEEKDAYS.map((w) => w.short);
  // Find a contiguous run, allowing it to wrap past Sunday (e.g. Sun–Thu).
  for (let start = 1; start <= 7; start++) {
    const run = Array.from({ length: days.length }, (_, i) => ((start - 1 + i) % 7) + 1);
    if (run.every((d) => days.includes(d))) {
      return days.length === 1 ? names[start - 1] : `${names[start - 1]}–${names[run.at(-1)! - 1]}`;
    }
  }
  return [...days].sort((a, b) => a - b).map((d) => names[d - 1]).join(', ');
}

export function sameWeek(a: readonly number[], b: readonly number[]): boolean {
  return [...a].sort().join() === [...b].sort().join();
}
