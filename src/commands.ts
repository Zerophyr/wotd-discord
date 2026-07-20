import { PermissionFlagsBits, SlashCommandBuilder } from "discord.js";

export const commandBuilders = [
  new SlashCommandBuilder()
    .setName("word")
    .setDescription("Look up a German or English word")
    .addStringOption((option) =>
      option
        .setName("query")
        .setDescription("A German word or English meaning")
        .setRequired(true)
        .setMaxLength(100),
    ),
  new SlashCommandBuilder()
    .setName("wotd")
    .setDescription("Manage the Word of the Day")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addSubcommand((subcommand) =>
      subcommand.setName("preview").setDescription("Preview the next scheduled word"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("post").setDescription("Post today's word now"),
    )
    .addSubcommand((subcommand) =>
      subcommand.setName("status").setDescription("Show today's status and words remaining"),
    ),
];

export const commandData = commandBuilders.map((command) => command.toJSON());
