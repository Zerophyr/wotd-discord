import { EmbedBuilder } from "discord.js";
import type { DictionaryResult, LookupDirection } from "./dictionary-types.js";
import type { Word } from "./types.js";

const categoryLabels: Record<Word["category"], string> = {
  everyday: "Everyday German",
  verb: "Useful verb",
  slang: "German slang",
  unique: "Uniquely German",
  colloquial: "Colloquial German",
  false_friend: "False friend",
  idiom: "German idiom",
};

function displayName(word: Word): string {
  return word.article ? `${word.article} ${word.word}` : word.word;
}

export function createWordEmbed(word: Word, daily = false): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle(`${daily ? "🇩🇪 Word of the Day · " : "🇩🇪 "}${displayName(word)}`)
    .setDescription(word.meaning)
    .addFields(
      { name: "English", value: word.english, inline: true },
      { name: "Level", value: word.level, inline: true },
      { name: "Category", value: categoryLabels[word.category], inline: true },
    );

  if (word.plural) embed.addFields({ name: "Plural", value: `die ${word.plural}`, inline: true });

  embed.addFields({
    name: "Example",
    value: `**${word.exampleDe}**\n*${word.exampleEn}*`,
  });

  if (word.notes) embed.addFields({ name: "💡 Good to know", value: word.notes });
  if (daily) embed.setFooter({ text: "DeutschDen · Jeden Tag ein bisschen Deutsch" });

  return embed;
}

const directionLabels = {
  de: "🇩🇪 German → English",
  en: "🇬🇧 English → German",
} as const;

// These tighter per-field budgets keep two embeds below Discord's 6,000-character
// combined embed limit, even when every displayed PONS value reaches its cap.
const DICTIONARY_FIELD_NAME_LIMIT = 120;
const DICTIONARY_FIELD_VALUE_LIMIT = 680;

export function createDictionaryEmbeds(result: DictionaryResult, direction: LookupDirection): EmbedBuilder[] {
  const requestedSource = direction === "de-en" ? "de" : direction === "en-de" ? "en" : null;
  return result.directions
    .filter((item) => requestedSource === null || item.sourceLanguage === requestedSource)
    .slice(0, 2)
    .map((item) => {
      const urlDirection = item.sourceLanguage === "de" ? "german-english" : "english-german";
      const embed = new EmbedBuilder()
        .setColor(0x009641)
        .setTitle(truncate(`${directionLabels[item.sourceLanguage]} · ${plainText(result.query)}`, 256))
        .setURL(`https://en.pons.com/translate/${urlDirection}/${encodeURIComponent(result.query)}`)
        .setDescription("Top matches from the PONS Online Dictionary")
        .setFooter({ text: "Source: PONS Online Dictionary" });

      for (const entry of item.entries.slice(0, 3)) {
        const fullHeadword = plainText(entry.headwordFull || entry.headword);
        const wordClass = entry.wordClass ? ` · ${plainText(entry.wordClass)}` : "";
        const lines = entry.translations.slice(0, 3).map((translation) =>
          `${plainText(translation.source)} → **${plainText(translation.target)}**`,
        );
        embed.addFields({
          name: truncate(`${fullHeadword}${wordClass}`, DICTIONARY_FIELD_NAME_LIMIT),
          value: truncate(lines.join("\n") || "No translations available.", DICTIONARY_FIELD_VALUE_LIMIT),
        });
      }

      return embed;
    });
}

export function plainText(input: string): string {
  const withBreaks = input.replace(/<br\s*\/?>/gi, "\n");
  const withoutTags = withBreaks.replace(/<[^>]*>/g, "");
  const decoded = decodeHtmlEntities(withoutTags)
    .replace(/\r/g, "")
    .replace(/[\t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
  return decoded.replace(/([\\`*_~|>{}\[\]()#+\-.!])/g, "\\$1");
}

function decodeHtmlEntities(input: string): string {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return input.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gi, (entity, code: string) => {
    if (code.startsWith("#x") || code.startsWith("#X")) {
      const value = Number.parseInt(code.slice(2), 16);
      return decodeCodePoint(value, entity);
    }
    if (code.startsWith("#")) {
      const value = Number.parseInt(code.slice(1), 10);
      return decodeCodePoint(value, entity);
    }
    return named[code.toLowerCase()] ?? entity;
  });
}

function decodeCodePoint(value: number, fallback: string): string {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff || (value >= 0xd800 && value <= 0xdfff)) {
    return fallback;
  }
  return String.fromCodePoint(value);
}

function truncate(value: string, limit: number): string {
  if (value.length <= limit) return value;
  return `${value.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}
