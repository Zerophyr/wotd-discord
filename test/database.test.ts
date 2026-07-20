import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { WordDatabase } from "../src/database.js";

let database: WordDatabase | undefined;

afterEach(() => {
  database?.close();
  database = undefined;
});

describe("WordDatabase", () => {
  it("seeds the curated vocabulary", () => {
    database = new WordDatabase(":memory:");
    assert.equal(database.totalCount(), 14);
    assert.equal(database.remainingCount(), 14);
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
    assert.equal(database.remainingCount(), 13);
  });
});
