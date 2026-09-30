import fs from "node:fs";
import http from "node:http";
import { verifyPage } from "./index.js";

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

const server = http.createServer(async (req, res) => {
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const host = req.headers.host || "localhost";
    const url = new URL(req.url || "/", `https://${host}`);
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : String(value));
    }
    const request = new Request(url, {
      method: req.method,
      headers,
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const response = url.pathname === "/verify" ? await verifyPage(request, env, url) : new Response("Ty Bot verify", { status: 404 });
    res.writeHead(response.status, { "content-type": response.headers.get("content-type") || "text/plain" });
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    res.writeHead(500, { "content-type": "text/plain" });
    res.end(error.message || "error");
  }
});

server.listen(8787, "127.0.0.1", () => console.log("verify site listening on 8787"));
