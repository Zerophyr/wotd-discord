import type { Client } from "discord.js";
import { createWordEmbed } from "./embeds.js";
import type { Config } from "./config.js";
import type { WordDatabase } from "./database.js";
import { categoryForWeekday, getLocalTime } from "./time.js";
import type { Word } from "./types.js";

export type PostResult =
  | { status: "posted"; word: Word }
  | { status: "already-posted"; word: Word }
  | { status: "exhausted" };

export class WordPostService {
  #posting = false;

  constructor(
    private readonly client: Client,
    private readonly database: WordDatabase,
    private readonly config: Config,
  ) {}

  preview(now = new Date()): Word | null {
    const local = getLocalTime(now, this.config.timezone);
    return this.database.getNextWord(categoryForWeekday(local.weekday));
  }

  async postToday(now = new Date()): Promise<PostResult> {
    if (this.#posting) throw new Error("A Word of the Day post is already in progress");
    this.#posting = true;

    try {
      const local = getLocalTime(now, this.config.timezone);
      const existing = this.database.getPostForDate(this.config.channelId, local.date);
      if (existing) return { status: "already-posted", word: existing.word };

      const word = this.database.getNextWord(categoryForWeekday(local.weekday));
      if (!word) return { status: "exhausted" };

      const channel = await this.client.channels.fetch(this.config.channelId);
      if (!channel?.isSendable()) {
        throw new Error(`Configured WOTD_CHANNEL_ID ${this.config.channelId} is not a sendable channel`);
      }

      await channel.send({ embeds: [createWordEmbed(word, true)] });
      this.database.recordPost(word.id, this.config.channelId, local.date, now.toISOString());
      return { status: "posted", word };
    } finally {
      this.#posting = false;
    }
  }
}
