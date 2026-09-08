// Data layer: pulls VIX & VXN from Cboe official history CSV (reliable, stable
// OHLC daily data) plus a live intraday reading from the CNBC exchange feed.

const base = "https://cdn.cboe.com/api/global/us_indices/daily_prices";

const STATIC_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "text/csv,application/json;q=0.9,*/*;q=0.8",
};

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const dateIdx = header.map((h) => h.trim().toLowerCase()).indexOf("date");
  const closeIdx = header.map((h) => h.trim().toLowerCase()).indexOf("close");
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = lines[i].split(",");
    if (parts.length <= Math.max(dateIdx, closeIdx)) continue;
    const date = parts[dateIdx]?.trim();
    const close = Number.parseFloat(parts[closeIdx]);
    if (!date || Number.isNaN(close)) continue;
    out.push({ date, close });
  }
  return out;
}

// Fetch full daily history for a Cboe index code (VIX / VXN).
export async function fetchHistory(code) {
  const url = `${base}/${code}_History.csv`;
  const res = await fetch(url, { headers: STATIC_HEADERS });
  if (!res.ok) throw new Error(`${code} history HTTP ${res.status}`);
  const text = await res.text();
  return parseCsv(text);
}

// Live-ish intraday reading from CNBC exchange feed (works without an API key).
// symbol is e.g. ".VIX" or ".VXN".
export async function fetchLiveQuote(symbol) {
  const url =
    "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol" +
    `?symbols=${encodeURIComponent(symbol)}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`;
  const res = await fetch(url, { headers: STATIC_HEADERS });
  if (!res.ok) throw new Error(`${symbol} quote HTTP ${res.status}`);
  const json = await res.json();
  const q = json?.FormattedQuoteResult?.FormattedQuote?.[0];
  if (!q) throw new Error(`${symbol} quote payload missing`);
  return {
    last: Number.parseFloat(q.last),
    change: Number.parseFloat(q.change),
    changePct: Number.parseFloat(q.change_pct),
    prevClose: Number.parseFloat(q.previous_day_closing),
    open: Number.parseFloat(q.open),
    high: Number.parseFloat(q.high),
    low: Number.parseFloat(q.low),
    time: q.last_time || null,
    marketStatus: q.curmktstatus || null,
  };
}

// Combine both: return daily history + an authoritative "latest" number that
// prefers the live intraday reading and falls back to the last official close.
export async function getIndex(code, liveSymbol) {
  const [history, live] = await Promise.all([
    fetchHistory(code),
    fetchLiveQuote(liveSymbol).catch(() => null),
  ]);

  const lastDaily = history[history.length - 1] || null;
  let latest = null;
  if (live && !Number.isNaN(live.last) && live.last > 0) {
    latest = {
      value: live.last,
      change: live.change,
      changePct: live.changePct,
      prevClose: live.prevClose,
      open: live.open,
      high: live.high,
      low: live.low,
      time: live.time,
      source: "live",
    };
  } else if (lastDaily) {
    const prev = history[history.length - 2] || null;
    const prevClose = prev ? prev.close : lastDaily.close;
    const change = lastDaily.close - prevClose;
    latest = {
      value: lastDaily.close,
      change,
      changePct: prevClose ? (change / prevClose) * 100 : 0,
      prevClose,
      open: lastDaily.close,
      high: lastDaily.close,
      low: lastDaily.close,
      time: null,
      source: "close",
    };
  }

  return {
    code,
    history,
    latest,
    lastDaily,
    updatedAt: new Date().toISOString(),
  };
}
