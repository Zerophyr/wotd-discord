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
import { DictionaryLookupService } from "./dictionary-service.js";
import type { LookupDirection } from "./dictionary-types.js";
import { createDictionaryEmbeds, createWordEmbed, plainText } from "./embeds.js";
import { PonsApiError, PonsClient } from "./pons-client.js";
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
  const dictionary = new DictionaryLookupService(database, new PonsClient(config.ponsApiSecret));

  client.once(Events.ClientReady, (readyClient) => {
    console.log(`Logged in as ${readyClient.user.tag}`);
    console.log(`Daily post: ${config.postTime} ${config.timezone}, channel ${config.channelId}`);
    scheduler.start();
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    try {
      if (interaction.commandName === "word") {
        await handleWord(interaction, dictionary);
      } else if (interaction.commandName === "wotd") {
        await handleWotd(interaction, config, database, posts);
      }
    } catch (error) {
      console.error(`Command /${interaction.commandName} failed:`, error);
      const content = "Something went wrong while running that command.";
      if (interaction.deferred) await interaction.editReply({ content });
      else if (interaction.replied) await interaction.followUp({ content, flags: MessageFlags.Ephemeral });
      else await interaction.reply({ content, flags: MessageFlags.Ephemeral });
    }
  });

  return { client, scheduler };
}

export async function handleWord(
  interaction: ChatInputCommandInteraction,
  dictionary: DictionaryLookupService,
): Promise<void> {
  const query = interaction.options.getString("query", true);
  const directionValue = interaction.options.getString("direction") ?? "auto";
  const direction: LookupDirection = isLookupDirection(directionValue) ? directionValue : "auto";
  const refresh = interaction.options.getBoolean("refresh") ?? false;

  if (refresh && !interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    await interaction.reply({
      content: "You need the Manage Server permission to refresh dictionary entries.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    const outcome = await dictionary.lookup(query, { userId: interaction.user.id, refresh });
    if (outcome.status === "cooldown") {
      await interaction.editReply(`Please wait ${outcome.retryAfterSeconds} second${outcome.retryAfterSeconds === 1 ? "" : "s"}, then retry your lookup.`);
      return;
    }
    if (outcome.status === "not_found") {
      await interaction.editReply({
        content: `I couldn't find **${plainText(query)}** in the PONS German–English dictionary.`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    const embeds = createDictionaryEmbeds(outcome.result, direction);
    if (embeds.length === 0) {
      await interaction.editReply({
        content: `I couldn't find **${plainText(query)}** in the requested translation direction.`,
        allowedMentions: { parse: [] },
      });
      return;
    }

    await interaction.editReply({
      embeds,
      allowedMentions: { parse: [] },
    });
  } catch (error) {
    if (!(error instanceof PonsApiError)) throw error;
    console.error(`PONS lookup failed (${error.kind}${error.status ? `, HTTP ${error.status}` : ""}).`);
    if (error.kind === "quota") {
      await interaction.editReply("The monthly PONS dictionary lookup allowance has been exhausted. Please try again later.");
    } else if (error.kind === "authentication" || error.kind === "configuration") {
      await interaction.editReply("The dictionary service is not configured correctly. Please contact a server administrator.");
    } else {
      await interaction.editReply("The dictionary service is temporarily unavailable. Please try again later.");
    }
  }
}

function isLookupDirection(value: string): value is LookupDirection {
  return value === "auto" || value === "de-en" || value === "en-de";
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
