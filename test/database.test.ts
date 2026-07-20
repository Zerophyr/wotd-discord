import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import SqliteDatabase from "better-sqlite3";
import { WordDatabase } from "../src/database.js";
import type { DictionaryResult } from "../src/dictionary-types.js";
import { seedWords } from "../src/seed-words.js";
import { wordCategories } from "../src/types.js";

let database: WordDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe("WordDatabase", () => {
  it("seeds the curated vocabulary", () => {
    database = new WordDatabase(":memory:");
    assert.equal(database.totalCount(), 70);
    assert.equal(database.remainingCount(), 70);
  });

  it("keeps ten unique words in every rotation category", () => {
    assert.equal(seedWords.length, 70);
    assert.equal(new Set(seedWords.map(({ word }) => word.toLocaleLowerCase("de"))).size, 70);

    for (const category of wordCategories) {
      assert.equal(
        seedWords.filter((word) => word.category === category).length,
        10,
        `Expected 10 words in ${category}`,
      );
    }
  });

  it("looks up German words and English meanings case-insensitively", () => {
    database = new WordDatabase(":memory:");
    assert.equal(database.findWord("FEIERABEND")?.english, "end of the working day; time after work");
    assert.equal(database.findWord("mobile phone")?.word, "Handy");
    assert.equal(database.findWord("roughly")?.word, "Pi mal Daumen");
  });

  it("records a post and never selects the same word again", () => {
    database = new WordDatabase(":memory:");
    const first = database.getNextWord("everyday");
    assert.ok(first);

    database.recordPost(first.id, "channel-1", "2026-07-20", "2026-07-20T08:00:00.000Z");
    assert.equal(database.hasPostForDate("channel-1", "2026-07-20"), true);
    assert.equal(database.getPostForDate("channel-1", "2026-07-20")?.word.id, first.id);
    assert.notEqual(database.getNextWord("everyday")?.id, first.id);
    assert.equal(database.remainingCount(), 69);
  });

  it("discards corrupt cached dictionary JSON", () => {
    const directory = mkdtempSync(join(tmpdir(), "wotd-database-test-"));
    const path = join(directory, "test.sqlite");
    try {
      const fileDatabase = new WordDatabase(path);
      const result: DictionaryResult = {
        provider: "pons",
        query: "Haus",
        fetchedAt: "2026-07-20T10:00:00.000Z",
        directions: [{
          sourceLanguage: "de",
          targetLanguage: "en",
          entries: [{
            headword: "Haus",
            headwordFull: "Haus",
            wordClass: "noun",
            translations: [{ source: "Haus", target: "house" }],
          }],
        }],
      };
      fileDatabase.putDictionaryResult("haus", "Haus", result);

      const rawDatabase = new SqliteDatabase(path);
      rawDatabase.prepare("UPDATE dictionary_cache SET result_json = ? WHERE normalized_query = ?").run("{broken", "haus");
      rawDatabase.close();

      assert.equal(fileDatabase.getDictionaryCache("haus"), null);
      fileDatabase.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("adds the dictionary cache schema to an existing WOTD database", () => {
    const directory = mkdtempSync(join(tmpdir(), "wotd-migration-test-"));
    const path = join(directory, "test.sqlite");
    try {
      const oldDatabase = new SqliteDatabase(path);
      oldDatabase.exec(`
        CREATE TABLE words (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          word TEXT NOT NULL UNIQUE COLLATE NOCASE,
          article TEXT,
          plural TEXT,
          english TEXT NOT NULL,
          level TEXT NOT NULL,
          meaning TEXT NOT NULL,
          example_de TEXT NOT NULL,
          example_en TEXT NOT NULL,
          category TEXT NOT NULL,
          notes TEXT,
          active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE TABLE post_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          word_id INTEGER NOT NULL,
          channel_id TEXT NOT NULL,
          local_date TEXT NOT NULL,
          posted_at TEXT NOT NULL,
          FOREIGN KEY (word_id) REFERENCES words(id),
          UNIQUE (word_id),
          UNIQUE (channel_id, local_date)
        );
        INSERT INTO words (
          word, article, plural, english, level, meaning, example_de, example_en, category, notes
        ) VALUES (
          'Bestandswort', 'das', 'Bestandswörter', 'existing word', 'B1', 'A pre-existing word.',
          'Das ist ein Bestandswort.', 'This is an existing word.', 'everyday', NULL
        );
      `);
      oldDatabase.close();

      const migrated = new WordDatabase(path);
      assert.equal(migrated.findWord("Bestandswort")?.english, "existing word");
      migrated.putDictionaryMiss("missing", "missing", new Date("2026-07-20T10:00:00Z"));
      assert.deepEqual(
        migrated.getDictionaryCache("missing", new Date("2026-07-20T10:01:00Z")),
        { status: "not_found" },
      );
      migrated.close();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
