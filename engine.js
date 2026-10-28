/* Signal Lab engine: synthetic M5 scenarios + the 3-layer decision logic.
   Data is simulated to illustrate the logic. It is not a backtest result. */
(function (root) {
  "use strict";

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function gauss(r) {
    let u = 0, v = 0;
    while (u === 0) u = r();
    while (v === 0) v = r();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const N = 96;
  const IGN = 62;

  const SCENARIOS = {
    pump: { label: "Real pump", side: "long" },
    fake: { label: "Wick fake-out", side: "long" },
    cover: { label: "Short covering", side: "long" },
    absorb: { label: "Absorption", side: "long" },
    late: { label: "Late entry", side: "long" },
    dump: { label: "Real dump", side: "short" },
  };

  function generate(type, seed) {
    const r = rng(seed);
    const out = [];
    let p = 100, oi = 1000;
    for (let i = 0; i < N; i++) {
      const o = p;
      let drift = 0, sigma = 0.0024, vol = 0.75 + 0.5 * r();
      let buy = 0.5 + (r() - 0.5) * 0.08, book = 0.35 + 0.3 * r();
      let oiCh = (r() - 0.5) * 0.002, wickUp = 0, wickDn = 0;
      const k = i - IGN;

      if (k >= -6 && k < 0 && type !== "late") sigma = 0.0011;

      if (type === "pump" || type === "dump") {
        if (k >= 0) {
          const step = k < 10 ? 0.0075 + 0.0014 * Math.min(k, 5) : (k % 4 === 3 ? -0.007 : 0.0085);
          drift = step;
          vol = Math.max(1.6, 6.4 - k * 0.14) * (0.85 + 0.3 * r());
          buy = Math.max(0.58, 0.76 - k * 0.004);
          oiCh = k < 18 ? 0.009 : 0.002;
          book = 0.82 + 0.1 * r();
          sigma = 0.003;
        }
        if (type === "dump") { drift = -drift; buy = 1 - buy; book = 1 - book; }
      } else if (type === "fake") {
        if (k === 0) { drift = 0.0012; vol = 5.6; buy = 0.7; oiCh = 0.008; book = 0.78; wickUp = 0.014; sigma = 0.0005; }
        else if (k > 0 && k < 6) { drift = -0.0022; vol = 2.2 - k * 0.2; buy = 0.42; sigma = 0.0015; }
      } else if (type === "cover") {
        if (k >= 0 && k < 6) { drift = 0.0075; vol = 2.1 + 0.3 * r(); buy = 0.53; oiCh = -0.011; book = 0.4; sigma = 0.0015; }
        else if (k >= 6) { drift = -0.0012; }
      } else if (type === "absorb") {
        if (k >= -5 && k < 0) { drift = 0.0022; sigma = 0.0008; }
        else if (k >= 0 && k < 5) {
          drift = k === 0 ? 0.0014 : 0; vol = 5.8 + 0.4 * r(); buy = 0.75; oiCh = 0.007; book = 0.7;
          wickUp = k === 0 ? 0.001 : 0; sigma = 0.0004;
        } else if (k >= 5) { drift = -0.0015; }
      } else if (type === "late") {
        if (k >= -30 && k < 0) { drift = 0.0042; vol = 1.0 + 0.3 * r(); buy = 0.55; book = 0.5; sigma = 0.0016; }
        else if (k >= 0 && k < 3) { drift = 0.009; vol = 6.2; buy = 0.76; oiCh = 0.01; book = 0.85; sigma = 0.0015; }
        else if (k >= 3) { drift = -0.004; vol = 2.4; buy = 0.4; }
      }

      if (drift === 0 && k < 0) drift = -(p / 100 - 1) * 0.12;
      const c = o * (1 + drift + gauss(r) * sigma);
      const top = Math.max(o, c), bot = Math.min(o, c);
      const h = top * (1 + Math.abs(gauss(r)) * sigma * 0.5 + wickUp);
      const l = bot * (1 - Math.abs(gauss(r)) * sigma * 0.5 - wickDn);
      oi *= 1 + oiCh;
      out.push({ o, h, l, c, vol, buy, book, oi });
      p = c;
    }
    return out;
  }

  function median(a) {
    const s = a.slice().sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  }

  function context(cs, i) {
    const look = cs.slice(Math.max(0, i - 36), i);
    const rangeHigh = Math.max(...look.map(x => x.h));
    const rangeLow = Math.min(...look.map(x => x.l));
    const atrWin = cs.slice(Math.max(0, i - 30), i);
    const atr = atrWin.reduce((s, x) => s + (x.h - x.l), 0) / atrWin.length;
    const vw = cs.slice(Math.max(0, i - 48), i + 1);
    const vwap = vw.reduce((s, x) => s + x.c * x.vol, 0) / vw.reduce((s, x) => s + x.vol, 0);
    const volBase = median(cs.slice(Math.max(0, i - 48), i).map(x => x.vol));
    return { rangeHigh, rangeLow, atr, vwap, volBase };
  }

  function score(cs, i, side) {
    const x = cs[i], ctx = context(cs, i);
    const L = side === "long";
    const ratio = x.vol / ctx.volBase;
    const share = L ? x.buy : 1 - x.buy;
    const brk = L ? (x.h - ctx.rangeHigh) / ctx.atr : (ctx.rangeLow - x.l) / ctx.atr;
    const oiChg = x.oi / cs[i - 3].oi - 1;
    const pxChg = x.c / cs[i - 3].c - 1;
    const parts = {
      volume: clamp((ratio - 1.5) / 3.5, 0, 1) * 25,
      flow: clamp((share - 0.5) / 0.2, 0, 1) * 25,
      breakout: brk > 0 ? clamp(brk / 0.5, 0, 1) * 20 : 0,
      oi: (L ? pxChg > 0 : pxChg < 0) ? clamp(oiChg / 0.015, 0, 1) * 15 : 0,
      book: (L ? x.book : 1 - x.book) * 15,
    };
    const total = Object.values(parts).reduce((a, b) => a + b, 0);
    return { parts, total, ratio, share, brk, oiChg, ctx };
  }

  const THRESHOLD = 70;

  function filters(cs, i, side, s) {
    const x = cs[i], nx = cs[i + 1], ctx = s.ctx, L = side === "long";
    const level = L ? ctx.rangeHigh : ctx.rangeLow;
    const span = (x.h - x.l) / ctx.atr;
    const dist = (L ? x.c - ctx.vwap : ctx.vwap - x.c) / ctx.atr;
    return [
      { id: "absorb", name: "Absorption check", pass: !(s.ratio > 3 && s.share > 0.65 && span < 1.2),
        why: "Heavy market " + (L ? "buying" : "selling") + ", but price is not moving. A big passive " + (L ? "seller" : "buyer") + " is absorbing it." },
      { id: "close", name: "Close confirmation", pass: L ? x.c > level : x.c < level,
        why: "Candle closed back inside the range. Only the wick broke out." },
      { id: "follow", name: "Follow-through", pass: L ? nx.c > level : nx.c < level,
        why: "Next candle could not hold beyond the level." },
      { id: "late", name: "Late-entry guard", pass: dist < 5, value: dist,
        why: "Price is already " + dist.toFixed(1) + " ATR from VWAP. The easy part of the move is gone." },
      { id: "btc", name: "BTC regime", pass: true, why: "" },
      { id: "crowd", name: "Crowding (funding / OI)", pass: true, why: "" },
      { id: "exec", name: "Spread + slippage", pass: true, why: "" },
    ];
  }

  function evaluate(cs) {
    let peak = { total: -1 };
    for (let i = 50; i < cs.length - 2; i++) {
      for (const side of ["long", "short"]) {
        const s = score(cs, i, side);
        if (s.total > peak.total) peak = Object.assign({ i, side }, s);
        if (s.total >= THRESHOLD && s.brk > 0) {
          const f = filters(cs, i, side, s);
          const failed = f.find(z => !z.pass);
          return {
            i, side, entry: i + 1, score: s, filters: f,
            verdict: failed ? "REJECT" : "TAKE", reason: failed ? failed.why : null,
          };
        }
      }
    }
    return { i: peak.i, side: peak.side, score: peak, filters: null, verdict: "IGNORE",
             reason: "Score peaked at " + Math.round(peak.total) + ", below " + THRESHOLD + "." };
  }

  const EXPECT = { pump: "TAKE:long", fake: "REJECT:close", cover: "IGNORE", absorb: "REJECT:absorb",
                  late: "REJECT:late", dump: "TAKE:short" };

  function outcomeKey(ev) {
    if (ev.verdict === "TAKE") return "TAKE:" + ev.side;
    if (ev.verdict === "REJECT") return "REJECT:" + ev.filters.find(f => !f.pass).id;
    return "IGNORE";
  }

  // Seeds whose simulated outcome matches the scenario it illustrates.
  function seedsFor(type, count, start) {
    const out = [];
    for (let s = start || 1; out.length < count && s < 5000; s++) {
      const cs = generate(type, s), ev = evaluate(cs);
      if (outcomeKey(ev) === EXPECT[type] && (ev.verdict === "IGNORE" || ev.i - IGN <= 1)) out.push(s);
    }
    return out;
  }

  const api = { seedsFor, outcomeKey, EXPECT, generate, evaluate, score, context, SCENARIOS, THRESHOLD, IGN, N };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.SignalEngine = api;
})(this);
