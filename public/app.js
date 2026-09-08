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
      layout: { padding: { top: 6, bottom: 2 } },
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

// Draw the filling arc + needle on the half-circle gauge. score is -100..+100.
function drawGauge(score) {
  const arc = $("gauge-arc");
  const needle = $("gauge-needle");
  if (!arc || !needle) return;

  const cx = 100, cy = 110, r = 80;
  const pct = (score + 100) / 200; // 0..1, default 0.5 (neutral)
  // Map score range to angle from -90deg (left) to +90deg (right).
  const startDeg = -90;
  const endDeg = -90 + pct * 180;
  const largeArc = endDeg - startDeg > 180 ? 1 : 0;

  const polar = (deg) => {
    const rad = (deg * Math.PI) / 180;
    return [cx + r * Math.cos(rad), cy + r * Math.sin(rad)];
  };
  const [x1, y1] = polar(startDeg);
  const [x2, y2] = polar(endDeg);

  // Only draw when there's actual fill; otherwise reset to empty path.
  if (pct > 0.001) {
    const sweep = 1; // always clockwise from left
    arc.setAttribute("d", `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${largeArc} ${sweep} ${x2.toFixed(2)} ${y2.toFixed(2)}`);
  } else {
    arc.setAttribute("d", "");
  }

  // Needle (pointer) points along the arc's end angle, slightly inset.
  const nr = r - 2;
  const [nx, ny] = polar(endDeg);
  // Normalize the needle rotation around the hub so it's simple & reliable.
  needle.setAttribute("x1", cx);
  needle.setAttribute("y1", cy);
  needle.setAttribute("x2", cx + (nx - cx) * 0.95);
  needle.setAttribute("y2", cy + (ny - cy) * 0.95);
}

function renderSignal(signal) {
  const { overall, vix, vxn, spread } = signal;

  setBadge($("vix-badge"), vix.action, `${vix.label} ${vix.score}`);
  $("vix-conf").textContent = `置信度 ${vix.confidence}%`;
  // Position on the -100..+100 -> 0..100% strength bar.
  $("vix-pos").style.left = `${((vix.score + 100) / 200) * 100}%`;
  $("vix-badge").className = "sig-badge " + vix.action.toLowerCase();

  setBadge($("vxn-badge"), vxn.action, `${vxn.label} ${vxn.score}`);
  $("vxn-conf").textContent = `置信度 ${vxn.confidence}%`;
  $("vxn-pos").style.left = `${((vxn.score + 100) / 200) * 100}%`;
  $("vxn-badge").className = "sig-badge " + vxn.action.toLowerCase();

  // Overall label + score.
  $("overall-score").textContent = overall.score;
  $("overall-label").textContent = `/100 · ${overall.label}`;
  $("overall-conf").textContent = `置信度 ${overall.confidence}%`;

  drawGauge(overall.score);

  if (spread && spread.spreadPts != null) {
    $("spread-note").textContent = `${fmt(spread.spreadPts)} 点 (${fmt(spread.spreadPct, 1)}%)`;
    const rank = $("spread-rank");
    if (rank) {
      rank.textContent =
        spread.spreadPct > 40 ? "历史分位 ↑ 偏高" : spread.spreadPct < 20 ? "历史分位 ↓ 偏低" : "历史分位 ● 常态";
    }
    const desc = $("spread-desc");
    if (desc) desc.textContent = spread.note;
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
    $("vix-price").className = "value " + (vix.change > 0 ? "up" : vix.change < 0 ? "down" : "");
    applyChange($("vix-change"), vix.change, vix.changePct);
    $("vix-range").textContent = `今开 ${fmt(vix.open)}   高 ${fmt(vix.high)}   低 ${fmt(vix.low)}`;

    $("vxn-price").textContent = fmt(vxn.value);
    $("vxn-price").className = "value " + (vxn.change > 0 ? "up" : vxn.change < 0 ? "down" : "");
    applyChange($("vxn-change"), vxn.change, vxn.changePct);
    $("vxn-range").textContent = `今开 ${fmt(vxn.open)}   高 ${fmt(vxn.high)}   低 ${fmt(vxn.low)}`;

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

// Bottom nav tabs: switch the active highlight and scroll to the target area.
const tabTargets = {
  market: () => document.querySelector(".gauge-card"),
  signal: () => $("spread-card") || document.querySelector(".panel"),
  settings: () => document.querySelector(".panel"),
};
document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    const tab = item.dataset.tab;
    if (!tab) return;
    document.querySelectorAll(".nav-item").forEach((n) => n.classList.remove("on"));
    item.classList.add("on");
    const target = tabTargets[tab] && tabTargets[tab]();
    if (target && target.scrollIntoView) target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

// Bootstrap
loadSnapshot();
setInterval(() => loadSnapshot(), 5 * 60 * 1000); // auto-refresh every 5 min
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").then(() => updatePushState());
}
window.addEventListener("focus", () => loadSnapshot(false));
