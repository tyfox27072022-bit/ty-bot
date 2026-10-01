import fs from "node:fs";
import { Client, GatewayIntentBits } from "discord.js";
import { ensureBoosterRole, syncBooster } from "./booster.js";
import { COMMANDS } from "./commands.js";
import { discord } from "./discord.js";
import { checkGameNews, ensureGameRoles, toggleGameRole } from "./games.js";
import { processInteraction } from "./index.js";
import { runSetup } from "./setup.js";

const dataPath = new URL("../data.json", import.meta.url);

function readStore() {
  try {
    return fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, "utf8")) : {};
  } catch {
    return {};
  }
}

const env = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_APP_ID: process.env.DISCORD_APP_ID,
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
  WORKER_URL: process.env.WORKER_URL || "",
  TY: {
    async get(key) {
      return readStore()[key] ?? null;
    },
    async put(key, value) {
      const data = readStore();
      data[key] = value;
      fs.writeFileSync(dataPath, JSON.stringify(data));
    },
    async list({ prefix } = {}) {
      const keys = Object.keys(readStore()).filter((key) => !prefix || key.startsWith(prefix));
      return { keys: keys.map((name) => ({ name })) };
    },
  },
};

const intents = [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessageReactions];
if (process.env.MEMBER_INTENT === "1") intents.push(GatewayIntentBits.GuildMembers);
const client = new Client({ intents });

client.on("raw", (packet) => {
  if (packet.t === "INTERACTION_CREATE") {
    processInteraction(env, packet.d).catch((error) => console.error("interaction", error));
    return;
  }
  if (packet.t === "MESSAGE_REACTION_ADD" || packet.t === "MESSAGE_REACTION_REMOVE") {
    toggleGameRole(env, packet.d, packet.t === "MESSAGE_REACTION_ADD").catch((error) => console.error("reaction", error.message));
    return;
  }
  if (packet.t === "GUILD_MEMBER_UPDATE" || packet.t === "GUILD_MEMBER_ADD") {
    const member = packet.d;
    syncBooster(env, member.guild_id, member.user?.id, member.roles, member.premium_since).catch((error) =>
      console.error("booster", error.message),
    );
  }
});

client.once("ready", async () => {
  console.log(`online as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
  for (const guild of client.guilds.cache.values()) {
    await prepare(guild);
  }
});

client.on("guildCreate", (guild) => {
  prepare(guild).catch((error) => console.error("join", error));
});

async function prepare(guild) {
  console.log(`syncing commands in ${guild.name}`);
  await discord(env, `/applications/${env.DISCORD_APP_ID}/guilds/${guild.id}/commands`, "PUT", COMMANDS);
  const existing = await env.TY.get(`cfg:${guild.id}`);
  if (!existing) {
    console.log(`running setup in ${guild.name}`);
    const summary = await runSetup(env, guild.id);
    console.log(`setup done in ${guild.name}`, summary.automodNotes);
  } else {
    console.log(`already set up ${guild.name}`);
  }
  const roleId = await ensureBoosterRole(env, guild.id);
  console.log(`server booster role ${roleId}`);
  await ensureGameRoles(env, guild.id);
  console.log("game roles ready");
  checkGameNews(env, guild.id).catch((error) => console.error("game news", error.message));
  setInterval(() => {
    checkGameNews(env, guild.id).catch((error) => console.error("game news", error.message));
  }, 30 * 60 * 1000);
  if (process.env.MEMBER_INTENT !== "1") {
    console.log("booster role is ready; member intent is off so boosts are not watched yet");
    return;
  }
  try {
    const members = await guild.members.fetch();
    for (const member of members.values()) {
      if (member.user.bot) continue;
      await syncBooster(env, guild.id, member.id, [...member.roles.cache.keys()], member.premiumSince);
    }
    const boosting = members.filter((member) => member.premiumSince).size;
    console.log(`booster sync ${guild.name}: ${boosting} boosting`);
  } catch (error) {
    console.error("booster sync failed", error.message);
  }
}

client.login(env.DISCORD_TOKEN);
