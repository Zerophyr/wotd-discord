import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Client } from "discord.js";
import type { Config } from "../src/config.js";
import { WordDatabase } from "../src/database.js";
import { WordPostService } from "../src/post-service.js";
import { seedWords } from "../src/seed-words.js";

const config: Config = {
  discordToken: "token",
  discordClientId: "client",
  discordGuildId: "guild",
  ponsApiSecret: "secret",
  channelId: "channel-1",
  postTime: "10:00",
  timezone: "Europe/Berlin",
  databasePath: ":memory:",
};

describe("WordPostService", () => {
  it("starts a new rotation when posting after the complete pool is exhausted", async () => {
    const database = new WordDatabase(":memory:");
    for (let index = 0; index < seedWords.length; index += 1) {
      const word = database.getNextWord("everyday");
      assert.ok(word);
      database.recordPost(word.id, "channel-1", `completed-${index}`);
    }

    const messages: unknown[] = [];
    const client = {
      channels: {
        fetch: async () => ({
          isSendable: () => true,
          send: async (message: unknown) => { messages.push(message); },
        }),
      },
    } as unknown as Client;
    const posts = new WordPostService(client, database, config);

    const result = await posts.postToday(new Date("2026-08-17T08:00:00.000Z"));

    assert.equal(result.status, "posted");
    assert.equal("word" in result ? result.word.word : null, "Feierabend");
    assert.equal(database.remainingCount(), 139);
    assert.equal(messages.length, 1);
    database.close();
  });
});
