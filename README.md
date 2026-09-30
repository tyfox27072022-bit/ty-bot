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

## Cloudflare

1. Create a KV namespace and put its id in `wrangler.toml` where it says `REPLACE_WITH_KV_NAMESPACE_ID`. Binding name must stay `TY`.
2. Deploy this folder as a Worker.
3. Set secrets: `DISCORD_TOKEN`, `DISCORD_PUBLIC_KEY`, `DISCORD_APP_ID`, `DASHBOARD_KEY`.
4. In the Discord Developer Portal, set Interactions Endpoint URL to `https://<your-worker>.workers.dev/interactions`.
5. Invite the bot with Administrator. Drag the Ty Bot role above Staff.
6. Open the worker URL, sign in with `DASHBOARD_KEY`, choose the server, Sync commands, then Run setup.
7. Upload the Ty Bot portrait as the application avatar.

Do not commit the bot token.

## Permissions the invite needs

Administrator is the simple path because setup creates roles and channels. After setup you can drop it, but the bot still needs Ban, Kick, Timeout, Manage Roles, Manage Channels, Manage Messages, and Moderate Members, and its role must stay above the people it punishes.
