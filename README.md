# Roblox Community Discord Bot

A single Discord bot for a Roblox scripting/community server.

## Included

- `/setup` builds the starter server layout
- XP + levels
- Level reward roles
- XP leaderboard
- Automatic spam protection
- Mass-mention protection
- Suspicious shortened-link filtering
- Warnings
- Timeouts
- Kicks and bans
- Message purge
- Private support tickets
- Verification button
- Moderation logs
- Script-key management for keys belonging to your own scripts
- `/ping`, `/rank`, `/leaderboard`, `/warn`, `/timeout`, `/kick`, `/ban`, `/ticket`, `/key`, `/purge`

## Environment variables

Set these in your host:

- `DISCORD_TOKEN` — your bot token
- `CLIENT_ID` — your Discord application's Application ID

Never commit your bot token to GitHub.

## Discord setup

Invite the bot to your server with the permissions it needs to:

- Manage Channels
- Manage Roles
- Manage Messages
- Moderate Members
- Kick Members
- Ban Members
- View Audit Log
- Send Messages
- Embed Links
- Read Message History

The bot's highest role must be above roles it needs to assign or moderate.

For the XP system, enable the **Message Content Intent** in the Discord Developer Portal.

After the bot is online, run:

`/setup`

The bot will create INFO, COMMUNITY, SUPPORT and SCRIPTS sections plus the basic channels and roles.

## Hosting

The bot needs a host that keeps a Node process running. Render supports Node services, but its current free offering does not include Background Workers, so a continuously running Discord bot may require a paid worker/service. See Render's current service documentation before choosing a plan.

## Data

The first version stores XP, warnings and script-key records in `data.json`. The file is intentionally ignored by Git.

For production use, move the data layer to a persistent database or persistent disk so a host restart/deploy cannot wipe it.

## Script keys

The key system is for keys for scripts you own or are authorized to distribute. It does not bypass or defeat another developer's key system.

Keys are stored as SHA-256 hashes rather than plaintext in the database file.

## Commands

### General
- `/ping`
- `/rank [user]`
- `/leaderboard`
- `/ticket`

### Moderation
- `/warn user reason`
- `/timeout user minutes reason`
- `/kick user reason`
- `/ban user reason`
- `/purge amount`

### Setup
- `/setup`

### Keys
- `/key create [note]`
- `/key check key`
- `/key revoke key`
