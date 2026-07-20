import { EmbedBuilder } from "discord.js";
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
