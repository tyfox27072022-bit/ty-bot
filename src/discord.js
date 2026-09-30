export const P = {
  KICK: 1n << 1n,
  BAN: 1n << 2n,
  ADMIN: 1n << 3n,
  MANAGE_CHANNELS: 1n << 4n,
  MANAGE_GUILD: 1n << 5n,
  ADD_REACT: 1n << 6n,
  AUDIT: 1n << 7n,
  VIEW: 1n << 10n,
  SEND: 1n << 11n,
  MANAGE_MESSAGES: 1n << 13n,
  EMBED: 1n << 14n,
  ATTACH: 1n << 15n,
  HISTORY: 1n << 16n,
  EXT_EMOJI: 1n << 18n,
  CONNECT: 1n << 20n,
  SPEAK: 1n << 21n,
  MUTE: 1n << 22n,
  DEAFEN: 1n << 23n,
  MOVE: 1n << 24n,
  NICK: 1n << 27n,
  MANAGE_ROLES: 1n << 28n,
  THREADS: 1n << 34n,
  MODERATE: 1n << 40n,
};

export const bits = (...flags) => flags.reduce((sum, flag) => sum | flag, 0n).toString();

export function hasPerm(permissionString, flag) {
  try {
    const value = BigInt(permissionString || "0");
    if ((value & P.ADMIN) === P.ADMIN) return true;
    return (value & flag) === flag;
  } catch {
    return false;
  }
}

export async function verifyRequest(request, publicKey, body) {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");
  if (!signature || !timestamp || !publicKey) return false;
  const key = await crypto.subtle.importKey("raw", hex(publicKey), { name: "Ed25519" }, false, ["verify"]);
  return crypto.subtle.verify({ name: "Ed25519" }, key, hex(signature), new TextEncoder().encode(timestamp + body));
}

function hex(value) {
  const out = new Uint8Array(value.length / 2);
  for (let i = 0; i < out.length; i += 1) out[i] = Number.parseInt(value.slice(i * 2, i * 2 + 2), 16);
  return out;
}

export async function discord(env, path, method = "GET", body, attempt = 0) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    method,
    headers: {
      Authorization: `Bot ${env.DISCORD_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "TyBot (https://github.com/tyfox27072022-bit/ty-bot, 1.0)",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 204) return null;
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (response.status === 429 && attempt < 5) {
    const retry = Math.ceil((data?.retry_after || 1) * 1000) + 250;
    await new Promise((resolve) => setTimeout(resolve, retry));
    return discord(env, path, method, body, attempt + 1);
  }
  if (!response.ok) {
    const message = data?.message || response.statusText;
    throw new Error(`${response.status} ${path}: ${message}`);
  }
  return data;
}

export async function ack(interaction, ephemeral = true) {
  await fetch(`https://discord.com/api/v10/interactions/${interaction.id}/${interaction.token}/callback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: 5, data: ephemeral ? { flags: 64 } : {} }),
  });
}

export async function editOriginal(env, token, payload) {
  await fetch(`https://discord.com/api/v10/webhooks/${env.DISCORD_APP_ID}/${token}/messages/@original`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function optionMap(interaction) {
  const sub = interaction.data?.options?.[0];
  const map = {};
  for (const option of sub?.options || interaction.data?.options || []) {
    map[option.name] = option.value;
  }
  return { sub: sub?.type === 1 ? sub.name : null, map };
}

export async function guildConfig(env, guildId) {
  if (!env.TY) return {};
  const raw = await env.TY.get(`cfg:${guildId}`);
  return raw ? JSON.parse(raw) : {};
}

export async function saveConfig(env, guildId, config) {
  if (!env.TY) return;
  await env.TY.put(`cfg:${guildId}`, JSON.stringify(config));
}
