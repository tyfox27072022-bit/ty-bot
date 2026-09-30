# Ty Bot

Discord bot for **Yoru AI**. Moderation, verify, tickets, staff rules, and a dashboard. It runs on Cloudflare Workers, so there is no always-on Node process.

Slash commands and buttons use Discord's interactions URL. Invite blocking, spam, and mass mentions are Discord AutoMod rules, which keep working even when the worker is idle.

## What it does

- `/setup` creates Owner, Staff, Yoru User, and Member, plus info, community, support, staff, voice, and ticket channels.
- New members can only see `#verify` until they press Verify or Yoru User.
- Tickets: Support, Report, and Purchase. Staff close them. Don't close a ticket before the issue is handled.
- `/mod` ban, kick, timeout, untimeout, unban, warn, warnings, clearwarns.
- `/server` purge, lock, unlock, slowmode, nick, role, rules, staffrules, embed.
- Member rules link to Discord's Terms of Service, Community Guidelines, and Privacy Policy.
- Staff rules are posted in `#staff-rules` and are staff-only.

## If Cloudflare says the build was skipped

This repo is a Worker, not a Pages site. The files are at the repository root, not in a `bot` folder.

1. Open **Workers & Pages**, then the **ty-bot** Worker. The Worker name must be exactly `ty-bot`.
2. Go to **Settings → Builds**.
3. Production branch: `main`.
4. Root directory: leave it empty. Delete `bot` if it is set.
5. Build command: leave it empty.
6. Deploy command: `npx wrangler deploy`.
7. **Build watch paths**: Includes `*`, Excludes empty. A path like `bot/*` skips every build because that folder is not in the repo.
8. Save, open **Deployments**, and choose **Retry build** on the latest commit.

Do not create this as a Pages project. Pages skips or ignores a Worker repo.

After a build succeeds:

1. Set secrets: `DISCORD_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APP_ID`, `DASHBOARD_KEY`.
2. Optional: create a KV namespace named `TY` and add its id under `kv_namespaces` in `wrangler.toml`.
3. In the Discord Developer Portal, set Interactions Endpoint URL to `https://ty-bot.<your-subdomain>.workers.dev/interactions`.
4. The bot is already in Yoru AI. Drag the Ty Bot role above Staff if you have not.

Do not commit the bot token.

## Permissions the invite needs

Administrator is the simple path because setup creates roles and channels. After setup you can drop it, but the bot still needs Ban, Kick, Timeout, Manage Roles, Manage Channels, Manage Messages, and Moderate Members, and its role must stay above the people it punishes.
