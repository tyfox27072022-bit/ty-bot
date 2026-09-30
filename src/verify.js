import { discord, guildConfig } from "./discord.js";

const DISCORD_EPOCH = 1420070400000n;

export function accountCreated(userId) {
  return new Date(Number((BigInt(userId) >> 22n) + DISCORD_EPOCH));
}

export function altReasons(user, created, sameIpUsers) {
  const reasons = [];
  const ageDays = (Date.now() - created.getTime()) / 86400000;
  if (ageDays < 7) reasons.push("account is under 7 days old");
  else if (ageDays < 30) reasons.push("account is under 30 days old");
  if (!user?.avatar) reasons.push("no profile picture");
  const name = user?.username || "";
  if (/^[a-z0-9._]{0,3}\d{4,}$/i.test(name) || (name.match(/\d/g) || []).length >= 4 && name.replace(/\d/g, "").length <= 2) {
    reasons.push("username looks generated");
  }
  if (sameIpUsers.length) reasons.push(`same IP already used by ${sameIpUsers.map((id) => `<@${id}>`).join(", ")}`);
  return reasons;
}

export async function makeVerifyToken(secret, { guildId, userId, kind }) {
  const payload = toB64(JSON.stringify({ g: guildId, u: userId, k: kind, e: Date.now() + 15 * 60 * 1000 }));
  const sig = await hmac(secret, payload);
  return `${payload}.${sig}`;
}

export async function readVerifyToken(secret, token) {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig || (await hmac(secret, payload)) !== sig) throw new Error("This verify link is not valid.");
  const data = JSON.parse(fromB64(payload));
  if (!data?.g || !data?.u || data.e < Date.now()) throw new Error("This verify link expired. Press the button again.");
  return data;
}

export async function grantVerifyRoles(env, guildId, userId, kind) {
  const config = await guildConfig(env, guildId);
  if (!config.roles?.member) throw new Error("Run /setup first.");
  await discord(env, `/guilds/${guildId}/members/${userId}/roles/${config.roles.member}`, "PUT");
  if (kind === "yoru" && config.roles?.yoru) {
    await discord(env, `/guilds/${guildId}/members/${userId}/roles/${config.roles.yoru}`, "PUT");
  }
  return config;
}

export async function writeVerifyLog(env, { guildId, userId, kind, user, ip, geo, sameIpUsers }) {
  const created = accountCreated(userId);
  const reasons = altReasons(user, created, sameIpUsers);
  const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  const where = [geo.city, geo.region, geo.country].filter(Boolean).join(", ") || "Unknown";
  if (env.TY) {
    await env.TY.put(
      `vuser:${guildId}:${userId}`,
      JSON.stringify({ ip: ip || "", geo, reasons, kind, at: Date.now() }),
    );
  }
  const config = await guildConfig(env, guildId);
  const channelId = config.channels?.["mod-logs"];
  if (!channelId) return { reasons, logged: false };
  await discord(env, `/channels/${channelId}/messages`, "POST", {
    embeds: [
      {
        color: reasons.length ? 0xff5a36 : 0xd6ff4a,
        title: "Verification",
        description: reasons.length ? "Possible alt. This is a guess, not proof." : "No strong alt signs.",
        fields: [
          { name: "Discord", value: `<@${userId}>\n\`${userId}\`\n${user?.global_name || user?.username || "Unknown"}`, inline: true },
          { name: "Account created", value: `<t:${Math.floor(created.getTime() / 1000)}:F>\n${days} days ago`, inline: true },
          { name: "Choice", value: kind === "yoru" ? "Yoru User" : "Member", inline: true },
          { name: "IP", value: ip || "Unknown", inline: true },
          { name: "Location", value: where, inline: true },
          { name: "Network", value: geo.org || "Unknown", inline: true },
          { name: "Alt check", value: reasons.length ? reasons.join("\n") : "No strong signs", inline: false },
        ],
        footer: { text: "Ty Bot · staff only" },
      },
    ],
  });
  return { reasons, logged: true };
}

export async function lookupEmbed(env, guildId, userId) {
  const user = await discord(env, `/users/${userId}`);
  let member = null;
  try {
    member = await discord(env, `/guilds/${guildId}/members/${userId}`);
  } catch {
    member = null;
  }
  const memberRoles = member?.roles || [];
  let exemptId = (await guildConfig(env, guildId)).roles?.nolookup;
  if (!exemptId) {
    const roles = await discord(env, `/guilds/${guildId}/roles`);
    exemptId = roles.find((role) => role.name === "No Lookup" && !role.managed)?.id;
  }
  if (exemptId && memberRoles.includes(exemptId)) {
    return { content: "This person has No Lookup. Ty Bot will not show their info." };
  }
  const created = accountCreated(userId);
  const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
  const stored = env.TY ? JSON.parse((await env.TY.get(`vuser:${guildId}:${userId}`)) || "null") : null;
  const recordedIp = stored?.ip && !stored.ip.startsWith("Discord did not") ? stored.ip : "";
  const country = stored?.geo?.country || "";
  const where = [stored?.geo?.city, stored?.geo?.region, country].filter(Boolean).join(", ");
  const joined = member?.joined_at
    ? `<t:${Math.floor(new Date(member.joined_at).getTime() / 1000)}:F>`
    : "Not in this server";
  return {
    embeds: [
      {
        color: stored?.reasons?.length ? 0xff5a36 : 0xd6ff4a,
        title: user.global_name || user.username,
        thumbnail: user.avatar ? { url: `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128` } : undefined,
        fields: [
          { name: "Discord ID", value: `\`${user.id}\``, inline: true },
          { name: "Account created", value: `<t:${Math.floor(created.getTime() / 1000)}:F>\n${days} days ago`, inline: true },
          { name: "Joined server", value: joined, inline: true },
          { name: "IP", value: recordedIp || "Not recorded yet", inline: true },
          { name: "Country", value: country || "Not recorded yet", inline: true },
          { name: "Location", value: where || "Not recorded yet", inline: true },
          { name: "Alt check", value: stored?.reasons?.length ? stored.reasons.join("\n") : "No saved check yet", inline: false },
        ],
        footer: { text: "Ty Bot · staff only. IP and country come from the verify link." },
      },
    ],
  };
}

export async function rememberIp(env, guildId, ip, userId) {
  if (!env.TY || !ip) return [];
  const key = `vip:${guildId}:${ip}`;
  const prior = JSON.parse((await env.TY.get(key)) || "[]");
  const others = prior.filter((id) => id !== userId);
  const next = [...new Set([...prior, userId])].slice(-20);
  await env.TY.put(key, JSON.stringify(next));
  return others;
}

export function geoFromRequest(request) {
  const cf = request.cf || {};
  return {
    city: cf.city || "",
    region: cf.region || "",
    country: cf.country || "",
    org: cf.asOrganization || "",
  };
}

async function hmac(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return toB64(String.fromCharCode(...new Uint8Array(raw)));
}

function toB64(value) {
  return btoa(value).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromB64(value) {
  const pad = value + "=".repeat((4 - (value.length % 4)) % 4);
  return atob(pad.replaceAll("-", "+").replaceAll("_", "/"));
}
