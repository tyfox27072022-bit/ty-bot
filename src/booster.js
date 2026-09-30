import { discord, guildConfig, saveConfig } from "./discord.js";

const PERKS = "104193601";

export async function ensureBoosterRole(env, guildId) {
  const config = await guildConfig(env, guildId);
  const roles = await discord(env, `/guilds/${guildId}/roles`);
  let role =
    roles.find((item) => item.id === config.roles?.booster && !item.managed) ||
    roles.find((item) => item.name === "Server Booster" && !item.managed);
  if (!role) {
    role = await discord(env, `/guilds/${guildId}/roles`, "POST", {
      name: "Server Booster",
      color: 0xf47fff,
      hoist: true,
      mentionable: false,
      permissions: PERKS,
    });
  }
  const anchor = roles.find((item) => item.name === "Nitro Booster") || roles.find((item) => item.name === "Member");
  if (anchor && role.position <= anchor.position) {
    await discord(env, `/guilds/${guildId}/roles`, "PATCH", [{ id: role.id, position: anchor.position + 1 }]);
  }
  config.roles = { ...(config.roles || {}), booster: role.id };
  await saveConfig(env, guildId, config);
  return role.id;
}

export async function syncBooster(env, guildId, userId, roleIds, premiumSince) {
  if (!userId) return;
  const config = await guildConfig(env, guildId);
  const roleId = config.roles?.booster;
  if (!roleId) return;
  const has = (roleIds || []).includes(roleId);
  const boosting = Boolean(premiumSince);
  if (boosting === has) return;
  const path = `/guilds/${guildId}/members/${userId}/roles/${roleId}`;
  await discord(env, path, boosting ? "PUT" : "DELETE");
  console.log(`${boosting ? "gave" : "removed"} Server Booster for ${userId}`);
}
