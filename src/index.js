import { COMMANDS, HELP } from "./commands.js";
import { ack, discord, editOriginal, guildConfig, optionMap, verifyRequest } from "./discord.js";
import { dashboardPage } from "./dashboard.js";
import { channelTools, moderate } from "./mod.js";
import { memberRulesEmbed, staffRulesEmbed } from "./rules.js";
import { closeTicket, openTicket, runSetup } from "./setup.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
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
  await processInteraction(env, interaction);
  return new Response(null, { status: 202 });
}

export async function processInteraction(env, interaction) {
  const work = handle(env, interaction).catch((error) => ({ error: error.message || "Command failed." }));
  await ack(interaction, true);
  const result = await work;
  const content = result.error || result.content || "Done.";
  await editOriginal(env, interaction.token, { content: content.slice(0, 1900) });
}

async function handle(env, interaction) {
  if (interaction.type === 3) return component(env, interaction);
  const name = interaction.data?.name;
  const { sub, map } = optionMap(interaction);
  if (name === "help") return { content: HELP };
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

async function component(env, interaction) {
  const id = interaction.data.custom_id;
  if (id === "verify_member" || id === "verify_yoru") {
    const config = await guildConfig(env, interaction.guild_id);
    if (!config.roles?.member) throw new Error("Run /setup first.");
    const userId = interaction.member.user.id;
    await discord(env, `/guilds/${interaction.guild_id}/members/${userId}/roles/${config.roles.member}`, "PUT");
    if (id === "verify_yoru" && config.roles.yoru) {
      await discord(env, `/guilds/${interaction.guild_id}/members/${userId}/roles/${config.roles.yoru}`, "PUT");
    }
    return { content: id === "verify_yoru" ? "Verified. You have Member and Yoru User." : "Verified. You have the Member role." };
  }
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

function html(body) {
  return new Response(body, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}
