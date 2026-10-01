import { discord } from "./discord.js";

const APPROVER = "1133535025317556286";
const TICKS = new Set(["✅", "✔️", "✔", "☑️", "☑"]);
const plain = (name) => String(name || "").toLowerCase().replace(/^[^a-z0-9]+/, "");

export async function acceptSuggestion(env, packet) {
  if (packet.user_id !== APPROVER || !TICKS.has(packet.emoji?.name)) return;
  const channel = await discord(env, `/channels/${packet.channel_id}`);
  if (!plain(channel.name).startsWith("suggestion")) return;
  const key = `suggestion:${packet.channel_id}:${packet.message_id}`;
  if (env.TY && (await env.TY.get(key))) return;
  const message = await discord(env, `/channels/${packet.channel_id}/messages/${packet.message_id}`);
  if (!message || message.author?.bot) return;
  if (env.TY) await env.TY.put(key, "added");
  await discord(env, `/channels/${packet.channel_id}/pins/${packet.message_id}`, "PUT").catch(() => {});
  await discord(env, `/channels/${packet.channel_id}/messages`, "POST", {
    content: "Added.",
    message_reference: { message_id: packet.message_id, channel_id: packet.channel_id, guild_id: packet.guild_id },
    allowed_mentions: { parse: [], replied_user: true },
  });
}
