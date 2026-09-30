import { bits, discord, guildConfig, hasPerm, P } from "./discord.js";

export async function moderate(env, { guildId, actorId, action, userId, reason, duration, deleteDays }) {
  const why = reason || "No reason provided.";
  if (action === "unban") {
    await discord(env, `/guilds/${guildId}/bans/${userId}`, "DELETE");
    return `Unbanned <@${userId}>. ${why}`;
  }
  if (action === "warnings" || action === "clearwarns" || action === "warn") {
    return warns(env, guildId, userId, action, why, actorId);
  }

  const guild = await discord(env, `/guilds/${guildId}`);
  if (userId === guild.owner_id) throw new Error("You can't moderate the server owner.");
  if (userId === actorId) throw new Error("You can't moderate yourself.");

  const [roles, actor, target, me] = await Promise.all([
    discord(env, `/guilds/${guildId}/roles`),
    discord(env, `/guilds/${guildId}/members/${actorId}`),
    discord(env, `/guilds/${guildId}/members/${userId}`).catch(() => null),
    discord(env, "/users/@me"),
  ]);
  if (!target && action !== "ban") throw new Error("That user is not in this server.");
  if (target) {
    const actorTop = topRole(roles, actor.roles);
    const targetTop = topRole(roles, target.roles);
    const botMember = await discord(env, `/guilds/${guildId}/members/${me.id}`);
    const botTop = topRole(roles, botMember.roles);
    const actorPerms = permissionsFor(roles, actor.roles, guildId);
    if (actorId !== guild.owner_id && targetTop >= actorTop) {
      throw new Error("That member is equal to or above you.");
    }
    if (targetTop >= botTop) throw new Error("Move the Ty Bot role above that member.");
    if (action === "ban" && !hasPerm(actorPerms, P.BAN) && actorId !== guild.owner_id) {
      throw new Error("You need Ban Members.");
    }
  }

  if (action === "ban") {
    const seconds = Math.max(0, Math.min(7, Number(deleteDays) || 0)) * 86400;
    await discord(env, `/guilds/${guildId}/bans/${userId}`, "PUT", { delete_message_seconds: seconds });
    return `Banned <@${userId}>. ${why}`;
  }
  if (action === "kick") {
    await discord(env, `/guilds/${guildId}/members/${userId}`, "DELETE");
    return `Kicked <@${userId}>. ${why}`;
  }
  if (action === "timeout") {
    const ms = parseDuration(duration);
    if (!ms) throw new Error("Use a duration like 10m, 1h, 1d, or 7d.");
    const until = new Date(Date.now() + ms).toISOString();
    await discord(env, `/guilds/${guildId}/members/${userId}`, "PATCH", { communication_disabled_until: until });
    return `Timed out <@${userId}> for ${duration}. ${why}`;
  }
  if (action === "untimeout") {
    await discord(env, `/guilds/${guildId}/members/${userId}`, "PATCH", { communication_disabled_until: null });
    return `Timeout removed for <@${userId}>. ${why}`;
  }
  throw new Error("Unknown action.");
}

async function warns(env, guildId, userId, action, reason, actorId) {
  if (!env.TY) throw new Error("Add the TY KV binding before using warnings.");
  const key = `warns:${guildId}:${userId}`;
  const list = JSON.parse((await env.TY.get(key)) || "[]");
  if (action === "warnings") {
    if (!list.length) return `<@${userId}> has no warnings.`;
    return list.map((item, index) => `${index + 1}. ${item.reason} — <@${item.by}>`).join("\n");
  }
  if (action === "clearwarns") {
    await env.TY.put(key, "[]");
    return `Cleared warnings for <@${userId}>.`;
  }
  list.push({ reason, by: actorId, at: Date.now() });
  await env.TY.put(key, JSON.stringify(list));
  return `Warned <@${userId}>. ${reason} (${list.length} total)`;
}

function topRole(roles, ids) {
  return Math.max(0, ...roles.filter((role) => ids.includes(role.id)).map((role) => role.position));
}

function permissionsFor(roles, ids, guildId) {
  let value = 0n;
  for (const role of roles) {
    if (role.id === guildId || ids.includes(role.id)) value |= BigInt(role.permissions);
  }
  return value.toString();
}

export function parseDuration(input) {
  const match = String(input || "").trim().toLowerCase().match(/^(\d+)\s*(s|m|h|d)$/);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2];
  const ms = unit === "s" ? amount * 1000 : unit === "m" ? amount * 60000 : unit === "h" ? amount * 3600000 : amount * 86400000;
  if (ms < 1000 || ms > 28 * 86400000) return null;
  return ms;
}

export async function channelTools(env, interaction, sub, map) {
  const channelId = interaction.channel_id;
  const guildId = interaction.guild_id;
  if (sub === "purge") {
    if (!hasPerm(interaction.member.permissions, P.MANAGE_MESSAGES)) throw new Error("You need Manage Messages.");
    const amount = Math.max(1, Math.min(100, Number(map.amount) || 1));
    const messages = await discord(env, `/channels/${channelId}/messages?limit=${amount}`);
    const fresh = messages.filter((message) => Date.now() - Date.parse(message.timestamp) < 14 * 86400000).map((message) => message.id);
    if (fresh.length > 1) await discord(env, `/channels/${channelId}/messages/bulk-delete`, "POST", { messages: fresh });
    else if (fresh.length === 1) await discord(env, `/channels/${channelId}/messages/${fresh[0]}`, "DELETE");
    return `Deleted ${fresh.length} messages.`;
  }
  if (sub === "slowmode") {
    const seconds = Math.max(0, Math.min(21600, Number(map.seconds) || 0));
    await discord(env, `/channels/${channelId}`, "PATCH", { rate_limit_per_user: seconds });
    return `Slowmode set to ${seconds}s.`;
  }
  if (sub === "lock" || sub === "unlock") {
    const channel = await discord(env, `/channels/${channelId}`);
    const overwrites = channel.permission_overwrites || [];
    const next = overwrites.filter((item) => item.id !== guildId);
    if (sub === "lock") next.push({ id: guildId, type: 0, allow: bits(), deny: bits(P.SEND) });
    await discord(env, `/channels/${channelId}`, "PATCH", { permission_overwrites: next });
    return sub === "lock" ? "Channel locked." : "Channel unlocked for @everyone.";
  }
  if (sub === "nick") {
    const nick = map.nickname || null;
    await discord(env, `/guilds/${guildId}/members/${map.user}`, "PATCH", { nick });
    return "Nickname updated.";
  }
  if (sub === "role") {
    const path = `/guilds/${guildId}/members/${map.user}/roles/${map.role}`;
    await discord(env, path, map.action === "remove" ? "DELETE" : "PUT");
    return map.action === "remove" ? "Role removed." : "Role added.";
  }
  const config = await guildConfig(env, guildId);
  if (sub === "rules" || sub === "staffrules") {
    const { memberRulesEmbed, staffRulesEmbed } = await import("./rules.js");
    await discord(env, `/channels/${channelId}/messages`, "POST", {
      embeds: [sub === "rules" ? memberRulesEmbed() : staffRulesEmbed()],
    });
    if (sub === "staffrules" && config.channels?.["staff-rules"] && config.channels["staff-rules"] !== channelId) {
      return "Staff rules posted here. The staff-only copy also lives in #staff-rules.";
    }
    return "Posted.";
  }
  if (sub === "embed") {
    const color = Number.parseInt(String(map.color || "d6ff4a").replace("#", ""), 16) || 0xd6ff4a;
    await discord(env, `/channels/${channelId}/messages`, "POST", {
      embeds: [{ title: map.title, description: String(map.description || "").replaceAll("\\n", "\n"), color, footer: { text: "Ty Bot" } }],
    });
    return "Embed sent.";
  }
  if (sub === "info") {
    const guild = await discord(env, `/guilds/${guildId}?with_counts=true`);
    return `**${guild.name}**\nMembers: ${guild.approximate_member_count ?? "unknown"}\nOwner: <@${guild.owner_id}>`;
  }
  if (sub === "userinfo") {
    const userId = map.user || interaction.member.user.id;
    const user = await discord(env, `/users/${userId}`);
    return `**${user.username}**\nID: ${user.id}`;
  }
  throw new Error("Unknown server tool.");
}
