import { discord } from "./discord.js";
import { addBux, balance, charge, standings } from "./bux.js";

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const suits = ["♠", "♥", "♦", "♣"];
const games = new Map();

function row(buttons) {
  return { type: 1, components: buttons };
}
function btn(id, label, style = 2, disabled = false) {
  return { type: 2, style, label, custom_id: id, disabled };
}
function embed(title, description) {
  return { color: 0xd6ff4a, title, description, footer: { text: "Yoru Bux" } };
}
function nameOf(interaction) {
  return interaction.member?.user?.global_name || interaction.member?.user?.username || "Someone";
}
function deck() {
  const cards = suits.flatMap((suit) => ranks.map((rank) => `${rank}${suit}`));
  for (let i = cards.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
function worth(hand) {
  let total = 0;
  let aces = 0;
  for (const card of hand) {
    const rank = card.slice(0, -1);
    if (rank === "A") { total += 11; aces += 1; }
    else if ("JQK".includes(rank)) total += 10;
    else total += Number(rank);
  }
  while (total > 21 && aces) { total -= 10; aces -= 1; }
  return total;
}
function id() {
  return Math.random().toString(36).slice(2, 8);
}

export async function minigame(env, interaction) {
  const guildId = interaction.guild_id;
  const userId = interaction.member.user.id;
  const name = interaction.data?.name;
  const custom = interaction.data?.custom_id || "";
  if (name === "yoru") return { embeds: [embed("Your Yoru Bux", `You have **${await balance(env, guildId, userId)}** Yoru Bux.`)] };
  if (name === "leaderboard") return leaderboard(env, guildId);
  if (name === "minigames") return menu(userId);
  if (name === "2pminigames") return challenge(interaction);
  if (custom.startsWith("mg:")) return solo(env, interaction, custom, guildId, userId);
  if (custom.startsWith("p2:")) return versus(env, interaction, custom, guildId, userId);
  return { content: "That game is gone." };
}

function menu(userId) {
  return {
    embeds: [embed("Mini games", "Pick a game. Wins pay Yoru Bux. Chatting pays 5 Yoru Bux a message.\n\nBlackjack 25 · Roulette 20 · Slots 15 · Coinflip 20 · Heist 30")],
    components: [
      row([btn(`mg:open:bj:${userId}`, "Blackjack", 1), btn(`mg:open:roulette:${userId}`, "Roulette", 1), btn(`mg:open:slots:${userId}`, "Slots", 1)]),
      row([btn(`mg:open:flip:${userId}`, "Coinflip", 1), btn(`mg:open:heist:${userId}`, "Heist", 4)]),
    ],
  };
}

function challenge(interaction) {
  const target = interaction.data?.options?.find((option) => option.name === "user")?.value;
  const userId = interaction.member.user.id;
  if (!target || target === userId) return { content: "Pick someone else." };
  if (interaction.data?.resolved?.users?.[target]?.bot) return { content: "Bots do not play." };
  return {
    content: `<@${userId}> challenged <@${target}>. Pick a game.`,
    components: [row([
      btn(`p2:go:rps:${userId}:${target}`, "Rock paper scissors", 1),
      btn(`p2:go:ttt:${userId}:${target}`, "Tic-tac-toe", 1),
      btn(`p2:go:card:${userId}:${target}`, "High card", 1),
    ])],
  };
}

async function leaderboard(env, guildId) {
  const rows = (await standings(env, guildId)).filter((row) => row.amount > 0).slice(0, 10);
  if (!rows.length) return { embeds: [embed("Yoru Bux leaderboard", "Nobody has Yoru Bux yet. Chat or win a game.")] };
  const lines = rows.map((row, index) => `${["1st", "2nd", "3rd"][index] || `${index + 1}th`} <@${row.id}> — **${row.amount}**`);
  return { embeds: [embed("Yoru Bux leaderboard", lines.join("\n"))], allowedMentions: true };
}

async function solo(env, interaction, custom, guildId, userId) {
  const [, action, kind, owner] = custom.split(":");
  if (owner !== userId) return { content: "That menu belongs to someone else. Run /minigames." };
  if (action === "open" && kind === "bj") return startBlackjack(env, guildId, userId);
  if (action === "open" && kind === "roulette") return roulettePick(userId);
  if (action === "open" && kind === "slots") return slots(env, guildId, userId, interaction.channel_id, nameOf(interaction));
  if (action === "open" && kind === "flip") return flipPick(userId);
  if (action === "open" && kind === "heist") return heist(env, guildId, userId, interaction.channel_id, nameOf(interaction));
  if (action === "bj") return blackjack(env, guildId, userId, kind, interaction.channel_id, nameOf(interaction));
  if (action === "bet") return roulette(env, guildId, userId, kind, interaction.channel_id, nameOf(interaction));
  if (action === "flip") return coinflip(env, guildId, userId, kind, interaction.channel_id, nameOf(interaction));
  return menu(userId);
}

function roulettePick(userId) {
  return {
    embeds: [embed("Roulette", "20 Yoru Bux. Red or black pays double. Green pays 14 times and almost never hits.")],
    components: [row([
      btn(`mg:bet:red:${userId}`, "Red", 4),
      btn(`mg:bet:black:${userId}`, "Black", 2),
      btn(`mg:bet:green:${userId}`, "Green", 3),
    ])],
  };
}
function flipPick(userId) {
  return {
    embeds: [embed("Coinflip", "20 Yoru Bux. Call it.")],
    components: [row([btn(`mg:flip:heads:${userId}`, "Heads", 1), btn(`mg:flip:tails:${userId}`, "Tails", 1)])],
  };
}

async function startBlackjack(env, guildId, userId) {
  if ((await charge(env, guildId, userId, 25)) === null) return broke(env, guildId, userId, 25);
  const cards = deck();
  const state = { user: userId, bet: 25, player: [cards.pop(), cards.pop()], dealer: [cards.pop(), cards.pop()], cards };
  games.set(`bj:${guildId}:${userId}`, state);
  if (worth(state.player) === 21) return finishBlackjack(env, guildId, userId, state, "Blackjack.");
  return bjView(state, true);
}

async function blackjack(env, guildId, userId, move, channelId, who) {
  const state = games.get(`bj:${guildId}:${userId}`);
  if (!state) return { content: "That hand is over. Run /minigames." };
  if (move === "hit") {
    state.player.push(state.cards.pop());
    if (worth(state.player) > 21) return finishBlackjack(env, guildId, userId, state, "Bust.");
    return bjView(state, true);
  }
  while (worth(state.dealer) < 17) state.dealer.push(state.cards.pop());
  return finishBlackjack(env, guildId, userId, state, "Stand.");
}

function bjView(state, hidden) {
  const dealer = hidden ? `${state.dealer[0]} ??` : `${state.dealer.join(" ")} (${worth(state.dealer)})`;
  return {
    embeds: [embed("Blackjack", `You: ${state.player.join(" ")} (${worth(state.player)})\nDealer: ${dealer}\nBet: 25 Yoru Bux`)],
    components: hidden ? [row([btn(`mg:bj:hit:${state.user}`, "Hit", 3), btn(`mg:bj:stand:${state.user}`, "Stand", 4)])] : [],
  };
}

async function finishBlackjack(env, guildId, userId, state, note) {
  games.delete(`bj:${guildId}:${userId}`);
  const player = worth(state.player);
  const dealer = worth(state.dealer);
  let result = `${note} You lose 25 Yoru Bux.`;
  if (player <= 21 && (player > dealer || dealer > 21)) {
    const pay = player === 21 && state.player.length === 2 ? 60 : 50;
    await addBux(env, guildId, userId, pay);
    result = `${note} You win. You now have **${await balance(env, guildId, userId)}** Yoru Bux.`;
  } else if (player <= 21 && player === dealer) {
    await addBux(env, guildId, userId, 25);
    result = "Push. Your 25 Yoru Bux is back.";
  }
  const view = bjView(state, false);
  view.embeds[0].description += `\n\n${result}`;
  view.components = [];
  return view;
}

async function roulette(env, guildId, userId, pick, channelId, who) {
  if ((await charge(env, guildId, userId, 20)) === null) return broke(env, guildId, userId, 20);
  const roll = Math.floor(Math.random() * 15);
  const landed = roll === 0 ? "green" : roll % 2 ? "red" : "black";
  let text = `The ball landed on **${landed}**. You lose 20 Yoru Bux.`;
  if (pick === landed) {
    const pay = pick === "green" ? 280 : 40;
    const left = await addBux(env, guildId, userId, pay);
    text = `The ball landed on **${landed}**. You win. You now have **${left}** Yoru Bux.`;
    await cheer(env, channelId, `**${who}** hit ${landed} on roulette.`);
  }
  return { embeds: [embed("Roulette", text)], components: [] };
}

async function slots(env, guildId, userId, channelId, who) {
  if ((await charge(env, guildId, userId, 15)) === null) return broke(env, guildId, userId, 15);
  const icons = ["🍋", "🍒", "🔔", "⭐", "💎"];
  const spin = [0, 1, 2].map(() => icons[Math.floor(Math.random() * icons.length)]);
  let text = `${spin.join(" ")}\nNothing. You lose 15 Yoru Bux.`;
  const same = spin[0] === spin[1] && spin[1] === spin[2];
  const pair = spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2];
  if (same) {
    const left = await addBux(env, guildId, userId, 90);
    text = `${spin.join(" ")}\nThree across. You now have **${left}** Yoru Bux.`;
    await cheer(env, channelId, `**${who}** hit triple slots.`);
  } else if (pair) {
    const left = await addBux(env, guildId, userId, 20);
    text = `${spin.join(" ")}\nA pair. You now have **${left}** Yoru Bux.`;
  }
  return { embeds: [embed("Slots", text)], components: [] };
}

async function coinflip(env, guildId, userId, pick, channelId, who) {
  if ((await charge(env, guildId, userId, 20)) === null) return broke(env, guildId, userId, 20);
  const landed = Math.random() < 0.5 ? "heads" : "tails";
  if (pick !== landed) return { embeds: [embed("Coinflip", `It was **${landed}**. You lose 20 Yoru Bux.`)], components: [] };
  const left = await addBux(env, guildId, userId, 40);
  await cheer(env, channelId, `**${who}** called the coinflip.`);
  return { embeds: [embed("Coinflip", `It was **${landed}**. You now have **${left}** Yoru Bux.`)], components: [] };
}

async function heist(env, guildId, userId, channelId, who) {
  if ((await charge(env, guildId, userId, 30)) === null) return broke(env, guildId, userId, 30);
  const lines = [
    "You grabbed the tip jar and walked out like you belonged there.",
    "The vending machine paid out a stupid amount. You did not ask why.",
    "You found a wallet on the lounge couch. It was thick.",
  ];
  const fails = [
    "Security watched you the whole time. You put it back.",
    "The bag ripped. Coins everywhere. None of them yours.",
    "It was a decoy wallet. There was a note that just said no.",
  ];
  if (Math.random() < 0.45) {
    const left = await addBux(env, guildId, userId, 90);
    await cheer(env, channelId, `**${who}** got away with a heist.`);
    return { embeds: [embed("Heist", `${lines[Math.floor(Math.random() * lines.length)]}\nYou now have **${left}** Yoru Bux.`)], components: [] };
  }
  return { embeds: [embed("Heist", `${fails[Math.floor(Math.random() * fails.length)]}\nYou lose 30 Yoru Bux.`)], components: [] };
}

async function versus(env, interaction, custom, guildId, userId) {
  const parts = custom.split(":");
  if (parts[1] === "go") return openVersus(env, guildId, userId, parts[2], parts[3], parts[4]);
  const game = games.get(parts[2]);
  if (!game || Date.now() - game.at > 10 * 60 * 1000) return { content: "That game expired. Challenge them again." };
  if (game.kind === "rps") return rps(env, game, userId, parts[3]);
  if (game.kind === "ttt") return ttt(env, game, userId, Number(parts[3]));
  if (game.kind === "card") return highCard(env, game, userId);
  return { content: "Unknown game." };
}

async function openVersus(env, guildId, userId, kind, inviter, target) {
  if (userId !== inviter) return { content: "Only the person who sent the challenge picks the game." };
  const gameId = id();
  const game = { id: gameId, kind, a: inviter, b: target, guild: guildId, pot: kind === "ttt" ? 40 : 30, at: Date.now(), picks: {}, board: Array(9).fill(""), turn: inviter, drawn: {} };
  games.set(gameId, game);
  if (kind === "rps") return rpsView(game);
  if (kind === "ttt") return tttView(game, "X goes first.");
  return cardView(game, "Both of you draw a card. Higher card wins.");
}

function rpsView(game) {
  const locked = [game.picks[game.a] ? `<@${game.a}> locked in` : `<@${game.a}> thinking`, game.picks[game.b] ? `<@${game.b}> locked in` : `<@${game.b}> thinking`];
  return {
    content: `<@${game.a}> vs <@${game.b}>`,
    embeds: [embed("Rock paper scissors", `${locked.join("\n")}\nWinner gets ${game.pot} Yoru Bux.`)],
    components: [row([
      btn(`p2:rps:${game.id}:rock`, "Rock", 2),
      btn(`p2:rps:${game.id}:paper`, "Paper", 2),
      btn(`p2:rps:${game.id}:scissors`, "Scissors", 2),
    ])],
  };
}

async function rps(env, game, userId, pick) {
  if (userId !== game.a && userId !== game.b) return { content: "You are not in this game." };
  if (game.picks[userId]) return rpsView(game);
  game.picks[userId] = pick;
  if (!game.picks[game.a] || !game.picks[game.b]) return rpsView(game);
  games.delete(game.id);
  const winner = rpsWinner(game.a, game.picks[game.a], game.b, game.picks[game.b]);
  let text = `<@${game.a}> played ${game.picks[game.a]}. <@${game.b}> played ${game.picks[game.b]}.\n`;
  if (!winner) text += "Tie. Nobody gets paid.";
  else {
    const left = await addBux(env, game.guild, winner, game.pot);
    text += `<@${winner}> wins and has **${left}** Yoru Bux.`;
  }
  return { content: `<@${game.a}> vs <@${game.b}>`, embeds: [embed("Rock paper scissors", text)], components: [] };
}

function rpsWinner(a, ap, b, bp) {
  if (ap === bp) return null;
  const beats = { rock: "scissors", paper: "rock", scissors: "paper" };
  return beats[ap] === bp ? a : b;
}

function tttView(game, note) {
  const cells = game.board.map((mark, index) => btn(`p2:ttt:${game.id}:${index}`, mark || "·", mark === "X" ? 1 : mark === "O" ? 4 : 2, Boolean(mark) || game.over));
  return {
    content: `<@${game.a}> vs <@${game.b}>`,
    embeds: [embed("Tic-tac-toe", `<@${game.a}> is X. <@${game.b}> is O.\n${note}\nWinner gets 40 Yoru Bux.`)],
    components: [row(cells.slice(0, 3)), row(cells.slice(3, 6)), row(cells.slice(6, 9))],
  };
}

async function ttt(env, game, userId, index) {
  if (userId !== game.turn) return { content: userId === game.a || userId === game.b ? "Wait for your turn." : "You are not in this game." };
  if (game.board[index]) return tttView(game, "That square is taken.");
  const mark = userId === game.a ? "X" : "O";
  game.board[index] = mark;
  game.turn = userId === game.a ? game.b : game.a;
  const winner = tttWinner(game.board);
  if (winner) {
    game.over = true;
    games.delete(game.id);
    const who = winner === "X" ? game.a : game.b;
    const left = await addBux(env, game.guild, who, 40);
    return tttView(game, `<@${who}> wins and has **${left}** Yoru Bux.`);
  }
  if (game.board.every(Boolean)) {
    game.over = true;
    games.delete(game.id);
    return tttView(game, "Draw. Nobody gets paid.");
  }
  return tttView(game, `<@${game.turn}> to move.`);
}

function tttWinner(board) {
  const lines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  return lines.map((line) => board[line[0]] && line.every((index) => board[index] === board[line[0]]) ? board[line[0]] : "").find(Boolean) || "";
}

function cardView(game, note) {
  return {
    content: `<@${game.a}> vs <@${game.b}>`,
    embeds: [embed("High card", `${note}\nWinner gets ${game.pot} Yoru Bux.`)],
    components: game.over ? [] : [row([btn(`p2:card:${game.id}:draw`, "Draw", 1)])],
  };
}

async function highCard(env, game, userId) {
  if (userId !== game.a && userId !== game.b) return { content: "You are not in this game." };
  if (game.drawn[userId]) return cardView(game, "You already drew. Waiting on the other player.");
  game.drawn[userId] = deck().pop();
  if (!game.drawn[game.a] || !game.drawn[game.b]) return cardView(game, `<@${userId}> drew. Waiting on the other card.`);
  games.delete(game.id);
  game.over = true;
  const score = (card) => ranks.indexOf(card.slice(0, -1));
  const as = score(game.drawn[game.a]);
  const bs = score(game.drawn[game.b]);
  let text = `<@${game.a}> drew ${game.drawn[game.a]}. <@${game.b}> drew ${game.drawn[game.b]}.\n`;
  if (as === bs) text += "Same rank. Nobody gets paid."; else {
    const winner = as > bs ? game.a : game.b;
    const left = await addBux(env, game.guild, winner, game.pot);
    text += `<@${winner}> wins and has **${left}** Yoru Bux.`;
  }
  const view = cardView(game, text);
  view.components = [];
  return view;
}

async function broke(env, guildId, userId, need) {
  const have = await balance(env, guildId, userId);
  return { content: `You need ${need} Yoru Bux. You have ${have}. Chat to earn 5 a message.`, components: [] };
}

async function cheer(env, channelId, text) {
  if (!channelId) return;
  await discord(env, `/channels/${channelId}/messages`, "POST", { content: text }).catch(() => {});
}
