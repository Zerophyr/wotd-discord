# DeutschDen Word of the Day bot

A small Discord bot that automatically posts a curated German word every day. It includes persistent no-repeat history, a public dictionary command, and moderator controls.

## Current features

- Daily post at a configurable time in `Europe/Berlin` (or another IANA timezone)
- Weekday category rotation: everyday German, verbs, slang, unique words, colloquialisms, false friends, and idioms
- SQLite history so restarts do not cause duplicate posts
- `/word query:<German or English>` lookup
- `/wotd preview`, `/wotd post`, and `/wotd status` for members with **Manage Server**
- 14 starter entries intended for development and formatting review
- Docker deployment with persistent database storage

## Discord setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and add a bot.
2. On **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes.
3. Give the bot these channel permissions: **View Channel**, **Send Messages**, and **Embed Links**.
4. Invite it to the server and copy the application ID, bot token, server ID, and target channel ID.

Keep the bot token private. Never commit `.env`.

## Local development

Node.js 22 or newer is required.

```powershell
npm install
Copy-Item .env.example .env
```

Fill in `.env`. Keep `DISCORD_GUILD_ID` during development so command updates appear immediately in that server.

Start the bot. It registers or updates its slash commands automatically before connecting:

```powershell
npm run dev
```

The development command watches the TypeScript source and restarts after changes.

Quality checks:

```powershell
npm test
npm run check
npm run build
```

## Docker / Coolify

For Docker Compose:

```powershell
docker compose up --build -d
```

In Coolify, create a **Docker Compose** resource from this Git repository and select `/compose.yaml`. Coolify discovers the editable variables from that file, builds the image, creates the persistent `wotd-data` volume, checks Discord connectivity, and starts the bot. No domain or public port is required because the bot makes an outbound Discord connection.

If `DISCORD_GUILD_ID` is omitted, commands are registered globally and Discord may take longer to show the update.

## Vocabulary and posting behavior

Starter vocabulary is in `src/seed-words.ts`. Existing rows are preserved when the bot restarts, while newly added seed words are inserted automatically. A word is never selected after it appears in `post_history`.

The scheduler checks twice per minute. If the bot starts after the configured posting time and nothing has been posted that local day, it catches up immediately. If the word pool is exhausted, it logs an error and does not repeat old words.

Before production use, expand and proofread the seed list. The included 14 entries are enough to exercise every category, not to operate a long-running daily channel.
