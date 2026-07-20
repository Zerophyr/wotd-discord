import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
  type ChatInputCommandInteraction,
} from "discord.js";
import { handleWotd } from "../src/bot.js";
import type { Config } from "../src/config.js";
import { WordDatabase } from "../src/database.js";
import type { WordPostService } from "../src/post-service.js";
import { getLocalTime } from "../src/time.js";

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

function resetInteraction(confirm: boolean, canManage = true): {
  interaction: ChatInputCommandInteraction;
  replies: unknown[];
} {
  const replies: unknown[] = [];
  const interaction = {
    memberPermissions: new PermissionsBitField(canManage ? PermissionFlagsBits.ManageGuild : 0n),
    options: {
      getSubcommand: () => "reset",
      getBoolean: (name: string, required?: boolean) => {
        if (name === "confirm") return confirm;
        if (required) throw new Error(`Missing ${name}`);
        return null;
      },
    },
    reply: async (value: unknown) => { replies.push(value); },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, replies };
}

describe("/wotd reset", () => {
  it("requires Manage Server and an explicit true confirmation", async () => {
    const database = new WordDatabase(":memory:");
    const word = database.getNextWord("everyday");
    assert.ok(word);
    database.recordPost(word.id, "channel-1", "2026-07-19");
    const posts = {} as WordPostService;

    const unauthorized = resetInteraction(true, false);
    await handleWotd(unauthorized.interaction, config, database, posts);
    assert.match(String((unauthorized.replies[0] as { content: string }).content), /Manage Server/);
    assert.equal(database.remainingCount(), 69);

    const cancelled = resetInteraction(false);
    await handleWotd(cancelled.interaction, config, database, posts);
    assert.match(String((cancelled.replies[0] as { content: string }).content), /cancelled/);
    assert.equal(database.remainingCount(), 69);

    database.close();
  });

  it("restores every word while preserving an ephemeral response", async () => {
    const database = new WordDatabase(":memory:");
    const word = database.getNextWord("everyday");
    assert.ok(word);
    database.recordPost(word.id, "channel-1", "2026-07-19");
    const { interaction, replies } = resetInteraction(true);

    await handleWotd(interaction, config, database, {} as WordPostService);

    assert.equal(database.remainingCount(), 70);
    assert.equal(database.isAutomaticPostingSuppressed(getLocalTime(new Date(), config.timezone).date), true);
    assert.equal((replies[0] as { flags: unknown }).flags, MessageFlags.Ephemeral);
    assert.match((replies[0] as { content: string }).content, /Reset complete/);
    database.close();
  });
});
