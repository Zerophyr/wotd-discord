# DeutschDen Word of the Day bot

A small Discord bot that automatically posts a curated German word every day. It includes persistent no-repeat history, a public dictionary command, and moderator controls.

## Current features

- Daily post at a configurable time in `Europe/Berlin` (or another IANA timezone)
- Weekday category rotation: everyday German, verbs, slang, unique words, colloquialisms, false friends, and idioms
- SQLite history so restarts do not cause duplicate posts
- PONS-backed `/word` German↔English lookup in every permitted channel
- On-demand SQLite dictionary cache so repeated lookups do not consume API quota
- `/wotd preview`, `/wotd post`, and `/wotd status` for members with **Manage Server**
- 70 curated entries: ten words in each weekday category
- Docker deployment with persistent database storage

## Discord setup

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and add a bot.
2. On **OAuth2 → URL Generator**, select the `bot` and `applications.commands` scopes.
3. Give the bot these channel permissions: **View Channel**, **Send Messages**, and **Embed Links**.
4. Invite it to the server.

Configure these environment variables:

| Variable | Required | Value |
|---|---:|---|
| `DISCORD_TOKEN` | Yes | The bot token from **Bot → Reset Token** in the Developer Portal |
| `DISCORD_CLIENT_ID` | Yes | The application ID from **General Information** |
| `PONS_API_SECRET` | Yes | The secret issued for your [PONS Dictionary API](https://en.pons.com/p/online-dictionary/developers/api) account |
| `WOTD_CHANNEL_ID` | Yes | The ID of the Discord channel that should receive the daily post |
| `DISCORD_GUILD_ID` | No | The server ID; set it for immediate server-scoped command registration, or leave it empty for global commands |
| `WOTD_POST_TIME` | No | Posting time in `HH:mm` format; defaults to `10:00` |
| `WOTD_TIMEZONE` | No | IANA timezone; defaults to `Europe/Berlin` |

To copy server and channel IDs, enable **Developer Mode** under Discord's **User Settings → Advanced**, then right-click the server or channel and select **Copy ID**.

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

In Coolify, create a **Docker Compose** resource from this Git repository and select `/compose.yaml`. Before deploying, open **Environment Variables** and enter values for `DISCORD_TOKEN`, `DISCORD_CLIENT_ID`, `PONS_API_SECRET`, and `WOTD_CHANNEL_ID`. Coolify marks these required variables in red while they are empty. `DISCORD_GUILD_ID` is optional.

Coolify then builds the image, creates the persistent `wotd-data` volume, checks Discord connectivity, and starts the bot. No domain or public port is required because the bot makes an outbound Discord connection.

If `DISCORD_GUILD_ID` is omitted, commands are registered globally and Discord may take longer to show the update.

The current deployment manages one Word-of-the-Day channel. The bot may be invited to other servers, but scheduled posting still targets the single channel configured by `WOTD_CHANNEL_ID`. Supporting independently configured scheduled channels in multiple servers would require per-server settings in SQLite and a Discord setup command such as `/wotd configure`.

## Dictionary lookup

`/word` uses the PONS German–English dictionary and responds publicly in the channel where the command is invoked. It is not restricted to `WOTD_CHANNEL_ID`; Discord channel permissions determine where members can use it.

```text
/word query:Haus
/word query:gift direction:English → German
/word query:Feierabend refresh:True
```

Automatic direction can show German→English and English→German results when a spelling exists in both languages. The optional direction narrows the response. `refresh` requires **Manage Server**.

Only words requested by users are sent to PONS. Successful normalized results are retained in SQLite indefinitely and reused across restarts. A failed no-result lookup is cached for 24 hours. PONS currently advertises a free allowance of 1,000 reference queries per month; cached lookups do not consume another query.

## Vocabulary and posting behavior

Starter vocabulary is in `src/seed-words.ts`. Existing rows are preserved when the bot restarts, while newly added seed words are inserted automatically. A word is never selected after it appears in `post_history`.

The scheduler checks twice per minute. If the bot starts after the configured posting time and nothing has been posted that local day, it catches up immediately. If the word pool is exhausted, it logs an error and does not repeat old words.

The included 70 entries provide ten weeks of unique daily posts. Continue expanding and proofreading the pool before those ten weeks elapse; exhausted words are never repeated automatically.
