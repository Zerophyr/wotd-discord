import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Config } from "../src/config.js";
import { WordDatabase } from "../src/database.js";
import type { WordPostService } from "../src/post-service.js";
import { DailyScheduler } from "../src/scheduler.js";

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

describe("DailyScheduler", () => {
  it("does not post automatically on the reset date and resumes the next day", async () => {
    const database = new WordDatabase(":memory:");
    database.resetWotdHistory("2026-07-20");
    let postCalls = 0;
    const posts = {
      postToday: async () => {
        postCalls += 1;
        return { status: "already-posted" };
      },
    } as unknown as WordPostService;
    const scheduler = new DailyScheduler(posts, database, config);

    await scheduler.check(new Date("2026-07-20T10:00:00.000Z"));
    assert.equal(postCalls, 0);

    await scheduler.check(new Date("2026-07-21T10:00:00.000Z"));
    assert.equal(postCalls, 1);
    database.close();
  });
});
