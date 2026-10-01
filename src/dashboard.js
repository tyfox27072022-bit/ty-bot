export function dashboardPage() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Ty Bot · Yoru Lounge</title>
  <style>
    :root { color-scheme: dark; --bg:#090a08; --panel:#14160f; --line:#2c3124; --text:#f4f1e8; --muted:#9c978c; --lime:#d6ff4a; --hot:#ff5a36; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; color: var(--text); background: radial-gradient(800px 320px at 0% 0%, rgba(214,255,74,.14), transparent 55%), var(--bg); font-family: ui-sans-serif, "Segoe UI", system-ui, sans-serif; }
    button, input, select { font: inherit; color: inherit; }
    button { cursor: pointer; }
    .login { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
    .login form { width: min(420px, 100%); background: var(--panel); border: 1px solid var(--line); border-radius: 22px; padding: 28px; }
    .mark { letter-spacing: .18em; text-transform: uppercase; color: var(--lime); font-size: 12px; font-weight: 700; }
    h1, h2 { font-family: Georgia, "Iowan Old Style", serif; font-weight: 500; }
    h1 { font-size: 42px; margin: 8px 0; }
    p { color: var(--muted); line-height: 1.45; }
    label { display: grid; gap: 6px; color: var(--muted); font-size: 13px; }
    input, select { height: 46px; border-radius: 12px; border: 1px solid var(--line); background: #0d0f0b; padding: 0 12px; }
    .primary, .ghost, .danger { height: 46px; border-radius: 12px; padding: 0 14px; border: 1px solid transparent; }
    .primary { background: var(--lime); color: #14160a; font-weight: 750; }
    .ghost { background: transparent; border-color: var(--line); }
    .danger { background: transparent; border-color: #5a2a22; color: #ffb1a1; }
    .stack { display: grid; gap: 10px; }
    .err { min-height: 1.2em; color: var(--hot); }
    .shell { min-height: 100vh; display: grid; grid-template-columns: 240px 1fr; }
    aside { border-right: 1px solid var(--line); padding: 22px 16px; display: flex; flex-direction: column; gap: 16px; background: rgba(0,0,0,.2); }
    nav { display: grid; gap: 6px; }
    nav button { text-align: left; background: transparent; border: 0; color: var(--muted); border-radius: 10px; height: 40px; padding: 0 10px; }
    nav button.on, nav button:hover { background: #1d2118; color: var(--text); }
    main { padding: 28px 22px 64px; max-width: 1100px; }
    header { display: flex; justify-content: space-between; gap: 16px; align-items: end; margin-bottom: 18px; }
    header h1 { margin: 0; font-size: 36px; }
    .stats, .grid, .split { display: grid; gap: 12px; }
    .stats { grid-template-columns: repeat(4, 1fr); }
    .grid { grid-template-columns: 1.2fr .8fr; }
    .card { background: var(--panel); border: 1px solid var(--line); border-radius: 18px; padding: 16px; }
    .stat b { display: block; font-size: 28px; font-family: Georgia, serif; color: var(--text); }
    .stat span, .muted { color: var(--muted); font-size: 13px; }
    .actions, .form { display: flex; flex-wrap: wrap; gap: 8px; }
    .form input, .form select { flex: 1 1 140px; }
    ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
    li { display: flex; justify-content: space-between; gap: 12px; padding-bottom: 8px; border-bottom: 1px solid #23271d; }
    .pill { border: 1px solid var(--line); border-radius: 999px; padding: 2px 8px; color: var(--muted); font-size: 12px; }
    .ok { color: var(--lime); }
    #log { margin-top: 14px; display: grid; gap: 6px; }
    #log div { color: var(--muted); font-size: 13px; }
    .hide { display: none; }
    @media (max-width: 860px) {
      .shell { grid-template-columns: 1fr; }
      aside { border-right: 0; border-bottom: 1px solid var(--line); }
      .stats, .grid { grid-template-columns: 1fr; }
      header { display: grid; }
    }
  </style>
</head>
<body>
  <div class="login" id="login">
    <form class="stack">
      <div class="mark">Ty Bot</div>
      <h1>Yoru Lounge</h1>
      <p>Staff control room. The password stays on this site. The Discord token never reaches the browser.</p>
      <label>Password <input id="key" type="password" autocomplete="current-password" placeholder="Password" /></label>
      <p class="err" id="login-error"></p>
      <button class="primary" type="submit">Sign in</button>
    </form>
  </div>
  <div class="shell hide" id="app">
    <aside>
      <div>
        <div class="mark">Ty Bot</div>
        <h2 id="bot-name" style="margin:8px 0 0">Yoru Lounge</h2>
      </div>
      <nav>
        <button type="button" class="on" data-tab="home">Overview</button>
        <button type="button" data-tab="mod">Moderation</button>
        <button type="button" data-tab="server">Server</button>
        <button type="button" data-tab="help">Commands</button>
      </nav>
      <button class="ghost" id="signout" type="button">Sign out</button>
    </aside>
    <main>
      <header>
        <div>
          <div class="mark">Server</div>
          <h1 id="server-name">Yoru Lounge</h1>
        </div>
        <select id="guild"></select>
      </header>
      <section id="home">
        <div class="stats">
          <div class="card stat"><b id="members">—</b><span>Members</span></div>
          <div class="card stat"><b id="online">—</b><span>Online</span></div>
          <div class="card stat"><b id="verifies">—</b><span>Verifications saved</span></div>
          <div class="card stat"><b id="filters">—</b><span>AutoMod filters</span></div>
        </div>
        <div class="grid" style="margin-top:12px">
          <div class="card">
            <h2>Run the server</h2>
            <p>Sync slash commands, rebuild the layout, or post the rule embeds again.</p>
            <div class="actions">
              <button class="primary" id="sync" type="button">Sync commands</button>
              <button class="ghost" id="rules" type="button">Post member rules</button>
              <button class="ghost" id="staff" type="button">Post staff rules</button>
              <button class="danger" id="setup" type="button">Rebuild setup</button>
            </div>
          </div>
          <div class="card">
            <h2>Filters</h2>
            <ul id="automod"></ul>
          </div>
        </div>
      </section>
      <section id="mod" class="hide">
        <div class="card">
          <h2>Punish a member</h2>
          <p>Use a Discord user ID. Timeout needs a duration like 10m, 1h, 1d, or 7d.</p>
          <div class="form">
            <input id="user" placeholder="User ID" />
            <select id="action">
              <option value="warn">Warn</option>
              <option value="timeout">Timeout</option>
              <option value="kick">Kick</option>
              <option value="ban">Ban</option>
              <option value="unban">Unban</option>
              <option value="untimeout">Clear timeout</option>
            </select>
            <input id="duration" value="10m" placeholder="10m" />
            <input id="reason" placeholder="Reason" />
            <button class="primary" id="go" type="button">Run action</button>
          </div>
        </div>
      </section>
      <section id="server" class="hide">
        <div class="grid">
          <div class="card"><h2>Channels</h2><ul id="channels"></ul></div>
          <div class="card"><h2>Roles</h2><ul id="roles"></ul></div>
        </div>
      </section>
      <section id="help" class="hide">
        <div class="card">
          <h2>Commands in Discord</h2>
          <ul>
            <li><span>/lookup @user</span><span class="pill">Staff</span></li>
            <li><span>/logs</span><span class="pill">Owner</span></li>
            <li><span>/mod ban, kick, timeout, warn</span><span class="pill">Staff</span></li>
            <li><span>/server lock, purge, slowmode, rules</span><span class="pill">Staff</span></li>
            <li><span>Verify button</span><span class="pill">Members</span></li>
            <li><span>Tickets</span><span class="pill">Support, report, purchase</span></li>
          </ul>
        </div>
      </section>
      <div id="log"></div>
    </main>
  </div>
<script>
  const loginError = document.getElementById("login-error");
  const log = document.getElementById("log");
  const say = (value) => {
    const line = document.createElement("div");
    line.textContent = typeof value === "string" ? value : JSON.stringify(value);
    log.prepend(line);
  };
  async function api(path, body) {
    const headers = {};
    const token = sessionStorage.getItem("ty_token");
    if (token) headers.Authorization = "Bearer " + token;
    if (body) headers["Content-Type"] = "application/json";
    const response = await fetch(path, { method: body ? "POST" : "GET", headers, body: body ? JSON.stringify(body) : undefined });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || response.statusText);
    return data;
  }
  async function signIn() {
    loginError.textContent = "Signing in...";
    try {
      const data = await api("/api/login", { key: document.getElementById("key").value });
      if (!data.token) throw new Error("Sign in failed.");
      sessionStorage.setItem("ty_token", data.token);
      await boot();
    } catch (error) {
      loginError.textContent = error.message || "Could not sign in.";
    }
  }
  document.querySelector("#login form").onsubmit = (event) => { event.preventDefault(); signIn(); };
  async function boot() {
    const data = await api("/api/guilds");
    const select = document.getElementById("guild");
    select.innerHTML = data.guilds.map((guild) => '<option value="' + guild.id + '">' + guild.name + '</option>').join("");
    document.getElementById("bot-name").textContent = data.bot;
    document.getElementById("login").classList.add("hide");
    document.getElementById("app").classList.remove("hide");
    await loadOverview();
    say("Signed in as " + data.bot);
  }
  const guildId = () => document.getElementById("guild").value;
  async function loadOverview() {
    const data = await api("/api/guilds/" + guildId());
    document.getElementById("server-name").textContent = data.name;
    document.getElementById("members").textContent = data.members ?? "—";
    document.getElementById("online").textContent = data.online ?? "—";
    document.getElementById("verifies").textContent = data.verifies ?? 0;
    document.getElementById("filters").textContent = (data.automod || []).filter((rule) => rule.enabled).length;
    document.getElementById("automod").innerHTML = (data.automod || []).map((rule) => '<li><span>' + rule.name.replace("Ty Bot ", "") + '</span><span class="' + (rule.enabled ? "ok" : "") + '">' + (rule.enabled ? "On" : "Off") + '</span></li>').join("") || "<li>No filters</li>";
    document.getElementById("channels").innerHTML = data.channels.map((channel) => '<li><span>' + channel.name + '</span><span class="pill">' + (channel.parent || channel.type) + '</span></li>').join("");
    document.getElementById("roles").innerHTML = data.roles.map((role) => '<li><span>' + role.name + '</span></li>').join("");
  }
  document.getElementById("guild").onchange = () => loadOverview().catch((error) => say(error.message));
  document.querySelectorAll("nav button").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("nav button").forEach((item) => item.classList.remove("on"));
      button.classList.add("on");
      ["home", "mod", "server", "help"].forEach((id) => document.getElementById(id).classList.toggle("hide", id !== button.dataset.tab));
    };
  });
  const run = (path, body, ok) => api(path, body).then((data) => say(data.message || ok)).catch((error) => say(error.message));
  document.getElementById("sync").onclick = () => run("/api/guilds/" + guildId() + "/sync", {}, "Commands synced.");
  document.getElementById("rules").onclick = () => run("/api/guilds/" + guildId() + "/post", { kind: "rules" }, "Member rules posted.");
  document.getElementById("staff").onclick = () => run("/api/guilds/" + guildId() + "/post", { kind: "staff" }, "Staff rules posted.");
  document.getElementById("setup").onclick = () => {
    if (!confirm("Rebuild roles, channels, and filters on this server?")) return;
    run("/api/guilds/" + guildId() + "/setup", {}, "Setup finished.");
  };
  document.getElementById("go").onclick = () => run("/api/guilds/" + guildId() + "/mod", {
    action: document.getElementById("action").value,
    userId: document.getElementById("user").value.trim(),
    reason: document.getElementById("reason").value,
    duration: document.getElementById("duration").value
  }, "Action sent.");
  document.getElementById("signout").onclick = () => {
    sessionStorage.removeItem("ty_token");
    document.getElementById("app").classList.add("hide");
    document.getElementById("login").classList.remove("hide");
    loginError.textContent = "";
  };
  api("/api/guilds").then(boot).catch(() => {});
</script>
</body>
</html>`;
}
