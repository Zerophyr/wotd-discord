import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { WordDatabase } from "../src/database.js";
import { DictionaryLookupService, normalizeDictionaryQuery } from "../src/dictionary-service.js";
import type { DictionaryResult } from "../src/dictionary-types.js";
import { PonsClient, type FetchFunction } from "../src/pons-client.js";

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

describe("DictionaryLookupService", () => {
  it("normalizes equivalent query spellings", () => {
    assert.equal(normalizeDictionaryQuery("  HAuS\t "), "haus");
    assert.equal(normalizeDictionaryQuery("Ｃａｆｅ́"), "café");
  });

  it("reuses a successful cache entry indefinitely", async () => {
    const database = new WordDatabase(":memory:");
    database.putDictionaryResult("haus", "Haus", result, new Date("2026-07-20T10:00:00Z"));
    let requests = 0;
    const client = new PonsClient("secret", async () => {
      requests += 1;
      return new Response(null, { status: 204 });
    });
    const service = new DictionaryLookupService(database, client);
    const outcome = await service.lookup("HAUS", { userId: "user-1", now: new Date("2036-07-20T10:00:00Z") });
    assert.equal(outcome.status, "found");
    assert.equal(outcome.status === "found" && outcome.cached, true);
    assert.equal(requests, 0);
    database.close();
  });

  it("expires negative results after 24 hours", () => {
    const database = new WordDatabase(":memory:");
    const now = new Date("2026-07-20T10:00:00Z");
    database.putDictionaryMiss("missing", "missing", now);
    assert.deepEqual(database.getDictionaryCache("missing", new Date(now.getTime() + 23 * 60 * 60 * 1_000)), { status: "not_found" });
    assert.equal(database.getDictionaryCache("missing", new Date(now.getTime() + 24 * 60 * 60 * 1_000)), null);
    database.close();
  });

  it("coalesces simultaneous identical cache misses", async () => {
    const database = new WordDatabase(":memory:");
    let requests = 0;
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchFunction: FetchFunction = async () => {
      requests += 1;
      await gate;
      return Response.json([{ lang: "de", hits: [{ type: "translation", source: "Haus", target: "house" }] }]);
    };
    const service = new DictionaryLookupService(database, new PonsClient("secret", fetchFunction));
    const first = service.lookup("Haus", { userId: "user-1" });
    const second = service.lookup("haus", { userId: "user-2" });
    release?.();
    const outcomes = await Promise.all([first, second]);
    assert.equal(requests, 1);
    assert.ok(outcomes.every((outcome) => outcome.status === "found"));
    database.close();
  });

  it("rate-limits every consecutive query from one user for ten seconds", async () => {
    const database = new WordDatabase(":memory:");
    database.putDictionaryResult("haus", "Haus", result);
    const client = new PonsClient("secret", async () => new Response(null, { status: 204 }));
    const service = new DictionaryLookupService(database, client);
    const now = new Date("2026-07-20T10:00:00Z");
    assert.equal((await service.lookup("Haus", { userId: "user-1", now })).status, "found");
    const second = await service.lookup("Haus", { userId: "user-1", now: new Date(now.getTime() + 1_000) });
    assert.deepEqual(second, { status: "cooldown", retryAfterSeconds: 9 });
    assert.equal((await service.lookup("Haus", {
      userId: "user-1",
      now: new Date(now.getTime() + 10_000),
    })).status, "found");
    database.close();
  });

  it("keeps an existing cache entry when refresh fails", async () => {
    const database = new WordDatabase(":memory:");
    database.putDictionaryResult("haus", "Haus", result);
    const client = new PonsClient("secret", async () => { throw new Error("network down"); });
    const service = new DictionaryLookupService(database, client);
    await assert.rejects(() => service.lookup("Haus", { userId: "admin", refresh: true }));
    assert.equal(database.getDictionaryCache("haus")?.status, "found");
    database.close();
  });
});
