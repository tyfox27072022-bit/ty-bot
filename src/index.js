import { COMMANDS, HELP } from "./commands.js";
import { ack, discord, editOriginal, guildConfig, optionMap, verifyRequest } from "./discord.js";
import { dashboardPage } from "./dashboard.js";
import { channelTools, moderate } from "./mod.js";
import { memberRulesEmbed, staffRulesEmbed } from "./rules.js";
import { closeTicket, openTicket, runSetup } from "./setup.js";
import { geoFromRequest, grantVerifyRoles, lookupEmbed, makeVerifyToken, readVerifyToken, rememberIp, writeVerifyLog } from "./verify.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/verify" && (request.method === "GET" || request.method === "POST")) return verifyPage(request, env, url);
    if (request.method === "POST" && url.pathname === "/interactions") return interactions(request, env);
    if (request.method === "GET" && (url.pathname === "/" || url.pathname === "/dashboard")) {
      return html(dashboardPage());
    }
    if (url.pathname.startsWith("/api/")) return api(request, env, url);
    return new Response("Ty Bot", { status: 404 });
  },
};

async function interactions(request, env) {
  const body = await request.text();
  const ok = await verifyRequest(request, env.DISCORD_PUBLIC_KEY, body);
  if (!ok) return new Response("bad signature", { status: 401 });
  const interaction = JSON.parse(body);
  if (interaction.type === 1) return Response.json({ type: 1 });
  await processInteraction(env, interaction, new URL(request.url).origin);
  return new Response(null, { status: 202 });
}

export async function processInteraction(env, interaction, baseUrl) {
  const work = handle(env, interaction, baseUrl).catch((error) => ({ error: error.message || "Command failed." }));
  await ack(interaction, true);
  const result = await work;
  const payload = {};
  if (result.embeds) payload.embeds = result.embeds;
  if (result.components) payload.components = result.components;
  const content = result.error || result.content;
  if (content) payload.content = content.slice(0, 1900);
  else if (!result.embeds) payload.content = "Done.";
  await editOriginal(env, interaction.token, payload);
}

async function handle(env, interaction, baseUrl) {
  if (interaction.type === 3) return component(env, interaction, baseUrl);
  const name = interaction.data?.name;
  const { sub, map } = optionMap(interaction);
  if (name === "help") return { content: HELP };
  if (name === "lookup") {
    const userId = map.user;
    if (!userId) return { content: "Pick a user." };
    return lookupEmbed(env, interaction.guild_id, userId);
  }
  if (name === "setup") {
    const summary = await runSetup(env, interaction.guild_id);
    const extra = summary.automodNotes.length ? `\nAutoMod notes: ${summary.automodNotes.join(" | ")}` : "\nAutoMod rules created.";
    return { content: `Setup finished. Give yourself Owner, give mods Staff, and drag Ty Bot above Staff.${extra}` };
  }
  if (name === "mod") {
    const userId = map.user || map.user_id;
    const content = await moderate(env, {
      guildId: interaction.guild_id,
      actorId: interaction.member.user.id,
      action: sub,
      userId,
      reason: map.reason,
      duration: map.duration,
      deleteDays: map.delete_days,
    });
    return { content };
  }
  if (name === "server") return { content: await channelTools(env, interaction, sub, map) };
  return { content: "Unknown command. Run sync from the dashboard." };
}

async function component(env, interaction, baseUrl) {
  const id = interaction.data.custom_id;
  if (id === "verify_member" || id === "verify_yoru") return startVerify(env, interaction, id === "verify_yoru" ? "yoru" : "member", baseUrl);
  if (id.startsWith("ticket_") && id !== "ticket_close") {
    const kind = id.replace("ticket_", "");
    const ticket = await openTicket(env, interaction, kind);
    if (ticket.already) return { content: `You already have a ticket: <#${ticket.already}>` };
    return { content: `Ticket opened: <#${ticket.created}>` };
  }
  if (id === "ticket_close") {
    await closeTicket(env, interaction);
    return { content: "Closing ticket." };
  }
  return { content: "Unknown button." };
}

async function startVerify(env, interaction, kind, baseUrl) {
  const origin = (baseUrl || env.WORKER_URL || "").replace(/\/$/, "");
  if (!origin) {
    return { content: "The verify site is not connected yet. Staff need to set the Cloudflare Worker URL." };
  }
  const token = await makeVerifyToken(env.DISCORD_TOKEN, {
    guildId: interaction.guild_id,
    userId: interaction.member.user.id,
    kind,
  });
  const url = `${origin}/verify?t=${encodeURIComponent(token)}`;
  return {
    content: "Open the verify site and press Verify. Ty Bot records your IP, location, Discord ID, and account age. This link expires in 15 minutes.",
    components: [{ type: 1, components: [{ type: 2, style: 5, label: "Open verify site", url }] }],
  };
}

export async function verifyPage(request, env, url) {
  const token = request.method === "POST" ? await readPostedToken(request) : url.searchParams.get("t");
  try {
    const data = await readVerifyToken(env.DISCORD_TOKEN, token);
    const usedKey = `vused:${data.g}:${data.u}:${data.e}`;
    if (env.TY && (await env.TY.get(usedKey))) throw new Error("This verify link was already used. Press Verify in Discord again.");
    if (request.method !== "POST") return html(verifySite("Press the button to unlock Yoru AI.", token));
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "";
    const user = await discord(env, `/users/${data.u}`);
    const sameIpUsers = await rememberIp(env, data.g, ip, data.u);
    await grantVerifyRoles(env, data.g, data.u, data.k);
    await writeVerifyLog(env, {
      guildId: data.g,
      userId: data.u,
      kind: data.k,
      user,
      ip: ip || "Unknown",
      geo: await lookupGeo(request, ip),
      sameIpUsers,
    }).catch(() => {});
    if (env.TY) await env.TY.put(usedKey, "1");
    return html(verifySite("You're verified. Go back to Discord. The Member role is yours.", null, true));
  } catch (error) {
    return html(verifySite(error.message || "Press Verify in Discord again.", null), 400);
  }
}

function verifySite(message, token, done = false) {
  const button = token
    ? `<form method="post" action="/verify"><input type="hidden" name="t" value="${escapeHtml(token)}"><button type="submit">Verify</button></form>`
    : "";
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Verify · Yoru AI</title><style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0c0d0b;color:#f4f1ea;font-family:ui-sans-serif,system-ui,sans-serif}
    .card{width:min(440px,calc(100% - 32px));background:#161814;border:1px solid #2a2d26;border-radius:18px;padding:28px}
    h1{margin:0 0 8px;font-size:28px}p{color:#b7b2a8;line-height:1.45}
    button{margin-top:18px;width:100%;height:48px;border:0;border-radius:12px;background:#d6ff4a;color:#14160f;font-weight:700;font-size:16px}
  </style></head><body><main class="card"><p>Ty Bot</p><h1>${done ? "You're in" : "Verify for Yoru AI"}</h1><p>${escapeHtml(message)}</p>${button}</main></body></html>`;
}

async function lookupGeo(request, ip) {
  const geo = geoFromRequest(request);
  if (geo.country || !ip) return geo;
  try {
    const response = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    const data = await response.json();
    if (!data?.success) return geo;
    return {
      city: data.city || "",
      region: data.region || "",
      country: data.country_code || data.country || "",
      org: data.connection?.isp || "",
    };
  } catch {
    return geo;
  }
}

async function readPostedToken(request) {
  const type = request.headers.get("Content-Type") || "";
  const raw = await request.text();
  if (type.includes("application/json")) return JSON.parse(raw || "{}").t || "";
  return new URLSearchParams(raw).get("t") || "";
}

function escapeHtml(value) {
  const named = { "&": "amp", "<": "lt", ">": "gt", '"': "quot" };
  return String(value).replace(/[&<>"]/g, (ch) => `&${named[ch]};`);
}

async function api(request, env, url) {
  if (request.method === "POST" && url.pathname === "/api/login") {
    const { key } = await request.json();
    if (!env.DASHBOARD_KEY || key !== env.DASHBOARD_KEY) return Response.json({ error: "Wrong dashboard key." }, { status: 401 });
    const exp = String(Date.now() + 7 * 86400000);
    const sig = await sign(env.DASHBOARD_KEY, exp);
    return new Response(JSON.stringify({ ok: true }), {
      headers: {
        "Content-Type": "application/json",
        "Set-Cookie": `ty_session=${encodeURIComponent(`${exp}.${sig}`)}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=604800`,
      },
    });
  }
  if (!(await sessionOk(request, env))) return Response.json({ error: "Sign in first." }, { status: 401 });
  if (url.pathname === "/api/guilds" && request.method === "GET") {
    const bot = await discord(env, "/users/@me");
    const guilds = await discord(env, "/users/@me/guilds");
    return Response.json({ bot: bot.username, guilds });
  }
  const match = url.pathname.match(/^\/api\/guilds\/(\d+)\/(sync|setup|mod|post)$/);
  if (!match || request.method !== "POST") return Response.json({ error: "Not found." }, { status: 404 });
  const guildId = match[1];
  const action = match[2];
  try {
    if (action === "sync") {
      await discord(env, `/applications/${env.DISCORD_APP_ID}/guilds/${guildId}/commands`, "PUT", COMMANDS);
      return Response.json({ ok: true, message: "Commands synced to this server." });
    }
    if (action === "setup") {
      const summary = await runSetup(env, guildId);
      return Response.json({ ok: true, summary });
    }
    if (action === "post") {
      const body = await request.json();
      const config = await guildConfig(env, guildId);
      const channelId = body.kind === "staff" ? config.channels?.["staff-rules"] : config.channels?.rules;
      if (!channelId) throw new Error("Run setup first.");
      await discord(env, `/channels/${channelId}/messages`, "POST", {
        embeds: [body.kind === "staff" ? staffRulesEmbed() : memberRulesEmbed()],
      });
      return Response.json({ ok: true, message: "Posted." });
    }
    const body = await request.json();
    const me = await discord(env, "/users/@me");
    const content = await moderate(env, {
      guildId,
      actorId: me.id,
      action: body.action,
      userId: body.userId,
      reason: body.reason,
      duration: body.duration,
      deleteDays: body.deleteDays,
    });
    return Response.json({ ok: true, message: content });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }
}

async function sessionOk(request, env) {
  if (!env.DASHBOARD_KEY) return false;
  const cookie = request.headers.get("Cookie") || "";
  const match = cookie.match(/(?:^|; )ty_session=([^;]+)/);
  if (!match) return false;
  const [exp, sig] = decodeURIComponent(match[1]).split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return (await sign(env.DASHBOARD_KEY, exp)) === sig;
}

async function sign(secret, data) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const raw = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(raw))).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function html(body, status = 200) {
  return new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}
