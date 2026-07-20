import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Config } from "./config.js";
import type { WordDatabase } from "./database.js";
import { createWordEmbed } from "./embeds.js";
import { WordPostService } from "./post-service.js";
import { DailyScheduler } from "./scheduler.js";
import { getLocalTime } from "./time.js";

export interface BotRuntime {
  client: Client;
  scheduler: DailyScheduler;
}

export function createBot(config: Config, database: WordDatabase): BotRuntime {
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  const posts = new WordPostService(client, database, config);
  const scheduler = new DailyScheduler(posts, database, config);

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    console.log(`Daily post: ${config.postTime} ${config.timezone}, channel ${config.channelId}`);
    scheduler.start();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === "word") {
        await handleWord(interaction, database);
      } else if (interaction.commandName === "wotd") {
        await handleWotd(interaction, config, database, posts);
      }
    } catch (error) {
      console.error(`Command /${interaction.commandName} failed:`, error);
      const response = { content: "Something went wrong while running that command.", flags: MessageFlags.Ephemeral } as const;
      if (interaction.replied || interaction.deferred) await interaction.followUp(response);
      else await interaction.reply(response);
    }
  });

  return { client, scheduler };
}

async function handleWord(interaction: ChatInputCommandInteraction, database: WordDatabase): Promise<void> {
  const query = interaction.options.getString("query", true);
  const word = database.findWord(query);

  if (!word) {
    await interaction.reply({
      content: `I couldn't find **${query}** in the curated dictionary yet.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.reply({ embeds: [createWordEmbed(word)] });
}

async function handleWotd(
  interaction: ChatInputCommandInteraction,
  config: Config,
  database: WordDatabase,
  posts: WordPostService,
): Promise<void> {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({ content: "You need the Manage Server permission to use this command.", flags: MessageFlags.Ephemeral });
    return;
  }

  const subcommand = interaction.options.getSubcommand();

  if (subcommand === "preview") {
    const word = posts.preview();
    if (!word) {
      await interaction.reply({ content: "No unused words remain in the database.", flags: MessageFlags.Ephemeral });
      return;
    }
    await interaction.reply({ embeds: [createWordEmbed(word, true)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (subcommand === "post") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const result = await posts.postToday();
    if (result.status === "posted") {
      await interaction.editReply(`Posted **${result.word.word}** in <#${config.channelId}>.`);
    } else if (result.status === "already-posted") {
      await interaction.editReply(`Today's word, **${result.word.word}**, has already been posted.`);
    } else {
      await interaction.editReply("No unused words remain in the database.");
    }
    return;
  }

  const local = getLocalTime(new Date(), config.timezone);
  const posted = database.getPostForDate(config.channelId, local.date);
  const status = posted ? `Posted today: **${posted.word.word}**` : "Nothing has been posted today yet.";
  await interaction.reply({
    content: `${status}\nSchedule: **${config.postTime} ${config.timezone}**\nUnused words: **${database.remainingCount()} / ${database.totalCount()}**`,
    flags: MessageFlags.Ephemeral,
  });
}
