export function dashboardPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ty Bot</title>
  <style>
    :root { color-scheme: dark; }
    body { margin: 0; font-family: Outfit, ui-sans-serif, system-ui, sans-serif; background: #101114; color: #f4f1ea; }
    main { max-width: 760px; margin: 0 auto; padding: 32px 16px 64px; }
    h1 { font-family: Georgia, serif; font-weight: 500; font-size: 40px; margin: 0 0 8px; }
    p, li { color: #9b968c; line-height: 1.5; }
    button, input, select { height: 44px; border-radius: 10px; border: 1px solid #2c3138; background: #21262d; color: #f4f1ea; padding: 0 12px; font: inherit; }
    button { background: #d6ff4a; color: #14160a; font-weight: 650; cursor: pointer; }
    .row { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
    .card { border: 1px solid #2c3138; background: #181b20; border-radius: 14px; padding: 16px; margin-top: 16px; }
    pre { white-space: pre-wrap; color: #f4f1ea; }
  </style>
</head>
<body>
<main>
  <h1>Ty Bot</h1>
  <p>Yoru AI control room. This page talks to Discord with the bot token stored on Cloudflare. The token never reaches the browser.</p>
  <div class="card" id="login">
    <p>Dashboard key</p>
    <div class="row">
      <input id="key" type="password" placeholder="DASHBOARD_KEY" />
      <button id="enter" type="button">Enter</button>
    </div>
  </div>
  <div class="card" id="app" hidden>
    <label>Server<br /><select id="guild"></select></label>
    <div class="row">
      <button id="sync" type="button">Sync commands</button>
      <button id="setup" type="button">Run setup</button>
      <button id="rules" type="button">Post rules</button>
      <button id="staff" type="button">Post staff rules</button>
    </div>
    <div class="row">
      <input id="user" placeholder="User ID" />
      <select id="action">
        <option value="warn">Warn</option>
        <option value="timeout">Timeout</option>
        <option value="kick">Kick</option>
        <option value="ban">Ban</option>
        <option value="unban">Unban</option>
        <option value="untimeout">Clear timeout</option>
      </select>
      <input id="duration" placeholder="10m" value="10m" />
      <input id="reason" placeholder="Reason" />
      <button id="go" type="button">Run</button>
    </div>
    <pre id="out"></pre>
  </div>
</main>
<script>
  const out = document.getElementById("out");
  const say = (value) => { out.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2); };
  async function api(path, body) {
    const response = await fetch(path, { method: body ? "POST" : "GET", headers: body ? { "Content-Type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  }
  document.getElementById("enter").onclick = async () => {
    try {
      await api("/api/login", { key: document.getElementById("key").value });
      await boot();
    } catch (error) { say(error.message); }
  };
  async function boot() {
    const data = await api("/api/guilds");
    const select = document.getElementById("guild");
    select.innerHTML = data.guilds.map((guild) => '<option value="' + guild.id + '">' + guild.name + '</option>').join("");
    document.getElementById("login").hidden = true;
    document.getElementById("app").hidden = false;
    say("Signed in as " + data.bot);
  }
  const guildId = () => document.getElementById("guild").value;
  document.getElementById("sync").onclick = () => api("/api/guilds/" + guildId() + "/sync", {}).then(say).catch((error) => say(error.message));
  document.getElementById("setup").onclick = () => api("/api/guilds/" + guildId() + "/setup", {}).then(say).catch((error) => say(error.message));
  document.getElementById("rules").onclick = () => api("/api/guilds/" + guildId() + "/post", { kind: "rules" }).then(say).catch((error) => say(error.message));
  document.getElementById("staff").onclick = () => api("/api/guilds/" + guildId() + "/post", { kind: "staff" }).then(say).catch((error) => say(error.message));
  document.getElementById("go").onclick = () => api("/api/guilds/" + guildId() + "/mod", {
    action: document.getElementById("action").value,
    userId: document.getElementById("user").value.trim(),
    reason: document.getElementById("reason").value,
    duration: document.getElementById("duration").value
  }).then(say).catch((error) => say(error.message));
  api("/api/guilds").then(boot).catch(() => {});
</script>
</body>
</html>`;
}
