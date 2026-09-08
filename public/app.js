const $ = (id) => document.getElementById(id);
const fmt = (v, d = 2) => (v == null ? "--" : Number(v).toFixed(d));
const sign = (v) => (v > 0 ? "+" : v < 0 ? "" : "");

const charts = {};

function renderChart(containerId, code, history) {
  const canvas = document.querySelector(`#${containerId} canvas`);
  const ctx = canvas?.getContext("2d");
  if (!ctx) return;

  const labels = history.map((d) => d.date);
  const data = history.map((d) => d.close);
  const color = code === "VIX" ? "#4c8df6" : "#a06cf6";

  if (charts[containerId]) charts[containerId].destroy();
  charts[containerId] = new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          data,
          borderColor: color,
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          fill: true,
          backgroundColor: (c) => {
            const g = c.chart.ctx.createLinearGradient(0, 0, 0, 120);
            g.addColorStop(0, color + "55");
            g.addColorStop(1, color + "00");
            return g;
          },
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: { legend: { display: false }, tooltip: { enabled: true } },
      scales: {
        x: { display: false },
        y: { display: false, min: Math.min(...data) * 0.98, max: Math.max(...data) * 1.02 },
      },
      interaction: { intersect: false, mode: "index" },
    },
  });
}

function setBadge(el, action, label) {
  el.textContent = label || action;
  el.className = "badge " + action.toLowerCase();
}

function applyChange(el, change, pct) {
  el.textContent = `${sign(change)}${fmt(change)}  (${sign(pct)}${fmt(pct)}%)`;
  el.className = "change " + (change > 0 ? "up" : change < 0 ? "down" : "flat");
}

function renderSignal(signal) {
  const { overall, vix, vxn, spread } = signal;

  setBadge($("vix-badge"), vix.action, `${vix.label} ${vix.score}`);
  $("vix-conf").textContent = `置信度 ${vix.confidence} %`;

  setBadge($("vxn-badge"), vxn.action, `${vxn.label} ${vxn.score}`);
  $("vxn-conf").textContent = `置信度 ${vxn.confidence} %`;

  const ob = $("overall-badge");
  ob.textContent = overall.label;
  ob.className = "overall-badge " + overall.action.toLowerCase();
  $("overall-score").textContent = overall.score;
  $("overall-conf").textContent = `置信度 ${overall.confidence} %`;

  // Map -100..100 to width 0..100% for the meter fill.
  $("overall-meter").style.width = `${((overall.score + 100) / 200) * 100}%`;

  if (spread && spread.spreadPts != null) {
    $("spread-note").textContent =
      `VXN/VIX 溢价 ${fmt(spread.spreadPts)} 点 (${fmt(spread.spreadPct, 1)}%)\n${spread.note}`;
  }

  const rules = $("rules");
  rules.innerHTML = "";
  signal.rules.forEach((r) => {
    const li = document.createElement("li");
    li.textContent = r;
    rules.appendChild(li);
  });
  $("disclaimer").textContent = signal.disclaimer;
}

async function loadSnapshot(force = false) {
  setStatus("更新中…");
  try {
    const res = await fetch(`/api/snapshot${force ? "?force=1" : ""}`);
    if (!res.ok) throw new Error("API " + res.status);
    const snap = await res.json();

    const vix = snap.vix.latest ?? {};
    const vxn = snap.vxn.latest ?? {};

    $("vix-price").textContent = fmt(vix.value);
    applyChange($("vix-change"), vix.change, vix.changePct);
    $("vix-range").textContent =
      `今开 ${fmt(vix.open)}  高点 ${fmt(vix.high)}  低点 ${fmt(vix.low)}`;

    $("vxn-price").textContent = fmt(vxn.value);
    applyChange($("vxn-change"), vxn.change, vxn.changePct);
    $("vxn-range").textContent =
      `今开 ${fmt(vxn.open)}  高点 ${fmt(vxn.high)}  低点 ${fmt(vxn.low)}`;

    renderChart("vix-chart", "VIX", snap.vix.history.slice(-30));
    renderChart("vxn-chart", "VXN", snap.vxn.history.slice(-30));
    renderSignal(snap.signal);

    $("update-time").textContent = "更新 " + new Date(snap.generatedAt).toLocaleTimeString("zh-CN");
    setStatus(
      vix.source === "live"
        ? `实时 · ${vix.time ? new Date(vix.time).toLocaleString("zh-CN") : ""}`
        : "按最新收盘"
    );
    return snap;
  } catch (e) {
    setStatus("获取失败, 请检查网络", true);
    console.error(e);
  }
}

function setStatus(text, isError = false) {
  $("status-text").textContent = text;
  $("status-bar").className = "status-bar" + (isError ? " error" : "");
}

// ---- Push notification ------------------------------------------------
async function getRegistration() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg;
}

async function updatePushState() {
  const reg = await getRegistration();
  if (!reg) return;
  const sub = await reg.pushManager.getSubscription();
  const on = !!sub;
  $("push-toggle").textContent = on ? "推送已开启 ✔" : "开启每日推送";
  $("push-toggle").classList.toggle("active", on);
}

async function subscribe() {
  const reg = await getRegistration();
  if (!reg) {
    alert("请稍等, 服务尚未就绪, 再试一次。");
    return;
  }
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const meta = await (await fetch("/api/meta")).json();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(meta.vapidPublicKey),
    });
  }
  await fetch("/api/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });
  updatePushState();
}

function urlBase64ToUint8Array(base64) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// ---- Install prompt (PWA) --------------------------------------------
let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredPrompt = e;
  $("install-banner").classList.remove("hidden");
});
$("install-btn").addEventListener("click", async () => {
  if (deferredPrompt) {
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
  }
  $("install-banner").classList.add("hidden");
});

// ---- Wire up ---------------------------------------------------------
$("refresh-btn").addEventListener("click", () => loadSnapshot(true));
$("push-toggle").addEventListener("click", subscribe);
$("push-btn").addEventListener("click", subscribe);

// Bootstrap
loadSnapshot();
setInterval(() => loadSnapshot(), 5 * 60 * 1000); // auto-refresh every 5 min
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(() => updatePushState());
}
window.addEventListener("focus", () => loadSnapshot(false));
