import { bits, P } from "./discord.js";

const user = (name, description, required = true) => ({ type: 6, name, description, required });
const str = (name, description, required = false) => ({ type: 3, name, description, required });
const num = (name, description, min, max) => ({ type: 4, name, description, required: true, min_value: min, max_value: max });

export const COMMANDS = [
  {
    name: "setup",
    description: "Create Yoru AI roles, channels, rules, verify, and tickets.",
    dm_permission: false,
    default_member_permissions: bits(P.ADMIN),
  },
  {
    name: "lookup",
    description: "Staff lookup: account age, join date, IP, and country.",
    dm_permission: false,
    default_member_permissions: bits(P.MODERATE),
    options: [user("user", "Member")],
  },
  {
    name: "help",
    description: "List Ty Bot commands.",
    dm_permission: false,
  },
  {
    name: "mod",
    description: "Ban, kick, timeout, and warn.",
    dm_permission: false,
    default_member_permissions: bits(P.MODERATE),
    options: [
      sub("ban", "Ban a member", [user("user", "Member"), str("reason", "Reason"), { type: 4, name: "delete_days", description: "Delete 0-7 days of messages", min_value: 0, max_value: 7 }]),
      sub("unban", "Unban a user id", [str("user_id", "User ID", true), str("reason", "Reason")]),
      sub("kick", "Kick a member", [user("user", "Member"), str("reason", "Reason")]),
      sub("timeout", "Timeout a member", [user("user", "Member"), str("duration", "10m, 1h, 1d, or 7d", true), str("reason", "Reason")]),
      sub("untimeout", "Remove a timeout", [user("user", "Member"), str("reason", "Reason")]),
      sub("warn", "Warn a member", [user("user", "Member"), str("reason", "Reason", true)]),
      sub("warnings", "List warnings", [user("user", "Member")]),
      sub("clearwarns", "Clear warnings", [user("user", "Member")]),
    ],
  },
  {
    name: "server",
    description: "Channel tools, rules, and embeds.",
    dm_permission: false,
    default_member_permissions: bits(P.MANAGE_MESSAGES),
    options: [
      sub("purge", "Delete recent messages", [num("amount", "1 to 100", 1, 100)]),
      sub("lock", "Stop members sending here", []),
      sub("unlock", "Unlock this channel", []),
      sub("slowmode", "Set slowmode seconds", [num("seconds", "0 to 21600", 0, 21600)]),
      sub("nick", "Change a nickname", [user("user", "Member"), str("nickname", "Blank resets it")]),
      sub("role", "Add or remove a role", [
        { type: 3, name: "action", description: "add or remove", required: true, choices: [{ name: "add", value: "add" }, { name: "remove", value: "remove" }] },
        user("user", "Member"),
        { type: 8, name: "role", description: "Role", required: true },
      ]),
      sub("rules", "Post member rules", []),
      sub("staffrules", "Post Yoru AI staff rules", []),
      sub("embed", "Send a custom embed", [str("title", "Title", true), str("description", "Description", true), str("color", "Hex like d6ff4a")]),
      sub("info", "Server info", []),
      sub("userinfo", "User info", [user("user", "User", false)]),
    ],
  },
];

function sub(name, description, options) {
  const command = { type: 1, name, description };
  if (options.length) command.options = options;
  return command;
}

export const HELP = [
  "/setup — build the server",
  "/lookup @user — staff only. Account age, join date, saved IP, and country.",
  "/mod ban, kick, timeout, untimeout, unban, warn, warnings, clearwarns",
  "/server purge, lock, unlock, slowmode, nick, role, rules, staffrules, embed",
  "Verify and tickets use the buttons /setup posts.",
].join("\n");
