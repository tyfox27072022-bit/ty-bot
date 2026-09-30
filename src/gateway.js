import fs from "node:fs";
import { Client, GatewayIntentBits } from "discord.js";
import { COMMANDS } from "./commands.js";
import { discord } from "./discord.js";
import { processInteraction } from "./index.js";
import { runSetup } from "./setup.js";

const dataPath = new URL("../data.json", import.meta.url);
const memory = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, "utf8")) : {};

const env = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_APP_ID: process.env.DISCORD_APP_ID,
  DISCORD_PUBLIC_KEY: process.env.DISCORD_PUBLIC_KEY,
  TY: {
    async get(key) {
      return memory[key] ?? null;
    },
    async put(key, value) {
      memory[key] = value;
      fs.writeFileSync(dataPath, JSON.stringify(memory));
    },
  },
};

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.on("raw", (packet) => {
  if (packet.t !== "INTERACTION_CREATE") return;
  processInteraction(env, packet.d).catch((error) => console.error("interaction", error));
});

client.once("ready", async () => {
  console.log(`online as ${client.user.tag} in ${client.guilds.cache.size} server(s)`);
  for (const guild of client.guilds.cache.values()) {
    await prepare(guild.id, guild.name);
  }
});

client.on("guildCreate", (guild) => {
  prepare(guild.id, guild.name).catch((error) => console.error("join", error));
});

async function prepare(guildId, name) {
  console.log(`syncing commands in ${name}`);
  await discord(env, `/applications/${env.DISCORD_APP_ID}/guilds/${guildId}/commands`, "PUT", COMMANDS);
  const existing = await env.TY.get(`cfg:${guildId}`);
  if (existing) {
    console.log(`already set up ${name}`);
    return;
  }
  console.log(`running setup in ${name}`);
  const summary = await runSetup(env, guildId);
  console.log(`setup done in ${name}`, summary.automodNotes);
}

client.login(env.DISCORD_TOKEN);
