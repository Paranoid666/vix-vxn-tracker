import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import express from "express";
import cron from "node-cron";
import webpush from "web-push";
import https from "node:https";
import { networkInterfaces } from "node:os";
import { getIndex } from "./data.js";
import { buildSignal } from "./signal.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Force a consistent timezone so the daily cron fires at the user's local time.
// Container/cloud defaults to UTC; node-cron uses the process TZ.
if (!process.env.TZ) process.env.TZ = "Asia/Hong_Kong";
const publicDir = path.join(__dirname, "..", "public");
// DATA_DIR lets a container mount a persistent volume so subscription & VAPID
// keys survive restarts/rollouts. Defaults to the project root (local runs).
const dataDir = process.env.DATA_DIR || path.join(__dirname, "..");
fs.mkdirSync(dataDir, { recursive: true });
const keysFile = path.join(dataDir, "vapid-keys.json");
const subsFile = path.join(dataDir, "subscriptions.json");

const PORT = process.env.PORT || 8788;

// ---- VAPID / push config --------------------------------------------------
// Prefer env (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY); otherwise generate once
// and persist to vapid-keys.json so subscriptions survive server restarts.
function getVapidKeys() {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY,
    };
  }
  if (fs.existsSync(keysFile)) {
    return JSON.parse(fs.readFileSync(keysFile, "utf8"));
  }
  const keys = webpush.generateVAPIDKeys();
  fs.writeFileSync(keysFile, JSON.stringify(keys, null, 2));
  console.log("[push] generated new VAPID keys -> vapid-keys.json");
  return keys;
}

const vapid = {
  ...getVapidKeys(),
  subject: process.env.VAPID_SUBJECT || "mailto:tracker@example.com",
};
webpush.setVapidDetails(vapid.subject, vapid.publicKey, vapid.privateKey);

// ---- State ---------------------------------------------------------------
const subscriptions = new Map(); // id -> { id, endpoint, keys, p256dh, auth }
let lastSnapshot = null;

function loadSubscriptions() {
  try {
    if (fs.existsSync(subsFile)) {
      const arr = JSON.parse(fs.readFileSync(subsFile, "utf8"));
      for (const s of arr) subscriptions.set(s.id, s);
    }
  } catch (e) {
    console.warn("[push] could not load subscriptions:", e.message);
  }
}

function persistSubscriptions() {
  try {
    fs.writeFileSync(
      subsFile,
      JSON.stringify([...subscriptions.values()], null, 2)
    );
  } catch (e) {
    console.warn("[push] could not persist subscriptions:", e.message);
  }
}
loadSubscriptions();

// ---- Data fetching with a small in-memory cache ---------------------------
const cache = new Map();
async function loadSnapshot() {
  const [vix, vxn] = await Promise.all([
    getIndex("VIX", ".VIX"),
    getIndex("VXN", ".VXN"),
  ]);
  const signal = buildSignal(vix, vxn);
  const snapshot = {
    vix,
    vxn,
    signal,
    generatedAt: new Date().toISOString(),
  };
  lastSnapshot = snapshot;
  cache.set("snapshot", snapshot);
  return snapshot;
}

async function getCachedSnapshot({ force = false } = {}) {
  if (!force && cache.get("snapshot")) return cache.get("snapshot");
  return loadSnapshot();
}

// Rebuild every 5 minutes during market hours; the cron also refreshes it.
cron.schedule("*/5 * * * *", async () => {
  try {
    await loadSnapshot();
    console.log("[cron] snapshot refreshed");
  } catch (e) {
    console.error("[cron] refresh failed:", e.message);
  }
});

// ---- Daily push ----------------------------------------------------------
function pushMessage(snapshot) {
  const { vix, vxn, signal } = snapshot;
  const v = (x) => (x == null ? "--" : x.toFixed(2));
  const arrow = (c) => (c == null ? "" : c > 0 ? "▲" : c < 0 ? "▼" : "▬");
  return {
    title: `波动率日报 ${new Date().toLocaleDateString("zh-CN")}`,
    body: `VIX ${v(vix.latest?.value)} ${arrow(vix.latest?.change)}${v(vix.latest?.changePct)}%  ·  VXN ${v(vxn.latest?.value)} ${arrow(vxn.latest?.change)}${v(vxn.latest?.changePct)}%\n综合: ${signal.overall.label} (${signal.overall.score})`,
    data: { url: "/?from=push" },
  };
}

async function notifyAll(snapshot) {
  const payload = JSON.stringify(pushMessage(snapshot));
  const results = [];
  for (const sub of subscriptions.values()) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload
      );
      results.push({ id: sub.id, ok: true });
    } catch (err) {
      results.push({ id: sub.id, ok: false, error: err.body || err.message });
      if (err.statusCode === 410 || err.statusCode === 404) {
        subscriptions.delete(sub.id); // subscription expired/gone
      }
    }
  }
  return results;
}

// Fire once at startup (so a fresh install gets a push quickly) and daily at 08:30.
const DAILY_CRON = process.env.DAILY_CRON || "30 8 * * *";
cron.schedule(DAILY_CRON, async () => {
  console.log("[cron] daily push scheduled run");
  try {
    const snap = await loadSnapshot();
    const res = await notifyAll(snap);
    console.log(`[push] daily sent, ok=${res.filter((r) => r.ok).length}/${res.length}`);
  } catch (e) {
    console.error("[push] daily failed:", e.message);
  }
});

// ---- HTTP ----------------------------------------------------------------
const app = express();
app.use(express.json());
app.use(express.static(publicDir));

// Health
app.get("/api/health", (_req, res) => res.json({ ok: true, now: new Date().toISOString() }));

// Full snapshot (data + signal)
app.get("/api/snapshot", async (req, res) => {
  try {
    const force = req.query.force === "1";
    const snap = await getCachedSnapshot({ force });
    res.json(snap);
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

// History-only convenience route
app.get("/api/history/:code", async (req, res) => {
  const code = String(req.params.code).toUpperCase();
  if (code !== "VIX" && code !== "VXN") {
    return res.status(400).json({ error: "code must be VIX or VXN" });
  }
  const snap = await getCachedSnapshot();
  res.json({ code, history: snap[code.toLowerCase()]?.history || [] });
});

// Push subscription
app.post("/api/subscribe", (req, res) => {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys) {
    return res.status(400).json({ error: "invalid subscription" });
  }
  const id = sub.endpoint;
  subscriptions.set(id, { ...sub, id });
  persistSubscriptions();
  res.json({ ok: true, count: subscriptions.size });
});

app.post("/api/unsubscribe", (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) {
    subscriptions.delete(endpoint);
    persistSubscriptions();
  }
  res.json({ ok: true, count: subscriptions.size });
});

// Manual test push (for development)
app.post("/api/test-push", async (req, res) => {
  try {
    const snap = await getCachedSnapshot();
    const results = await notifyAll(snap);
    res.json({ ok: true, results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Last snapshot (for an offline-SPA bootstrap)
app.get("/api/meta", (_req, res) => {
  res.json({
    vapidPublicKey: vapid.publicKey,
    port: PORT,
    subscriptions: subscriptions.size,
  });
});

function lanAddress() {
  const nets = networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}

function start() {
  const scheme = process.env.HTTPS === "1" ? "https" : "http";
  const certPath =
    process.env.TLS_CERT || path.join(__dirname, "..", "certs", "cert.pem");
  const keyPath =
    process.env.TLS_KEY || path.join(__dirname, "..", "certs", "key.pem");

  const handler = () => {
    console.log(
      `VIX/VXN tracker running on ${scheme}://localhost:${PORT} (LAN ${scheme}://${lanAddress()}:${PORT})`
    );
    getCachedSnapshot().then(() => console.log("[boot] snapshot loaded"));
  };

  if (scheme === "https") {
    try {
      const server = https.createServer(
        { key: fs.readFileSync(keyPath), cert: fs.readFileSync(certPath) },
        app
      );
      server.listen(PORT, handler);
    } catch (e) {
      console.error("[https] failed to load certs -> run scripts/gen-cert.ps1 first:", e.message);
      process.exit(1);
    }
  } else {
    app.listen(PORT, handler);
  }
}

start();
