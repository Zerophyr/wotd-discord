import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { seedWords } from "./seed-words.js";
import type { SeedWord, Word, WordCategory } from "./types.js";

interface WordRow {
  id: number;
  word: string;
  article: string | null;
  plural: string | null;
  english: string;
  level: string;
  meaning: string;
  example_de: string;
  example_en: string;
  category: WordCategory;
  notes: string | null;
}

export interface PostRecord {
  localDate: string;
  postedAt: string;
  channelId: string;
  word: Word;
}

function mapWord(row: WordRow): Word {
  return {
    id: row.id,
    word: row.word,
    article: row.article,
    plural: row.plural,
    english: row.english,
    level: row.level,
    meaning: row.meaning,
    exampleDe: row.example_de,
    exampleEn: row.example_en,
    category: row.category,
    notes: row.notes,
  };
}

export class WordDatabase {
  readonly #db: Database.Database;

  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.#db = new Database(path);
    this.#db.pragma("journal_mode = WAL");
    this.#db.pragma("foreign_keys = ON");
    this.#migrate();
    this.#seed(seedWords);
  }

  #migrate(): void {
    this.#db.exec(`
      CREATE TABLE IF NOT EXISTS words (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word TEXT NOT NULL UNIQUE COLLATE NOCASE,
        article TEXT,
        plural TEXT,
        english TEXT NOT NULL,
        level TEXT NOT NULL,
        meaning TEXT NOT NULL,
        example_de TEXT NOT NULL,
        example_en TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN (
          'everyday', 'verb', 'slang', 'unique', 'colloquial', 'false_friend', 'idiom'
        )),
        notes TEXT,
        active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS post_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        word_id INTEGER NOT NULL,
        channel_id TEXT NOT NULL,
        local_date TEXT NOT NULL,
        posted_at TEXT NOT NULL,
        FOREIGN KEY (word_id) REFERENCES words(id),
        UNIQUE (word_id),
        UNIQUE (channel_id, local_date)
      );

      CREATE INDEX IF NOT EXISTS idx_words_category ON words(category, active);
      CREATE INDEX IF NOT EXISTS idx_history_local_date ON post_history(local_date);
    `);
  }

  #seed(words: SeedWord[]): void {
    const insert = this.#db.prepare(`
      INSERT INTO words (
        word, article, plural, english, level, meaning,
        example_de, example_en, category, notes
      ) VALUES (
        @word, @article, @plural, @english, @level, @meaning,
        @exampleDe, @exampleEn, @category, @notes
      )
      ON CONFLICT(word) DO NOTHING
    `);
    this.#db.transaction((items: SeedWord[]) => {
      for (const item of items) insert.run(item);
    })(words);
  }

  findWord(query: string): Word | null {
    const normalized = query.trim();
    const exact = this.#db.prepare(`
      SELECT id, word, article, plural, english, level, meaning,
             example_de, example_en, category, notes
      FROM words
      WHERE active = 1 AND (word = ? COLLATE NOCASE OR english = ? COLLATE NOCASE)
      ORDER BY CASE WHEN word = ? COLLATE NOCASE THEN 0 ELSE 1 END
      LIMIT 1
    `).get(normalized, normalized, normalized) as WordRow | undefined;

    if (exact) return mapWord(exact);

    const escaped = normalized.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
    const partial = this.#db.prepare(`
      SELECT id, word, article, plural, english, level, meaning,
             example_de, example_en, category, notes
      FROM words
      WHERE active = 1
        AND (word LIKE @pattern ESCAPE '\\' COLLATE NOCASE
          OR english LIKE @pattern ESCAPE '\\' COLLATE NOCASE)
      ORDER BY length(word), word
      LIMIT 1
    `).get({ pattern: `%${escaped}%` }) as WordRow | undefined;

    return partial ? mapWord(partial) : null;
  }

  getNextWord(category: WordCategory): Word | null {
    const row = this.#db.prepare(`
      SELECT id, word, article, plural, english, level, meaning,
             example_de, example_en, category, notes
      FROM words
      WHERE active = 1
        AND category = ?
        AND id NOT IN (SELECT word_id FROM post_history)
      ORDER BY id
      LIMIT 1
    `).get(category) as WordRow | undefined;

    if (row) return mapWord(row);

    const fallback = this.#db.prepare(`
      SELECT id, word, article, plural, english, level, meaning,
             example_de, example_en, category, notes
      FROM words
      WHERE active = 1
        AND id NOT IN (SELECT word_id FROM post_history)
      ORDER BY id
      LIMIT 1
    `).get() as WordRow | undefined;

    return fallback ? mapWord(fallback) : null;
  }

  recordPost(wordId: number, channelId: string, localDate: string, postedAt = new Date().toISOString()): void {
    this.#db.prepare(`
      INSERT INTO post_history (word_id, channel_id, local_date, posted_at)
      VALUES (?, ?, ?, ?)
    `).run(wordId, channelId, localDate, postedAt);
  }

  hasPostForDate(channelId: string, localDate: string): boolean {
    const row = this.#db.prepare(`
      SELECT 1 FROM post_history WHERE channel_id = ? AND local_date = ? LIMIT 1
    `).get(channelId, localDate);
    return row !== undefined;
  }

  getPostForDate(channelId: string, localDate: string): PostRecord | null {
    const row = this.#db.prepare(`
      SELECT h.local_date, h.posted_at, h.channel_id,
             w.id, w.word, w.article, w.plural, w.english, w.level, w.meaning,
             w.example_de, w.example_en, w.category, w.notes
      FROM post_history h
      JOIN words w ON w.id = h.word_id
      WHERE h.channel_id = ? AND h.local_date = ?
      LIMIT 1
    `).get(channelId, localDate) as (WordRow & {
      local_date: string;
      posted_at: string;
      channel_id: string;
    }) | undefined;

    if (!row) return null;
    return {
      localDate: row.local_date,
      postedAt: row.posted_at,
      channelId: row.channel_id,
      word: mapWord(row),
    };
  }

  remainingCount(): number {
    const row = this.#db.prepare(`
      SELECT count(*) AS count
      FROM words
      WHERE active = 1 AND id NOT IN (SELECT word_id FROM post_history)
    `).get() as { count: number };
    return row.count;
  }

  totalCount(): number {
    const row = this.#db.prepare("SELECT count(*) AS count FROM words WHERE active = 1").get() as { count: number };
    return row.count;
  }

  close(): void {
    this.#db.close();
  }
}
