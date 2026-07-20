import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { MessageFlags, PermissionFlagsBits, PermissionsBitField, type ChatInputCommandInteraction } from "discord.js";
import { handleWord } from "../src/bot.js";
import type { DictionaryLookupService } from "../src/dictionary-service.js";
import type { DictionaryLookupOutcome, DictionaryResult } from "../src/dictionary-types.js";
import { PonsApiError } from "../src/pons-client.js";

const result: DictionaryResult = {
  schemaVersion: 2,
  provider: "pons",
  query: "Haus",
  fetchedAt: "2026-07-20T10:00:00.000Z",
  directions: [{
    sourceLanguage: "de",
    targetLanguage: "en",
    entries: [{
      headword: "Haus",
      headwordFull: "Haus",
      pronunciation: null,
      wordClass: "noun",
      senses: [{ label: null, translations: [{ source: "Haus", target: "house" }] }],
    }],
  }],
};

interface InteractionCalls {
  reply: unknown[];
  deferReply: unknown[];
  editReply: unknown[];
  followUp: unknown[];
  deleteReply: number;
  order: string[];
}

function interactionMock(options: {
  channelId: string;
  query?: string;
  direction?: string;
  refresh?: boolean;
  manageGuild?: boolean;
}): { interaction: ChatInputCommandInteraction; calls: InteractionCalls } {
  const calls: InteractionCalls = {
    reply: [], deferReply: [], editReply: [], followUp: [], deleteReply: 0, order: [],
  };
  const permissions = new PermissionsBitField(options.manageGuild ? PermissionFlagsBits.ManageGuild : 0n);
  const interaction = {
    channelId: options.channelId,
    user: { id: "user-1" },
    memberPermissions: permissions,
    options: {
      getString: (name: string, required?: boolean) => {
        if (name === "query") return options.query ?? "Haus";
        if (name === "direction") return options.direction ?? null;
        if (required) throw new Error(`Missing ${name}`);
        return null;
      },
      getBoolean: (name: string) => name === "refresh" ? options.refresh ?? null : null,
    },
    reply: async (value: unknown) => { calls.reply.push(value); calls.order.push("reply"); },
    deferReply: async (value: unknown) => { calls.deferReply.push(value); calls.order.push("deferReply"); },
    editReply: async (value: unknown) => { calls.editReply.push(value); calls.order.push("editReply"); },
    followUp: async (value: unknown) => { calls.followUp.push(value); calls.order.push("followUp"); },
    deleteReply: async () => { calls.deleteReply += 1; calls.order.push("deleteReply"); },
  } as unknown as ChatInputCommandInteraction;
  return { interaction, calls };
}

function serviceMock(outcome: DictionaryLookupOutcome, onLookup?: () => void): DictionaryLookupService {
  return {
    lookup: async () => {
      onLookup?.();
      return outcome;
    },
  } as unknown as DictionaryLookupService;
}

function failingService(error: Error): DictionaryLookupService {
  return {
    lookup: async () => { throw error; },
  } as unknown as DictionaryLookupService;
}

function replyContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && "content" in value) {
    return String((value as { content: unknown }).content);
  }
  return String(value);
}

describe("/word command", () => {
  it("rejects phrases and sentences before lookup", async () => {
    for (const query of ["zwei Wörter", "Ich gehe nach Hause.", "hello!", "1234"]) {
      let lookupCalls = 0;
      const { interaction, calls } = interactionMock({ channelId: "channel-1", query });
      await handleWord(interaction, serviceMock(
        { status: "found", result, cached: false },
        () => { lookupCalls += 1; },
      ));
      assert.equal(lookupCalls, 0);
      assert.equal(calls.deferReply.length, 0);
      assert.match(replyContent(calls.reply[0]), /single word without spaces/);
      assert.deepEqual((calls.reply[0] as { flags: unknown }).flags, MessageFlags.Ephemeral);
    }
  });

  it("allows hyphenated words, apostrophes, and surrounding whitespace", async () => {
    for (const query of ["E-Mail", "3D-Druck", "don't", "  Häuser  "]) {
      const { interaction, calls } = interactionMock({ channelId: "channel-1", query });
      await handleWord(interaction, serviceMock({ status: "found", result, cached: true }));
      assert.equal(calls.reply.length, 0);
      assert.deepEqual(calls.deferReply, [{ flags: MessageFlags.Ephemeral }]);
    }
  });

  it("shows successful lookups only to the invoking user in any permitted channel", async () => {
    for (const channelId of ["channel-1", "channel-2"]) {
      const { interaction, calls } = interactionMock({ channelId });
      await handleWord(interaction, serviceMock({ status: "found", result, cached: false }));
      assert.deepEqual(calls.deferReply, [{ flags: MessageFlags.Ephemeral }]);
      assert.equal(calls.followUp.length, 0);
      assert.equal(calls.deleteReply, 0);
      assert.equal(calls.editReply.length, 1);
      assert.deepEqual((calls.editReply[0] as { allowedMentions: unknown }).allowedMentions, { parse: [] });
      assert.equal((calls.editReply[0] as { embeds: unknown[] }).embeds.length, 1);
      assert.deepEqual(calls.order, ["deferReply", "editReply"]);
    }
  });

  it("requires Manage Server before refreshing", async () => {
    let lookupCalls = 0;
    const { interaction, calls } = interactionMock({ channelId: "channel-1", refresh: true, manageGuild: false });
    await handleWord(interaction, serviceMock({ status: "found", result, cached: false }, () => { lookupCalls += 1; }));
    assert.equal(lookupCalls, 0);
    assert.deepEqual(calls.reply, [{
      content: "You need the Manage Server permission to refresh dictionary entries.",
      flags: MessageFlags.Ephemeral,
    }]);
  });

  it("keeps misses and cooldowns ephemeral", async () => {
    const missing = interactionMock({ channelId: "channel-1" });
    await handleWord(missing.interaction, serviceMock({ status: "not_found", cached: false }));
    assert.equal(missing.calls.followUp.length, 0);
    assert.match(replyContent(missing.calls.editReply[0]), /couldn't find/);
    assert.deepEqual((missing.calls.editReply[0] as { allowedMentions: unknown }).allowedMentions, { parse: [] });

    const cooldown = interactionMock({ channelId: "channel-1" });
    await handleWord(cooldown.interaction, serviceMock({ status: "cooldown", retryAfterSeconds: 4 }));
    assert.equal(cooldown.calls.followUp.length, 0);
    assert.match(String(cooldown.calls.editReply[0]), /wait 4 seconds, then retry/);
  });

  it("keeps provider failures ephemeral and gives useful status-specific messages", async () => {
    const originalError = console.error;
    console.error = () => undefined;
    try {
      const cases = [
        [new PonsApiError("quota", 429, "quota"), /allowance has been exhausted/],
        [new PonsApiError("authentication", 403, "auth"), /not configured correctly/],
        [new PonsApiError("configuration", 404, "configuration"), /not configured correctly/],
        [new PonsApiError("temporary", 503, "temporary"), /temporarily unavailable/],
        [new PonsApiError("invalid_response", 200, "invalid"), /temporarily unavailable/],
      ] as const;

      for (const [error, expected] of cases) {
        const { interaction, calls } = interactionMock({ channelId: "channel-1" });
        await handleWord(interaction, failingService(error));
        assert.equal(calls.followUp.length, 0);
        assert.match(replyContent(calls.editReply[0]), expected);
      }
    } finally {
      console.error = originalError;
    }
  });
});
