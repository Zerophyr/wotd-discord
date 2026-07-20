import type { LocalTime, WordCategory } from "./types.js";

const categoriesByWeekday: readonly WordCategory[] = [
  "idiom",
  "everyday",
  "verb",
  "slang",
  "unique",
  "colloquial",
  "false_friend",
];

const weekdayNumbers: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function getLocalTime(now: Date, timezone: string): LocalTime {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(now);

  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  const weekday = weekdayNumbers[values.weekday ?? ""];
  if (weekday === undefined) throw new Error("Could not determine local weekday");

  return {
    date: `${values.year}-${values.month}-${values.day}`,
    time: `${values.hour}:${values.minute}`,
    weekday,
  };
}

export function categoryForWeekday(weekday: number): WordCategory {
  const category = categoriesByWeekday[weekday];
  if (!category) throw new Error(`Invalid weekday: ${weekday}`);
  return category;
}

export function shouldPost(local: LocalTime, postTime: string, postedToday: boolean): boolean {
  return !postedToday && local.time >= postTime;
}
