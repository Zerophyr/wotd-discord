import { REST, Routes } from "discord.js";
import { commandData } from "./commands.js";
import type { Config } from "./config.js";

export async function registerCommands(config: Config): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(config.discordToken);
  const route = config.discordGuildId
    ? Routes.applicationGuildCommands(config.discordClientId, config.discordGuildId)
    : Routes.applicationCommands(config.discordClientId);

  console.log(`Registering ${commandData.length} commands ${config.discordGuildId ? "for the configured server" : "globally"}...`);
  await rest.put(route, { body: commandData });
  console.log("Commands registered successfully.");
}
