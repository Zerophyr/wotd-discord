import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { isDictionaryResult, type DictionaryResult } from "./dictionary-types.js";
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

export type DictionaryCacheRecord =
  | { status: "found"; result: DictionaryResult }
  | { status: "not_found" };

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

      CREATE TABLE IF NOT EXISTS wotd_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS dictionary_cache (
        normalized_query TEXT PRIMARY KEY,
        display_query TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('found', 'not_found')),
        result_json TEXT,
        fetched_at TEXT NOT NULL,
        expires_at TEXT,
        CHECK (
          (status = 'found' AND result_json IS NOT NULL AND expires_at IS NULL)
          OR (status = 'not_found' AND result_json IS NULL AND expires_at IS NOT NULL)
        )
      );

      CREATE INDEX IF NOT EXISTS idx_dictionary_cache_expiry ON dictionary_cache(expires_at);
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
    this.#db.transaction(() => {
      this.#db.prepare(`
        INSERT INTO post_history (word_id, channel_id, local_date, posted_at)
        VALUES (?, ?, ?, ?)
      `).run(wordId, channelId, localDate, postedAt);
      this.#db.prepare(`
        DELETE FROM wotd_state
        WHERE key = 'automatic_post_suppressed_date' AND value = ?
      `).run(localDate);
    })();
  }

  resetWotdHistory(suppressAutomaticPostingForDate: string): number {
    return this.#db.transaction(() => {
      const deleted = this.#db.prepare("DELETE FROM post_history").run().changes;
      this.#db.prepare(`
        INSERT INTO wotd_state (key, value)
        VALUES ('automatic_post_suppressed_date', ?)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
      `).run(suppressAutomaticPostingForDate);
      return deleted;
    })();
  }

  restartCompletedRotation(): boolean {
    return this.#db.transaction(() => {
      if (this.totalCount() === 0 || this.remainingCount() > 0) return false;
      this.#db.prepare("DELETE FROM post_history").run();
      return true;
    })();
  }

  isAutomaticPostingSuppressed(localDate: string): boolean {
    const row = this.#db.prepare(`
      SELECT value FROM wotd_state WHERE key = 'automatic_post_suppressed_date'
    `).get() as { value: string } | undefined;
    return row?.value === localDate;
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

  getDictionaryCache(normalizedQuery: string, now = new Date()): DictionaryCacheRecord | null {
    const row = this.#db.prepare(`
      SELECT status, result_json, expires_at
      FROM dictionary_cache
      WHERE normalized_query = ?
    `).get(normalizedQuery) as {
      status: "found" | "not_found";
      result_json: string | null;
      expires_at: string | null;
    } | undefined;

    if (!row) return null;
    if (row.expires_at && Date.parse(row.expires_at) <= now.getTime()) {
      this.deleteDictionaryCache(normalizedQuery);
      return null;
    }
    if (row.status === "not_found") return { status: "not_found" };

    try {
      const result: unknown = JSON.parse(row.result_json ?? "null");
      if (!isDictionaryResult(result)) throw new Error("Invalid cached dictionary result");
      return { status: "found", result };
    } catch {
      this.deleteDictionaryCache(normalizedQuery);
      return null;
    }
  }

  putDictionaryResult(normalizedQuery: string, displayQuery: string, result: DictionaryResult, now = new Date()): void {
    this.#db.prepare(`
      INSERT INTO dictionary_cache (
        normalized_query, display_query, status, result_json, fetched_at, expires_at
      ) VALUES (?, ?, 'found', ?, ?, NULL)
      ON CONFLICT(normalized_query) DO UPDATE SET
        display_query = excluded.display_query,
        status = excluded.status,
        result_json = excluded.result_json,
        fetched_at = excluded.fetched_at,
        expires_at = NULL
    `).run(normalizedQuery, displayQuery, JSON.stringify(result), now.toISOString());
  }

  putDictionaryMiss(normalizedQuery: string, displayQuery: string, now = new Date()): void {
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1_000).toISOString();
    this.#db.prepare(`
      INSERT INTO dictionary_cache (
        normalized_query, display_query, status, result_json, fetched_at, expires_at
      ) VALUES (?, ?, 'not_found', NULL, ?, ?)
      ON CONFLICT(normalized_query) DO UPDATE SET
        display_query = excluded.display_query,
        status = excluded.status,
        result_json = NULL,
        fetched_at = excluded.fetched_at,
        expires_at = excluded.expires_at
    `).run(normalizedQuery, displayQuery, now.toISOString(), expiresAt);
  }

  deleteDictionaryCache(normalizedQuery: string): void {
    this.#db.prepare("DELETE FROM dictionary_cache WHERE normalized_query = ?").run(normalizedQuery);
  }

  close(): void {
    this.#db.close();
  }
}
