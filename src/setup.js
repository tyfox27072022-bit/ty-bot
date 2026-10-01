import { bits, discord, guildConfig, hasPerm, P, saveConfig } from "./discord.js";
import { memberRulesEmbed, staffRulesEmbed } from "./rules.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const ROLES = [
  {
    key: "owner",
    name: "Owner",
    color: 0xc8a24a,
    hoist: true,
    permissions: bits(P.ADMIN),
  },
  {
    key: "staff",
    name: "Staff",
    color: 0xff5a36,
    hoist: true,
    permissions: bits(P.KICK, P.BAN, P.MODERATE, P.MANAGE_MESSAGES, P.NICK, P.MUTE, P.DEAFEN, P.MOVE, P.AUDIT, P.THREADS),
  },
  {
    key: "yoru",
    name: "Yoru User",
    color: 0xd6ff4a,
    hoist: true,
    permissions: "0",
  },
  {
    key: "member",
    name: "Member",
    color: 0x9b968c,
    hoist: true,
    permissions: "0",
  },
];

export async function runSetup(env, guildId) {
  const me = await discord(env, "/users/@me");
  const existingRoles = await discord(env, `/guilds/${guildId}/roles`);
  const roles = {};
  for (const role of ROLES) {
    let found = existingRoles.find((item) => item.name === role.name && item.id !== guildId);
    if (!found) {
      found = await discord(env, `/guilds/${guildId}/roles`, "POST", {
        name: role.name,
        color: role.color,
        hoist: role.hoist,
        mentionable: role.key === "staff",
        permissions: role.permissions,
      });
      await wait(300);
    }
    roles[role.key] = found.id;
  }

  const existingChannels = await discord(env, `/guilds/${guildId}/channels`);
  const ids = {};

  async function category(name, overwrites) {
    let found = existingChannels.find((channel) => plain(channel.name) === plain(name) && channel.type === 4);
    if (!found) {
      found = await discord(env, `/guilds/${guildId}/channels`, "POST", {
        name,
        type: 4,
        permission_overwrites: overwrites,
      });
      existingChannels.push(found);
      await wait(400);
    }
    return found.id;
  }

  async function channel(name, parent, type, topic, overwrites) {
    let found = existingChannels.find((item) => plain(item.name) === plain(name) && item.parent_id === parent);
    if (!found) {
      found = await discord(env, `/guilds/${guildId}/channels`, "POST", {
        name,
        type,
        parent_id: parent,
        topic,
        permission_overwrites: overwrites,
      });
      existingChannels.push(found);
      await wait(400);
    }
    ids[name] = found.id;
    return found.id;
  }

  const everyoneDeny = ow(guildId, bits(), bits(P.VIEW));
  const staffAllow = ow(roles.staff, bits(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_MESSAGES, P.CONNECT, P.SPEAK), bits());
  const ownerAllow = ow(roles.owner, bits(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_CHANNELS, P.CONNECT, P.SPEAK), bits());
  const botAllow = ow(me.id, bits(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_CHANNELS, P.MANAGE_MESSAGES, P.EMBED, P.ATTACH, P.MANAGE_ROLES), bits(), 1);
  const memberRead = ow(roles.member, bits(P.VIEW, P.HISTORY), bits(P.SEND));
  const yoruRead = ow(roles.yoru, bits(P.VIEW, P.HISTORY), bits(P.SEND));
  const memberTalk = ow(roles.member, bits(P.VIEW, P.SEND, P.HISTORY, P.ATTACH, P.EMBED, P.ADD_REACT, P.EXT_EMOJI), bits());
  const yoruTalk = ow(roles.yoru, bits(P.VIEW, P.SEND, P.HISTORY, P.ATTACH, P.EMBED, P.ADD_REACT, P.EXT_EMOJI), bits());

  const info = await category("INFO", [everyoneDeny, memberRead, yoruRead, staffAllow, ownerAllow, botAllow]);
  const community = await category("COMMUNITY", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  const support = await category("SUPPORT", [everyoneDeny, memberRead, yoruRead, staffAllow, ownerAllow, botAllow]);
  const staffCat = await category("STAFF", [everyoneDeny, ow(roles.member, bits(), bits(P.VIEW)), ow(roles.yoru, bits(), bits(P.VIEW)), staffAllow, ownerAllow, botAllow]);
  const voice = await category("VOICE", [everyoneDeny, ow(roles.member, bits(P.VIEW, P.CONNECT, P.SPEAK), bits()), ow(roles.yoru, bits(P.VIEW, P.CONNECT, P.SPEAK), bits()), staffAllow, ownerAllow, botAllow]);
  const tickets = await category("TICKETS", [everyoneDeny, staffAllow, ownerAllow, botAllow]);

  const verifyOverwrites = [
    ow(guildId, bits(P.VIEW, P.HISTORY), bits(P.SEND, P.ADD_REACT)),
    ow(roles.member, bits(P.VIEW, P.HISTORY), bits(P.SEND)),
    ow(roles.yoru, bits(P.VIEW, P.HISTORY), bits(P.SEND)),
    staffAllow,
    ownerAllow,
    botAllow,
  ];

  await channel("welcome", info, 0, "New members start here.", [everyoneDeny, memberRead, yoruRead, staffAllow, ownerAllow, botAllow]);
  await channel("rules", info, 0, "Server rules and Discord policies.", verifyOverwrites);
  await channel("announcements", info, 0, "Official announcements.", [everyoneDeny, memberRead, yoruRead, staffAllow, ownerAllow, botAllow]);
  await channel("🎯・reaction-roles", info, 0, "React to get pinged for game news.", [
    everyoneDeny,
    ow(roles.member, bits(P.VIEW, P.HISTORY, P.ADD_REACT, P.EXT_EMOJI), bits(P.SEND)),
    ow(roles.yoru, bits(P.VIEW, P.HISTORY, P.ADD_REACT, P.EXT_EMOJI), bits(P.SEND)),
    staffAllow,
    ownerAllow,
    botAllow,
  ]);
  await channel("verify", info, 0, "Verify to unlock the server.", verifyOverwrites);
  await channel("general", community, 0, "Main chat.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("media", community, 0, "Images, clips, and links.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("off-topic", community, 0, "Anything else.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("create-a-ticket", support, 0, "Open a private ticket.", [everyoneDeny, memberRead, yoruRead, staffAllow, ownerAllow, botAllow]);
  await channel("💡・suggestions", support, 0, "Post an idea. A tick from the owner adds it.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("staff-chat", staffCat, 0, "Staff discussion.", [everyoneDeny, staffAllow, ownerAllow, botAllow]);
  await channel("staff-rules", staffCat, 0, "Yoru AI staff rules.", [
    everyoneDeny,
    ow(roles.staff, bits(P.VIEW, P.HISTORY), bits(P.SEND)),
    ownerAllow,
    botAllow,
  ]);
  await channel("mod-logs", staffCat, 0, "Moderation and ticket logs.", [everyoneDeny, staffAllow, ownerAllow, botAllow]);
  await channel("General", voice, 2, undefined, [everyoneDeny, ow(roles.member, bits(P.VIEW, P.CONNECT, P.SPEAK), bits()), ow(roles.yoru, bits(P.VIEW, P.CONNECT, P.SPEAK), bits()), staffAllow, ownerAllow, botAllow]);
  await channel("Staff Voice", voice, 2, undefined, [everyoneDeny, staffAllow, ownerAllow, botAllow]);

  const games = await category("🎮 GAME HUB", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("🏗️・fortnite", games, 0, "Fortnite talk.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("☢️・rust", games, 0, "Rust talk.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("🔫・cod", games, 0, "Call of Duty talk.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("🚗・gta-v", games, 0, "GTA V talk.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("🌃・gta-6", games, 0, "GTA 6 talk.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);
  await channel("🔺・apex", games, 0, "Apex Legends talk.", [everyoneDeny, memberTalk, yoruTalk, staffAllow, ownerAllow, botAllow]);

  const config = { roles, channels: ids, ticketCategory: tickets };
  await saveConfig(env, guildId, config);

  await postOnce(env, ids.verify, {
    embeds: [
      {
        color: 0xd6ff4a,
        title: "Enter Yoru Lounge",
        description:
          "Press **Verify**. Ty Bot will open a private site. Press Verify there to unlock the server.",
        footer: { text: "Ty Bot" },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 3, label: "Verify", custom_id: "verify_member" },
        ],
      },
    ],
  });

  await postOnce(env, ids["create-a-ticket"], {
    embeds: [
      {
        color: 0xd6ff4a,
        title: "Need staff?",
        description: "Open a private ticket. Purchase questions belong here, not in DMs.",
        footer: { text: "Ty Bot" },
      },
    ],
    components: [
      {
        type: 1,
        components: [
          { type: 2, style: 1, label: "Support", custom_id: "ticket_support" },
          { type: 2, style: 4, label: "Report", custom_id: "ticket_report" },
          { type: 2, style: 2, label: "Purchase", custom_id: "ticket_purchase" },
        ],
      },
    ],
  });

  await postOnce(env, ids.rules, { embeds: [memberRulesEmbed()] });
  await postOnce(env, ids["staff-rules"], { embeds: [staffRulesEmbed()] });

  const automodNotes = await syncAutomod(env, guildId);
  try {
    await discord(env, `/guilds/${guildId}/auto-moderation/rules`, "POST", {
      name: "Ty Bot mentions",
      event_type: 1,
      trigger_type: 5,
      trigger_metadata: { mention_total_limit: 6, mention_raid_protection_enabled: true },
      actions: [{ type: 1 }, { type: 3, metadata: { duration_seconds: 300 } }],
      enabled: true,
    });
  } catch (error) {
    automodNotes.push(`mentions: ${error.message}`);
  }
  try {
    await discord(env, `/guilds/${guildId}/auto-moderation/rules`, "POST", {
      name: "Ty Bot spam",
      event_type: 1,
      trigger_type: 3,
      actions: [{ type: 1 }, { type: 3, metadata: { duration_seconds: 60 } }],
      enabled: true,
    });
  } catch (error) {
    automodNotes.push(`spam: ${error.message}`);
  }

  return { roles, channels: ids, automodNotes, ...(await lockUnverified(env, guildId)) };
}

export async function syncAutomod(env, guildId) {
  const roles = await discord(env, `/guilds/${guildId}/roles`);
  const exempt = roles.filter((role) => ["owner", "head admin", "admin", "staff"].includes(role.name.toLowerCase())).map((role) => role.id);
  const existing = await discord(env, `/guilds/${guildId}/auto-moderation/rules`);
  const rules = [
    {
      name: "Ty Bot links",
      event_type: 1,
      trigger_type: 1,
      trigger_metadata: { keyword_filter: ["*http://*", "*https://*"], regex_patterns: [] },
      actions: [{ type: 1, metadata: { custom_message: "Links are not allowed here." } }],
      enabled: true,
      exempt_roles: exempt,
    },
    {
      name: "Ty Bot invites",
      event_type: 1,
      trigger_type: 1,
      trigger_metadata: { keyword_filter: ["*discord.gg*", "*discord.com/invite*", "*discordapp.com/invite*"], regex_patterns: [] },
      actions: [{ type: 1, metadata: { custom_message: "Discord invites are not allowed." } }],
      enabled: true,
      exempt_roles: exempt,
    },
    {
      name: "Ty Bot banned words",
      event_type: 1,
      trigger_type: 1,
      trigger_metadata: {
        keyword_filter: ["cheat", "cheats", "cheating", "cheater", "aimbot", "wallhack", "hack", "hacks", "hacking", "hacker"],
        regex_patterns: [],
      },
      actions: [{ type: 1, metadata: { custom_message: "That word is not allowed." } }],
      enabled: true,
      exempt_roles: exempt,
    },
    {
      name: "Ty Bot slurs",
      event_type: 1,
      trigger_type: 4,
      trigger_metadata: { presets: [1, 3] },
      actions: [{ type: 1, metadata: { custom_message: "That language is not allowed." } }],
      enabled: true,
      exempt_roles: exempt,
    },
  ];
  const notes = [];
  for (const rule of rules) {
    const found = existing.find((item) => item.name === rule.name);
    try {
      if (found) await discord(env, `/guilds/${guildId}/auto-moderation/rules/${found.id}`, "PATCH", rule);
      else await discord(env, `/guilds/${guildId}/auto-moderation/rules`, "POST", rule);
    } catch (error) {
      notes.push(`${rule.name}: ${error.message}`);
    }
  }
  return notes;
}

export async function ensureNoLookupRole(env, guildId) {
  const roles = await discord(env, `/guilds/${guildId}/roles`);
  let role = roles.find((item) => item.name === "No Lookup" && !item.managed);
  if (!role) {
    role = await discord(env, `/guilds/${guildId}/roles`, "POST", {
      name: "No Lookup",
      color: 0x6b7280,
      hoist: false,
      mentionable: false,
      permissions: "0",
    });
  }
  const config = await guildConfig(env, guildId);
  config.roles = { ...(config.roles || {}), nolookup: role.id };
  await saveConfig(env, guildId, config);
  return role.id;
}

function ow(id, allow, deny, type = 0) {
  return { id, type, allow, deny };
}

const STAFF_NAMES = new Set(["owner", "head admin", "admin", "moderator", "support team", "staff", "youtube moderator"]);
const ADMIN_NAMES = new Set(["owner", "head admin", "admin"]);
const OPEN_NAMES = new Set(["rules", "verify"]);

export async function lockUnverified(env, guildId) {
  const roles = await discord(env, `/guilds/${guildId}/roles`);
  const everyone = roles.find((role) => role.id === guildId);
  const view = P.VIEW;
  const nextEveryone = (BigInt(everyone.permissions) & ~view).toString();
  if (nextEveryone !== everyone.permissions) {
    await discord(env, `/guilds/${guildId}/roles/${guildId}`, "PATCH", { permissions: nextEveryone });
  }

  const memberIds = roles.filter((role) => ["member", "yoru user"].includes(role.name.toLowerCase())).map((role) => role.id);
  const staffIds = roles.filter((role) => STAFF_NAMES.has(role.name.toLowerCase())).map((role) => role.id);
  const channels = await discord(env, `/guilds/${guildId}/channels`);
  const byId = new Map(channels.map((channel) => [channel.id, channel]));
  let updated = 0;

  for (const channel of channels) {
    const parent = byId.get(channel.parent_id);
    const label = plain(channel.name);
    const parentName = plain(parent?.name);
    const staffOnly =
      label.includes("staff") ||
      label.includes("mod-log") ||
      label.startsWith("ticket-") ||
      ["staff", "tickets"].includes(parentName) ||
      ["staff", "tickets"].includes(label);
    const open = OPEN_NAMES.has(label) && !staffOnly;
    let overwrites = [...(channel.permission_overwrites || [])];
    overwrites = setOverwrite(
      overwrites,
      guildId,
      open ? bits(P.VIEW, P.HISTORY) : bits(),
      open ? bits(P.SEND, P.ADD_REACT) : bits(P.VIEW),
    );
    for (const roleId of memberIds) {
      const voice = channel.type === 2 || channel.type === 13;
      overwrites = setOverwrite(
        overwrites,
        roleId,
        staffOnly ? bits() : bits(P.VIEW, P.HISTORY, ...(voice ? [P.CONNECT, P.SPEAK] : [])),
        staffOnly ? bits(P.VIEW) : bits(),
      );
    }
    const logsOnly = plain(channel.name).includes("mod-log");
    for (const roleId of staffIds) {
      const role = roles.find((item) => item.id === roleId);
      const admin = ADMIN_NAMES.has(role?.name?.toLowerCase());
      overwrites = setOverwrite(
        overwrites,
        roleId,
        logsOnly && !admin ? bits() : bits(P.VIEW, P.HISTORY, P.SEND, P.CONNECT, P.SPEAK),
        logsOnly && !admin ? bits(P.VIEW) : bits(),
      );
    }
    await discord(env, `/channels/${channel.id}`, "PATCH", { permission_overwrites: overwrites });
    updated += 1;
    await wait(350);
  }
  return { lockedChannels: updated };
}

function plain(name) {
  return String(name || "").toLowerCase().replace(/^[^a-z0-9]+/, "");
}

function setOverwrite(overwrites, id, allow, deny) {
  return [...overwrites.filter((item) => item.id !== id), { id, type: 0, allow, deny }];
}

async function postOnce(env, channelId, body) {
  const messages = await discord(env, `/channels/${channelId}/messages?limit=8`);
  if (messages.some((message) => message.author?.bot && (message.embeds?.length || message.components?.length))) return;
  await discord(env, `/channels/${channelId}/messages`, "POST", body);
}

export async function openTicket(env, interaction, kind) {
  const guildId = interaction.guild_id;
  const userId = interaction.member.user.id;
  const config = await guildConfig(env, guildId);
  if (!config.ticketCategory || !config.roles?.staff) {
    throw new Error("Run /setup first.");
  }
  const channels = await discord(env, `/guilds/${guildId}/channels`);
  const existing = channels.find((channel) => channel.topic === `ticket:${userId}` && channel.parent_id === config.ticketCategory);
  if (existing) return { already: existing.id };

  const countKey = `ticket-count:${guildId}`;
  let count = 1;
  if (env.TY) {
    count = Number(await env.TY.get(countKey) || "0") + 1;
    await env.TY.put(countKey, String(count));
  }
  const name = `🎫・ticket-${String(count).padStart(4, "0")}`;
  const channel = await discord(env, `/guilds/${guildId}/channels`, "POST", {
    name,
    type: 0,
    parent_id: config.ticketCategory,
    topic: `ticket:${userId}`,
    permission_overwrites: [
      ow(guildId, bits(), bits(P.VIEW)),
      ow(userId, bits(P.VIEW, P.SEND, P.HISTORY, P.ATTACH), bits(), 1),
      ow(config.roles.staff, bits(P.VIEW, P.SEND, P.HISTORY, P.MANAGE_MESSAGES), bits()),
      config.roles.owner ? ow(config.roles.owner, bits(P.VIEW, P.SEND, P.MANAGE_CHANNELS), bits()) : null,
    ].filter(Boolean),
  });
  await discord(env, `/channels/${channel.id}/messages`, "POST", {
    content: `<@${userId}> <@&${config.roles.staff}>`,
    embeds: [
      {
        color: 0xd6ff4a,
        title: `Ticket · ${kind}`,
        description: "Tell staff what you need. Staff should not close this until the issue is actually handled.",
        footer: { text: "Ty Bot" },
      },
    ],
    components: [{ type: 1, components: [{ type: 2, style: 4, label: "Close ticket", custom_id: "ticket_close" }] }],
  });
  return { created: channel.id };
}

export async function closeTicket(env, interaction) {
  const channel = await discord(env, `/channels/${interaction.channel_id}`);
  if (!channel.topic?.startsWith("ticket:")) throw new Error("This is not a ticket channel.");
  const config = await guildConfig(env, interaction.guild_id);
  const roles = interaction.member?.roles || [];
  const staff =
    hasPerm(interaction.member?.permissions, P.MODERATE) ||
    roles.includes(config.roles?.staff) ||
    roles.includes(config.roles?.owner);
  if (!staff) throw new Error("Only staff can close a ticket.");
  await discord(env, `/channels/${channel.id}`, "DELETE");
}
