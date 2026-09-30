import { COMMANDS, HELP } from "./commands.js";
import { ack, discord, editOriginal, guildConfig, optionMap, verifyRequest } from "./discord.js";
import { dashboardPage } from "./dashboard.js";
import { channelTools, moderate } from "./mod.js";
import { memberRulesEmbed, staffRulesEmbed } from "./rules.js";
import { closeTicket, openTicket, runSetup } from "./setup.js";
import { accountCreated, altReasons, geoFromRequest, grantVerifyRoles, lookupEmbed, makeVerifyToken, readVerifyToken, rememberIp, writeVerifyLog } from "./verify.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/verify") return verifyPage(request, env, url);
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
  const guildId = interaction.guild_id;
  const userId = interaction.member.user.id;
  const origin = (baseUrl || env.WORKER_URL || "").replace(/\/$/, "");
  if (!origin) {
    const user = await discord(env, `/users/${userId}`);
    await grantVerifyRoles(env, guildId, userId, kind);
    await writeVerifyLog(env, {
      guildId,
      userId,
      kind,
      user,
      ip: "Discord did not send an IP. Open the safety link once the Worker URL is set.",
      geo: {},
      sameIpUsers: [],
    }).catch(() => {});
    const created = accountCreated(userId);
    const days = Math.max(0, Math.floor((Date.now() - created.getTime()) / 86400000));
    const guess = altReasons(user, created, []).length ? " Staff flagged this as a possible alt." : "";
    return {
      content: kind === "yoru"
        ? `Verified. You have Member and Yoru User. Account age: ${days} days.${guess}`
        : `Verified. You have the Member role. Account age: ${days} days.${guess}`,
    };
  }
  const token = await makeVerifyToken(env.DISCORD_TOKEN, { guildId, userId, kind });
  return { content: `Open this private link to finish verifying. It expires in 15 minutes.\n${origin}/verify?t=${encodeURIComponent(token)}` };
}

async function verifyPage(request, env, url) {
  try {
    const data = await readVerifyToken(env.DISCORD_TOKEN, url.searchParams.get("t"));
    const usedKey = `vused:${data.g}:${data.u}:${data.e}`;
    if (env.TY && (await env.TY.get(usedKey))) throw new Error("This verify link was already used.");
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For")?.split(",")[0]?.trim() || "";
    const user = await discord(env, `/users/${data.u}`);
    const sameIpUsers = await rememberIp(env, data.g, ip, data.u);
    await grantVerifyRoles(env, data.g, data.u, data.k);
    await writeVerifyLog(env, { guildId: data.g, userId: data.u, kind: data.k, user, ip: ip || "Unknown", geo: geoFromRequest(request), sameIpUsers }).catch(() => {});
    if (env.TY) await env.TY.put(usedKey, "1");
    return html("<!doctype html><title>Verified</title><body style=\"font-family:sans-serif;background:#111;color:#fff;padding:40px\"><h1>You're verified</h1><p>You can close this page and go back to Discord.</p></body>");
  } catch (error) {
    return html(`<!doctype html><title>Verify</title><body style="font-family:sans-serif;background:#111;color:#fff;padding:40px"><h1>Could not verify</h1><p>${escapeHtml(error.message || "Try the button again.")}</p></body>`, 400);
  }
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&").replaceAll("<", "<").replaceAll(">", ">");
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
