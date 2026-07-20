import { resolve } from "node:path";

export interface Config {
  discordToken: string;
  discordClientId: string;
  discordGuildId: string | undefined;
  channelId: string;
  postTime: string;
  timezone: string;
  databasePath: string;
}

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

function validateTime(value: string): string {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
    throw new Error("WOTD_POST_TIME must use 24-hour HH:mm format");
  }
  return value;
}

function validateTimezone(value: string): string {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: value }).format();
    return value;
  } catch {
    throw new Error(`Invalid WOTD_TIMEZONE: ${value}`);
  }
}

export function loadConfig(): Config {
  return {
    discordToken: required("DISCORD_TOKEN"),
    discordClientId: required("DISCORD_CLIENT_ID"),
    discordGuildId: process.env.DISCORD_GUILD_ID?.trim() || undefined,
    channelId: required("WOTD_CHANNEL_ID"),
    postTime: validateTime(process.env.WOTD_POST_TIME?.trim() || "10:00"),
    timezone: validateTimezone(process.env.WOTD_TIMEZONE?.trim() || "Europe/Berlin"),
    databasePath: resolve(process.env.DATABASE_PATH?.trim() || "./data/wotd.sqlite"),
  };
}
