export const wordCategories = [
  "everyday",
  "verb",
  "slang",
  "unique",
  "colloquial",
  "false_friend",
  "idiom",
] as const;

export type WordCategory = (typeof wordCategories)[number];

export interface Word {
  id: number;
  word: string;
  article: string | null;
  plural: string | null;
  english: string;
  level: string;
  meaning: string;
  exampleDe: string;
  exampleEn: string;
  category: WordCategory;
  notes: string | null;
}

export interface SeedWord extends Omit<Word, "id"> {}

export interface LocalTime {
  date: string;
  time: string;
  weekday: number;
}
