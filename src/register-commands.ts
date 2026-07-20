import { registerCommands } from "./command-registration.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
await registerCommands(config);
