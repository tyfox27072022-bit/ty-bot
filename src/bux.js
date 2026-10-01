const START = 100;

function amountOf(data, userId) {
  return data[userId] == null ? START : data[userId];
}
const recent = new Map();
const queues = new Map();

function lock(guildId, work) {
  const previous = queues.get(guildId) || Promise.resolve();
  const next = previous.then(work, work);
  queues.set(guildId, next.then(() => {}, () => {}));
  return next;
}

async function read(env, guildId) {
  if (!env.TY) return {};
  return JSON.parse((await env.TY.get(`bux:${guildId}`)) || "{}");
}

async function write(env, guildId, data) {
  if (!env.TY) return;
  await env.TY.put(`bux:${guildId}`, JSON.stringify(data));
}

export async function balance(env, guildId, userId) {
  const data = await read(env, guildId);
  return amountOf(data, userId);
}

export async function addBux(env, guildId, userId, amount) {
  return lock(guildId, async () => {
    const data = await read(env, guildId);
    data[userId] = Math.max(0, amountOf(data, userId) + amount);
    await write(env, guildId, data);
    return data[userId];
  });
}

export async function charge(env, guildId, userId, amount) {
  return lock(guildId, async () => {
    const data = await read(env, guildId);
    const current = amountOf(data, userId);
    if (current < amount) return null;
    data[userId] = current - amount;
    await write(env, guildId, data);
    return data[userId];
  });
}

export async function standings(env, guildId) {
  const data = await read(env, guildId);
  return Object.entries(data)
    .map(([id, amount]) => ({ id, amount }))
    .sort((a, b) => b.amount - a.amount);
}

export async function awardChat(env, message) {
  const userId = message.author?.id;
  if (!message.guild_id || !userId || message.author.bot || message.webhook_id) return;
  const key = `${message.guild_id}:${userId}`;
  const now = Date.now();
  if (now - (recent.get(key) || 0) < 8000) return;
  recent.set(key, now);
  await addBux(env, message.guild_id, userId, 5);
}
