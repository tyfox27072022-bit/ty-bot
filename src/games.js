import { bits, discord, guildConfig, hasPerm, P, saveConfig } from "./discord.js";

export const GAMES = [
  { key: "fortnite", name: "Fortnite", emoji: "🏗️", color: 0x9b6bff, steam: null, fortnite: true },
  { key: "rust", name: "Rust", emoji: "☢️", color: 0xce422b, steam: 252490 },
  { key: "cod", name: "COD", emoji: "🔫", color: 0x3d7a4a, steam: 1938090 },
  { key: "gtav", name: "GTA V", emoji: "🚗", color: 0x6db33f, steam: 271590 },
  { key: "gta6", name: "GTA 6", emoji: "🌃", color: 0xf0c14b, steam: null },
  { key: "apex", name: "Apex", emoji: "🔺", color: 0xda292a, steam: 1172470 },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const plain = (name) => String(name || "").toLowerCase().replace(/^[^a-z0-9]+/, "");

export async function ensureGameRoles(env, guildId) {
  const roles = await discord(env, `/guilds/${guildId}/roles`);
  const channels = await discord(env, `/guilds/${guildId}/channels`);
  const config = await guildConfig(env, guildId);
  const gameRoles = { ...(config.gameRoles || {}) };
  for (const game of GAMES) {
    let role = roles.find((item) => item.name.toLowerCase() === game.name.toLowerCase() && !item.managed);
    if (!role) {
      role = await discord(env, `/guilds/${guildId}/roles`, "POST", {
        name: game.name,
        color: game.color,
        hoist: false,
        mentionable: true,
        permissions: "0",
      });
      await wait(300);
    } else if (!role.mentionable) {
      await discord(env, `/guilds/${guildId}/roles/${role.id}`, "PATCH", { mentionable: true });
    }
    gameRoles[game.key] = role.id;
  }

  const info = channels.find((channel) => channel.type === 4 && plain(channel.name) === "info");
  const memberRoles = roles.filter((role) => ["member", "yoru user"].includes(role.name.toLowerCase()));
  const staffRoles = roles.filter((role) => ["owner", "head admin", "admin", "moderator", "support team", "staff", "youtube moderator"].includes(role.name.toLowerCase()));
  const react = bits(P.VIEW, P.HISTORY, P.ADD_REACT, P.EXT_EMOJI);
  const overwrites = [
    { id: guildId, type: 0, allow: bits(), deny: bits(P.VIEW) },
    ...memberRoles.map((role) => ({ id: role.id, type: 0, allow: react, deny: bits(P.SEND) })),
    ...staffRoles.map((role) => ({ id: role.id, type: 0, allow: bits(P.VIEW, P.SEND, P.HISTORY, P.ADD_REACT), deny: bits() })),
  ];
  let channel = channels.find((item) => plain(item.name) === "reaction-roles");
  if (!channel) {
    channel = await discord(env, `/guilds/${guildId}/channels`, "POST", {
      name: "🎯・reaction-roles",
      type: 0,
      parent_id: info?.id,
      topic: "React to get pinged for game news.",
      permission_overwrites: overwrites,
    });
  }

  let messageId = config.gamePanel?.messageId;
  if (config.gamePanel?.channelId !== channel.id) messageId = "";
  if (messageId) {
    try {
      await discord(env, `/channels/${channel.id}/messages/${messageId}`);
    } catch {
      messageId = "";
    }
  }
  if (!messageId) {
    const lines = GAMES.map((game) => `${game.emoji} ${game.name}`);
    const message = await discord(env, `/channels/${channel.id}/messages`, "POST", {
      content: `React to get pinged in announcements when that game has news. React again to remove the role.\n\n${lines.join("\n")}`,
    });
    messageId = message.id;
    for (const game of GAMES) {
      await discord(env, `/channels/${channel.id}/messages/${messageId}/reactions/${encodeURIComponent(game.emoji)}/@me`, "PUT");
      await wait(250);
    }
  }

  config.gameRoles = gameRoles;
  config.gamePanel = { channelId: channel.id, messageId };
  config.channels = { ...(config.channels || {}), announcements: config.channels?.announcements || channels.find((item) => plain(item.name) === "announcements")?.id };
  await saveConfig(env, guildId, config);
  return config;
}

export async function toggleGameRole(env, packet, add) {
  if (!packet.guild_id || packet.member?.user?.bot || packet.user_id === undefined) return;
  const config = await guildConfig(env, packet.guild_id);
  if (!config.gamePanel || packet.message_id !== config.gamePanel.messageId) return;
  const game = GAMES.find((item) => item.emoji === packet.emoji?.name);
  const roleId = game && config.gameRoles?.[game.key];
  if (!roleId) return;
  await discord(env, `/guilds/${packet.guild_id}/members/${packet.user_id}/roles/${roleId}`, add ? "PUT" : "DELETE");
}

export async function announceGame(env, interaction, key, text) {
  if (!hasPerm(interaction.member?.permissions, P.MANAGE_MESSAGES)) throw new Error("Staff only.");
  const game = GAMES.find((item) => item.key === key);
  if (!game) throw new Error("Pick a game.");
  const clean = String(text || "").trim();
  if (!clean) throw new Error("Write the update.");
  const config = await ensureGameRoles(env, interaction.guild_id);
  const roleId = config.gameRoles[game.key];
  const channelId = await announcementId(env, interaction.guild_id, config);
  await discord(env, `/channels/${channelId}/messages`, "POST", {
    content: `<@&${roleId}>\n${clean}`,
    allowed_mentions: { parse: [], roles: [roleId] },
  });
  return { content: `Posted in announcements and pinged ${game.name}.` };
}

export async function checkGameNews(env, guildId) {
  const config = await guildConfig(env, guildId);
  if (!config.gameRoles || !env.TY) return;
  const saved = JSON.parse((await env.TY.get(`gamenews:${guildId}`)) || "{}");
  const first = !saved.ready;
  const posts = [];
  for (const game of GAMES) {
    const item = await latestNews(game).catch(() => null);
    if (!item?.id) continue;
    if (saved[game.key] === item.id) continue;
    saved[game.key] = item.id;
    if (!first) posts.push({ game, item });
  }
  saved.ready = true;
  await env.TY.put(`gamenews:${guildId}`, JSON.stringify(saved));
  if (!posts.length) return;
  const channelId = await announcementId(env, guildId, config);
  for (const post of posts) {
    const roleId = config.gameRoles[post.game.key];
    if (!roleId) continue;
    const body = [post.item.title, post.item.body, post.item.url].filter(Boolean).join("\n");
    await discord(env, `/channels/${channelId}/messages`, "POST", {
      content: `<@&${roleId}>\n${body}`.slice(0, 1900),
      allowed_mentions: { parse: [], roles: [roleId] },
    });
    await wait(800);
  }
}

async function announcementId(env, guildId, config) {
  if (config.channels?.announcements) return config.channels.announcements;
  const channels = await discord(env, `/guilds/${guildId}/channels`);
  const found = channels.find((channel) => plain(channel.name) === "announcements");
  if (!found) throw new Error("Announcements channel is missing.");
  return found.id;
}

async function latestNews(game) {
  if (game.fortnite) {
    const data = await readJson("https://fortnite-api.com/v2/news/br");
    const motd = data?.data?.motds?.[0];
    if (!motd) return null;
    return { id: motd.id, title: motd.title, body: motd.body || "" };
  }
  if (!game.steam) return null;
  const data = await readJson(`https://api.steampowered.com/ISteamNews/GetNewsForApp/v2/?appid=${game.steam}&count=8&maxlength=280`);
  const item = (data?.appnews?.newsitems || []).find((news) => {
    if (news.feedname !== "steam_community_announcements") return false;
    const tags = news.tags || [];
    return !tags.some((tag) => /workshop|mod_reviewed|mod_require/i.test(tag));
  });
  if (!item) return null;
  const body = String(item.contents || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return { id: item.gid, title: item.title, body, url: item.url?.startsWith("http") ? item.url : "" };
}

async function readJson(url) {
  const response = await fetch(url, { headers: { "User-Agent": "TyBot" } });
  if (!response.ok) throw new Error(`${response.status}`);
  return response.json();
}
