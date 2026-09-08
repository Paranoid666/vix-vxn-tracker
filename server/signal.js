// Signal engine: turns VIX / VXN observations into a transparent Buy / Sell /
// Neutral score. This is an educational, rule-based model -- not financial
// advice. It scores "volatility direction" (risking vol products / hedges).
//
// Score range: -100 (strongly expect vol to FALL -> SELL vol) .. +100
// (strongly expect vol to RISE -> BUY vol). Drivers:
//   * historical percentile (mean reversion)
//   * z-score vs its own recent series
//   * 5-day momentum
//   * the VXN/VIX spread (tech vs broad risk premium)

function mean(arr) {
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function std(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

function percentileRank(arr, value) {
  if (!arr.length) return 50;
  const below = arr.filter((v) => v <= value).length;
  return (below / arr.length) * 100;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// Single-index score from its own series. Returns -100..+100 volatility-bullish.
function scoreIndex(history, latestValue) {
  if (!latestValue || !history || history.length < 8) {
    return { score: 0, confidence: 0 };
  }
  const closes = history.map((d) => d.close);
  const value = latestValue;

  // 1) Percentile vs trailing 1-year (approx last 252 rows).
  const window = closes.slice(-252);
  const pct = percentileRank(window, value);
  // Low percentile (calm, complacent) -> expect REVERSION UP (bullish vol).
  // High percentile (panic) -> expect REVERSION DOWN (bearish vol).
  const pctSignal = clamp((50 - pct) * 2, -100, 100); // pct=0 -> +100, pct=100 -> -100

  // 2) z-score of the value within the recent window.
  const m = mean(closes.slice(-40));
  const s = std(closes.slice(-40));
  const z = s === 0 ? 0 : (value - m) / s;
  // z high -> stretched high -> bearish reversion; z low -> stretched low -> bullish.
  const zSignal = clamp(-z * 35, -100, 100);

  // 3) 5-day momentum (direction of the move).
  const five = closes[closes.length - 6];
  const momentum =
    five && five > 0 ? ((value - five) / five) * 100 : 0;
  // Recent up-move = immediate momentum bullish (for trend followers); weight lighter.
  const momSignal = clamp(momentum * 4, -40, 40);

  const score = clamp(pctSignal * 0.5 + zSignal * 0.35 + momSignal, -100, 100);

  // Confidence: how far the score sits from neutral and how much the drivers agree.
  const drivers = [pctSignal, zSignal, momSignal];
  const signAgree =
    drivers.filter((d) => Math.sign(d) === Math.sign(score)).length / drivers.length;
  const confidence = clamp(
    (Math.abs(score) / 100) * 60 + signAgree * 40,
    0,
    100
  );

  return { score, confidence };
}

// Cross-index signal: relative risk premium of tech (VXN) over broad market (VIX).
function spreadSignal(vix, vxn) {
  if (!vix || !vxn) return { spreadPts: null, percentile: null, note: "" };
  const spreadPts = vxn.value - vix.value;
  const spreadPct =
    vix.value > 0 ? (spreadPts / vix.value) * 100 : null;
  return {
    spreadPts,
    spreadPct,
    note:
      spreadPct && spreadPct > 40
        ? "科技板块相对大盘波动率溢价偏高"
        : spreadPct && spreadPct < 20
          ? "科技板块相对大盘溢价温和"
          : "科技板块相对大盘溢价处于常态区间",
  };
}

function classify(score) {
  if (score >= 30) return { action: "Buy", level: score, label: "看多波动率" };
  if (score <= -30) return { action: "Sell", level: score, label: "看空波动率" };
  return { action: "Neutral", level: score, label: "中性观望" };
}

export function buildSignal(vix, vxn) {
  const vixSig = scoreIndex(vix.history, vix.latest?.value);
  const vxnSig = scoreIndex(vxn.history, vxn.latest?.value);
  const spread = spreadSignal(vix.latest, vxn.latest);

  // Overall = blend of both indices' reversion signals + a nudge from the cross
  // spread when it is highly stretched (tech fear beta).
  let overall =
    vixSig.score * 0.5 +
    vxnSig.score * 0.5 +
    (spread.spreadPct && spread.spreadPct > 60
      ? 12
      : spread.spreadPct && spread.spreadPct < 15
        ? -8
        : 0);
  overall = clamp(overall, -100, 100);

  const overallConfidence = Math.round(
    (vixSig.confidence + vxnSig.confidence) / 2
  );

  return {
    overall: { ...classify(overall), score: Math.round(overall), confidence: overallConfidence },
    vix: { ...classify(vixSig.score), score: Math.round(vixSig.score), confidence: Math.round(vixSig.confidence) },
    vxn: { ...classify(vxnSig.score), score: Math.round(vxnSig.score), confidence: Math.round(vxnSig.confidence) },
    spread,
    rules: [
      "历史分位: 极低波动率预期反向回升(看多), 极端恐慌预期回落(看空)",
      "Z值: 价格相对自身均值偏离越远, 回归均值动力越强",
      "5日动量: 短期趋势方向的顺势加成",
      "VXN/VIX 溢价: 衡量科技股相对大盘的风险溢价",
    ],
    disclaimer:
      "本信号由规则模型生成, 仅用于教育和信息参考, 不构成投资建议。波动率产品风险较高, 请自行判断。",
  };
}
