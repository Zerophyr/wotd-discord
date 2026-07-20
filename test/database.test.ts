import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { WordDatabase } from "../src/database.js";
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
});
