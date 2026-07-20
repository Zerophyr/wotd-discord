import { createBot } from "./bot.js";
import { registerCommands } from "./command-registration.js";
import { loadConfig } from "./config.js";
import { WordDatabase } from "./database.js";
import { HealthHeartbeat } from "./health.js";

const config = loadConfig();
const database = new WordDatabase(config.databasePath);
const { client, scheduler } = createBot(config, database);
const health = new HealthHeartbeat(client);

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`Received ${signal}; shutting down.`);
  health.stop();
  scheduler.stop();
  client.destroy();
  database.close();
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

try {
  await registerCommands(config);
  await client.login(config.discordToken);
  health.start();
} catch (error) {
  health.stop();
  database.close();
  throw error;
}
