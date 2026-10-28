(function () {
  "use strict";
  const E = window.SignalEngine;
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- theme tokens + canvas helpers ---------- */
  let T = {};
  function readTokens() {
    const cs = getComputedStyle(document.documentElement);
    ["fg", "muted", "line", "line2", "blue", "signal", "signal-ink", "up", "down", "grid", "solid", "bg"]
      .forEach(k => { T[k] = cs.getPropertyValue("--" + k).trim(); });
  }
  readTokens();

  function fit(cv) {
    const r = cv.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(r.width)), h = Math.max(1, Math.round(r.height));
    if (cv.width !== w * dpr || cv.height !== h * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function alpha(color, a) {
    if (color.startsWith("#")) {
      const n = parseInt(color.slice(1), 16);
      return "rgba(" + (n >> 16 & 255) + "," + (n >> 8 & 255) + "," + (n & 255) + "," + a + ")";
    }
    return color;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function prep(type, seed) {
    const cs = E.generate(type, seed);
    const ev = E.evaluate(cs);
    const vwap = cs.map((_, i) => i < 20 ? null : E.context(cs, i).vwap);
    let lo = Infinity, hi = -Infinity;
    cs.forEach(c => { lo = Math.min(lo, c.l); hi = Math.max(hi, c.h); });
    return { type, seed, cs, ev, vwap, lo, hi, maxVol: Math.max(...cs.map(c => c.vol)) };
  }

  /* ---------- chart ---------- */
  function drawChart(cv, S, upto, opt) {
    opt = opt || {};
    const { ctx, w, h } = fit(cv);
    const cs = S.cs, ev = S.ev, n = cs.length;
    const padL = 12, padR = 54, padT = 22, padB = 10;
    const volH = Math.round(h * 0.2);
    const ph = h - padT - padB - volH - 8;
    const span = S.hi - S.lo, lo = S.lo - span * 0.06, hi = S.hi + span * 0.1;
    const slot = (w - padL - padR) / n;
    const bw = Math.max(1.4, slot * 0.62);
    const x = i => padL + slot * i + slot / 2;
    const y = p => padT + (1 - (p - lo) / (hi - lo)) * ph;
    const base = cs[0].o;

    // grid + % labels
    ctx.font = "500 10.5px 'JetBrains Mono', monospace";
    ctx.textBaseline = "middle";
    const ticks = 4;
    for (let t = 0; t <= ticks; t++) {
      const p = lo + (hi - lo) * (t / ticks);
      const yy = Math.round(y(p)) + 0.5;
      ctx.strokeStyle = T.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR + 6, yy); ctx.stroke();
      ctx.fillStyle = T.muted;
      const pct = (p / base - 1) * 100;
      ctx.fillText((pct >= 0 ? "+" : "") + pct.toFixed(1) + "%", w - padR + 10, yy);
    }

    const shown = Math.min(upto, n);
    const hasEv = ev && ev.verdict !== "IGNORE" && shown > ev.i;

    // event band
    if (hasEv) {
      ctx.fillStyle = alpha(T.signal, 0.12);
      ctx.fillRect(x(ev.i) - slot / 2, padT - 8, slot * 2, ph + volH + 16);
    }

    // range level
    if (hasEv) {
      const lvl = ev.side === "long" ? ev.score.ctx.rangeHigh : ev.score.ctx.rangeLow;
      const a = x(Math.max(0, ev.i - 36)), b = x(Math.min(shown - 1, ev.i + 8));
      ctx.setLineDash([4, 4]); ctx.strokeStyle = T.fg; ctx.globalAlpha = 0.55; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(a, y(lvl)); ctx.lineTo(b, y(lvl)); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1;
      ctx.fillStyle = T.muted;
      ctx.fillText(ev.side === "long" ? "range high" : "range low", a, y(lvl) + (ev.side === "long" ? -9 : 10));
    }

    // vwap
    ctx.strokeStyle = alpha(T.blue, 0.7); ctx.lineWidth = 1.4; ctx.beginPath();
    let started = false;
    for (let i = 20; i < shown; i++) {
      const v = S.vwap[i]; if (v == null) continue;
      if (!started) { ctx.moveTo(x(i), y(v)); started = true; } else ctx.lineTo(x(i), y(v));
    }
    ctx.stroke();

    // candles + volume
    const vy0 = h - padB;
    for (let i = 0; i < shown; i++) {
      const c = cs[i];
      const up = c.c >= c.o;
      const col = up ? T.up : T.down;
      const fresh = opt.live && i === shown - 1;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x(i), y(c.h)); ctx.lineTo(x(i), y(c.l)); ctx.stroke();
      const top = y(Math.max(c.o, c.c)), bh = Math.max(1, Math.abs(y(c.o) - y(c.c)));
      ctx.fillRect(x(i) - bw / 2, top, bw, bh);
      if (fresh) {
        ctx.fillStyle = alpha(T.signal, 0.9);
        ctx.beginPath(); ctx.arc(x(i), y(c.c), 3, 0, Math.PI * 2); ctx.fill();
      }
      const vh = (c.vol / S.maxVol) * volH;
      const isEv = hasEv && (i === ev.i);
      ctx.fillStyle = isEv ? T.signal : alpha(col, 0.35);
      ctx.fillRect(x(i) - bw / 2, vy0 - vh, bw, vh);
    }

    // decision marker
    if (ev && ev.verdict !== "IGNORE" && shown > ev.entry) {
      const take = ev.verdict === "TAKE";
      const c = take ? cs[ev.entry] : cs[ev.i];
      const mx = x(take ? ev.entry : ev.i);
      const my = take ? y(c.c) : (ev.side === "long" ? y(c.h) : y(c.l));
      const col = take ? T.up : T.down;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(mx, my, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.arc(mx, my, 10, 0, Math.PI * 2); ctx.stroke();
      const label = take ? (ev.side === "long" ? "LONG" : "SHORT") : "REJECT";
      drawTag(ctx, label, mx, my, col, ev.side === "long" ? -1 : 1, w, padR);
    } else if (ev && ev.verdict === "IGNORE" && shown >= n) {
      const c = cs[ev.i];
      drawTag(ctx, "score " + Math.round(ev.score.total) + ", ignored", x(ev.i), y(c.h), T.blue, -1, w, padR);
    }
  }

  function drawTag(ctx, text, mx, my, col, dir, w, padR) {
    ctx.font = "700 11px 'JetBrains Mono', monospace";
    const tw = ctx.measureText(text).width + 16, th = 22;
    let tx = Math.min(mx - tw / 2, w - padR - tw);
    tx = Math.max(4, tx);
    const ty = dir < 0 ? my - 22 - th : my + 22;
    ctx.fillStyle = T.solid; ctx.strokeStyle = col; ctx.lineWidth = 1.2;
    roundRect(ctx, tx, ty, tw, th, 6); ctx.fill(); ctx.stroke();
    ctx.fillStyle = col; ctx.textBaseline = "middle";
    ctx.fillText(text, tx + 8, ty + th / 2 + 0.5);
  }

  /* ---------- copy ---------- */
  const STORY = {
    pump: "Volume jumps to several times its normal level, most of it market buys. Open interest rises with price, so new money is entering. The 36-candle range breaks on a close and the next candle holds. All 7 filters pass, so the module goes LONG and hands the trade to your TP plan and Chandelier.",
    fake: "Price spikes above the range on heavy volume, then closes back inside. The score was high, but the close confirmation fails. Wicks like this are where most breakout bots lose money.",
    cover: "Price rises fast, but open interest falls and market buys are close to 50/50. That is shorts closing, not new buyers. The score never reaches 70, so nothing happens.",
    absorb: "Heavy market buying hits the level, but the candle barely moves. Someone big is selling into it. The absorption check blocks the trade before the seller wins.",
    late: "The coin already ran for hours before the volume spike. When the score fires, price is far above VWAP. The late-entry guard skips it instead of buying the top.",
    dump: "The mirror case. Volume spikes with market sells, open interest rises as price falls, and the range breaks down on a close. All filters pass, so the module goes SHORT.",
  };
  const SYM = { pump: "COIN-A", fake: "COIN-B", absorb: "COIN-C", dump: "COIN-D", cover: "COIN-E", late: "COIN-F" };

  function verdictInfo(ev) {
    if (ev.verdict === "TAKE") return { cls: "take", text: "TAKE " + (ev.side === "long" ? "LONG" : "SHORT") };
    if (ev.verdict === "REJECT") return { cls: "reject", text: "REJECT" };
    return { cls: "ignore", text: "IGNORED" };
  }

  /* ---------- hero: live detector ---------- */
  const heroOrder = ["pump", "fake", "absorb", "dump", "cover", "late"];
  const seedPool = {};
  heroOrder.forEach(t => { seedPool[t] = E.seedsFor(t, 4); });

  const hero = {
    cv: $("#hero-cv"), idx: 0, S: null, upto: 0, t: 0, phase: "run", hold: 0, visible: true, decided: false,
    load() {
      const type = heroOrder[this.idx % heroOrder.length];
      const pool = seedPool[type];
      this.S = prep(type, pool[(Math.floor(this.idx / heroOrder.length)) % pool.length]);
      this.upto = 40; this.phase = "run"; this.decided = false;
      $("#h-sym").textContent = SYM[type] + " / USDT";
      $("#h-scn").textContent = E.SCENARIOS[type].label;
      $("#h-buy").previousElementSibling.textContent = this.S.ev.side === "short" ? "Market sells" : "Market buys";
      setPill($("#h-pill"), "", "SCANNING");
      $("#h-why").textContent = "Watching volume, order flow, open interest and the order book.";
    },
    readouts(at) {
      const S = this.S, i = at != null ? at : Math.min(this.upto, E.N) - 1, side = S.ev.side || "long";
      const s = E.score(S.cs, i, side);
      $("#h-vol").textContent = s.ratio.toFixed(1) + "x";
      $("#h-buy").textContent = Math.round(s.share * 100) + "%";
      $("#h-oi").textContent = (s.oiChg >= 0 ? "+" : "") + (s.oiChg * 100).toFixed(1) + "%";
      $("#h-brk").textContent = s.brk > 0 ? "+" + s.brk.toFixed(1) + " ATR" : "no";
      const sc = Math.round(s.total);
      $("#h-score").textContent = sc;
      $("#h-meter").style.width = Math.min(100, s.total) + "%";
    },
    decide() {
      const ev = this.S.ev, v = verdictInfo(ev);
      this.readouts(ev.i);
      setPill($("#h-pill"), v.cls, v.text);
      $("#h-why").textContent = ev.verdict === "TAKE"
        ? "Score " + Math.round(ev.score.total) + " and all 7 filters passed. Trade goes to your TP plan."
        : ev.reason;
      const box = $("#h-verdict"); box.classList.remove("flash"); void box.offsetWidth; box.classList.add("flash");
      this.decided = true;
    },
    frame(dt) {
      const S = this.S;
      const decideAt = S.ev.verdict === "IGNORE" ? E.N : S.ev.entry + 1;
      if (this.phase === "run") {
        this.t += dt;
        const step = this.upto >= S.ev.i - 2 && this.upto <= decideAt ? 260 : 70;
        while (this.t > step && this.upto < E.N) {
          this.t -= step; this.upto++;
          if (!this.decided) this.readouts();
          if (!this.decided && this.upto >= decideAt) { this.decide(); this.phase = "pause"; this.hold = 1400; break; }
        }
        if (this.upto >= E.N) { if (!this.decided) this.decide(); this.phase = "end"; this.hold = 2600; }
      } else {
        this.hold -= dt;
        if (this.hold <= 0) {
          if (this.phase === "pause") { this.phase = "run"; this.t = 0; }
          else { this.idx++; this.load(); }
        }
      }
      drawChart(this.cv, S, this.upto, { live: this.phase === "run" });
    },
    staticFrame() {
      this.upto = E.N; this.decide(); drawChart(this.cv, this.S, E.N);
    },
  };

  function setPill(el, cls, text) {
    el.className = "pill" + (cls ? " " + cls : "");
    el.textContent = text;
  }

  hero.load();
  if (reduce) hero.staticFrame();
  else {
    let last = performance.now();
    const loop = now => {
      const dt = Math.min(100, now - last); last = now;
      if (hero.visible && !document.hidden) hero.frame(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
    new IntersectionObserver(es => { hero.visible = es[0].isIntersecting; }).observe($("#hero-term"));
  }

  /* ---------- explorer ---------- */
  const exOrder = ["pump", "fake", "cover", "absorb", "late", "dump"];
  const exCache = {};
  let exCur = "pump";
  const tabs = $("#tabs");
  exOrder.forEach((t, k) => {
    const S = exCache[t] = prep(t, seedPool[t][0]);
    const b = document.createElement("button");
    b.type = "button"; b.className = "tab"; b.id = "tab-" + t; b.setAttribute("role", "tab");
    b.setAttribute("aria-selected", k === 0 ? "true" : "false"); b.tabIndex = k === 0 ? 0 : -1;
    b.innerHTML = '<span class="dot ' + verdictInfo(S.ev).cls + '"></span>' + E.SCENARIOS[t].label;
    b.addEventListener("click", () => selectTab(t));
    tabs.appendChild(b);
  });
  tabs.addEventListener("keydown", e => {
    const i = exOrder.indexOf(exCur);
    let j = null;
    if (e.key === "ArrowRight") j = (i + 1) % exOrder.length;
    if (e.key === "ArrowLeft") j = (i - 1 + exOrder.length) % exOrder.length;
    if (j !== null) { e.preventDefault(); selectTab(exOrder[j]); $("#tab-" + exOrder[j]).focus(); }
  });

  const PARTS = [
    { k: "volume", nm: "Volume spike", max: 25, raw: s => s.ratio.toFixed(1) + "x normal" },
    { k: "flow", nm: "Order flow", max: 25, raw: (s, side) => Math.round(s.share * 100) + "% market " + (side === "short" ? "sells" : "buys") },
    { k: "breakout", nm: "Range break", max: 20, raw: s => s.brk > 0 ? s.brk.toFixed(1) + " ATR beyond" : "inside range" },
    { k: "oi", nm: "Open interest", max: 15, raw: s => (s.oiChg >= 0 ? "+" : "") + (s.oiChg * 100).toFixed(1) + "% in 15 min" },
    { k: "book", nm: "Order book", max: 15, raw: (s, side) => side === "short" ? "bids thinning" : "asks thinning" },
  ];

  function selectTab(t) {
    exCur = t;
    $$(".tab", tabs).forEach(b => {
      const on = b.id === "tab-" + t;
      b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
    });
    renderExplorer(true);
  }

  function renderExplorer(animate) {
    const S = exCache[exCur], ev = S.ev, s = ev.score, side = ev.side || "long";
    drawChart($("#ex-cv"), S, E.N);
    $("#ex-title").textContent = E.SCENARIOS[exCur].label;
    const v = verdictInfo(ev);
    setPill($("#ex-pill"), v.cls, v.text);
    $("#ex-story").textContent = STORY[exCur];

    $("#ex-parts").innerHTML = PARTS.map(p => {
      const pts = s.parts[p.k];
      const raw = p.k === "book" && pts < 7.5 ? "no imbalance" : p.raw(s, side);
      return '<div class="part"><span class="nm">' + p.nm + "<small>" + raw + '</small></span><span class="bar"><i data-w="' +
        (pts / p.max * 100).toFixed(1) + '"></i></span><span class="pts">' + Math.round(pts) + "/" + p.max + "</span></div>";
    }).join("");
    const setW = () => $$("#ex-parts .bar i").forEach(i => { i.style.width = i.dataset.w + "%"; });
    if (animate && !reduce) requestAnimationFrame(() => requestAnimationFrame(setW)); else setW();
    $("#ex-score").textContent = Math.round(s.total);
    $("#ex-meter").style.width = Math.min(100, s.total) + "%";

    const names = ["Absorption check", "Close confirmation", "Follow-through", "Late-entry guard", "BTC regime", "Crowding (funding / OI)", "Spread + slippage"];
    const fl = $("#ex-filters");
    if (!ev.filters) {
      fl.innerHTML = names.map(n => '<li><span class="st na">-</span><span>' + n + '</span><span class="tag">not reached</span></li>').join("");
      $("#ex-fcount").textContent = "score below 70";
    } else {
      const firstFail = ev.filters.findIndex(f => !f.pass);
      fl.innerHTML = ev.filters.map((f, k) => {
        const fail = !f.pass;
        const after = firstFail >= 0 && k > firstFail;
        return "<li" + (k === firstFail ? ' class="fail-row"' : "") + '><span class="st ' + (fail ? "fail" : "pass") + '">' +
          (fail ? "x" : "ok") + "</span><span>" + f.name + '</span><span class="tag">' +
          (k === firstFail ? "BLOCKS TRADE" : after ? "also checked" : "pass") + "</span></li>";
      }).join("").replace(/>ok</g, ">&#10003;<").replace(/>x</g, ">&#10005;<");
      $("#ex-fcount").textContent = firstFail < 0 ? "7 / 7 passed" : "blocked";
    }
  }
  renderExplorer(true);

  /* ---------- 10-trade math ---------- */
  const m = { wins: $("#m-wins"), stop: $("#m-stop"), loss: $("#m-loss"), move: 20 };
  $$("#m-move button").forEach(b => b.addEventListener("click", () => {
    m.move = +b.dataset.v;
    $$("#m-move button").forEach(x => x.setAttribute("aria-pressed", x === b ? "true" : "false"));
    calc();
  }));
  [m.wins, m.stop, m.loss].forEach(i => i.addEventListener("input", calc));

  function fillRange(i) { i.style.setProperty("--p", ((i.value - i.min) / (i.max - i.min) * 100) + "%"); }
  const fmtR = v => (v >= 0 ? "+" : "") + v.toFixed(2) + "R";

  function calc() {
    [m.wins, m.stop, m.loss].forEach(fillRange);
    const wins = +m.wins.value, stop = +m.stop.value, loss = +m.loss.value, move = m.move;
    $("#o-wins").textContent = wins; $("#o-stop").textContent = stop.toFixed(1) + "%"; $("#o-loss").textContent = loss.toFixed(2) + "R";
    const fee = 0.11 / stop;
    const peak = move / stop, exitR = 0.75 * peak;
    const tp1 = peak >= 1 ? 1 : exitR, tp2 = peak >= 2 ? 2 : exitR;
    const winR = 0.2 * tp1 + 0.2 * tp2 + 0.6 * exitR - fee;
    const lossR = -loss - fee;
    const total = wins * winR + (10 - wins) * lossR;
    const be = 10 * (-lossR) / (winR - lossR);

    const tv = $("#r-total");
    tv.textContent = (total >= 0 ? "+" : "") + total.toFixed(1) + "R";
    tv.className = "val " + (total >= 0 ? "pos" : "neg");
    $("#b-tp1").textContent = fmtR(0.2 * tp1);
    $("#b-tp2").textContent = fmtR(0.2 * tp2);
    $("#b-run").textContent = fmtR(0.6 * exitR);
    $("#b-be").textContent = be.toFixed(1) + " / 10";

    let line;
    if (wins === 0) line = "No winners means no profit, whatever the exit plan. This is what the filters are there to prevent.";
    else if (total >= 0) line = wins + " winner" + (wins > 1 ? "s" : "") + " in 10 on a +" + move + "% move ends at " + (total >= 0 ? "+" : "") + total.toFixed(1) +
      "R. Each winner is worth " + winR.toFixed(1) + "R, each loser costs " + (-lossR).toFixed(2) + "R. Break-even is " + be.toFixed(1) + " winners in 10.";
    else line = wins + " winner" + (wins > 1 ? "s" : "") + " in 10 on a +" + move + "% move still loses " + Math.abs(total).toFixed(1) +
      "R. You need " + be.toFixed(1) + " winners in 10 to break even. That gap is exactly what the filters and the time stop have to close.";
    $("#r-line").textContent = line;
    drawMath(wins, winR, lossR);
  }

  function drawMath(wins, winR, lossR) {
    const { ctx, w, h } = fit($("#math-cv"));
    const pos = new Set();
    for (let j = 0; j < wins; j++) pos.add(Math.min(9, Math.round((j + 0.65) * 10 / wins) - 1));
    let k = 9; while (pos.size < wins) { if (!pos.has(k)) pos.add(k); k--; }
    const vals = Array.from({ length: 10 }, (_, i) => pos.has(i) ? winR : lossR);
    const cum = []; vals.reduce((a, v, i) => (cum[i] = a + v), 0);
    const all = vals.concat(cum, [0]);
    const mx = Math.max(...all), mn = Math.min(...all);
    const padL = 46, padR = 12, padT = 18, padB = 22;
    const y = v => padT + (mx - v) / ((mx - mn) || 1) * (h - padT - padB);
    const slot = (w - padL - padR) / 10, bw = Math.min(34, slot * 0.56);
    ctx.font = "500 10.5px 'JetBrains Mono', monospace"; ctx.textBaseline = "middle";

    [mx, 0, mn].forEach(v => {
      const yy = Math.round(y(v)) + 0.5;
      ctx.strokeStyle = v === 0 ? T.line2 : T.grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(padL, yy); ctx.lineTo(w - padR, yy); ctx.stroke();
      ctx.fillStyle = T.muted; ctx.textAlign = "right";
      ctx.fillText((v > 0 ? "+" : "") + v.toFixed(1) + "R", padL - 8, yy);
    });
    ctx.textAlign = "center";
    vals.forEach((v, i) => {
      const cx = padL + slot * i + slot / 2;
      const y0 = y(0), y1 = y(v);
      ctx.fillStyle = v > 0 ? T.up : alpha(T.down, 0.75);
      roundRect(ctx, cx - bw / 2, Math.min(y0, y1), bw, Math.max(2, Math.abs(y1 - y0)), 4); ctx.fill();
      ctx.fillStyle = T.muted;
      ctx.fillText(String(i + 1), cx, h - 8);
    });
    ctx.strokeStyle = T.signal; ctx.lineWidth = 2; ctx.beginPath();
    cum.forEach((v, i) => { const cx = padL + slot * i + slot / 2; i ? ctx.lineTo(cx, y(v)) : ctx.moveTo(cx, y(v)); });
    ctx.stroke();
    const lx = padL + slot * 9 + slot / 2, ly = y(cum[9]);
    ctx.fillStyle = T.signal; ctx.beginPath(); ctx.arc(lx, ly, 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.textAlign = "left";
  }
  calc();

  /* ---------- filter table (illustrative) ---------- */
  const FROWS = [
    ["Close confirmation", 214, 31, 96.4, "keep"],
    ["Absorption check", 88, 12, 41.2, "keep"],
    ["Follow-through", 132, 29, 38.7, "keep"],
    ["Late-entry guard", 97, 21, 22.5, "keep"],
    ["BTC regime", 41, 9, 11.8, "keep"],
    ["Spread + slippage", 18, 4, 5.1, "keep"],
    ["Crowding (funding / OI)", 63, 22, -4.6, "tune"],
  ];
  const fmax = Math.max(...FROWS.map(r => Math.abs(r[3])));
  $("#f-body").innerHTML = FROWS.map(r =>
    "<tr><td>" + r[0] + '</td><td class="n">' + r[1] + '</td><td class="n">' + r[2] + " (" + Math.round(r[2] / r[1] * 100) + '%)</td><td class="n"><span class="rbar"><i class="' +
    (r[3] < 0 ? "neg" : "") + '" style="--w:' + Math.max(4, Math.abs(r[3]) / fmax * 90) + 'px"></i>' + (r[3] > 0 ? "+" : "") + r[3].toFixed(1) +
    'R</span></td><td><span class="chip ' + r[4] + '">' + (r[4] === "keep" ? "KEEP" : "LOOSEN") + "</span></td></tr>").join("");

  /* ---------- gantt ---------- */
  $("#g-days").innerHTML = Array.from({ length: 14 }, (_, i) => "<span>" + (i + 1) + "</span>").join("");
  $$(".g-track").forEach(tr => {
    const i = document.createElement("i");
    i.style.gridColumn = tr.dataset.a + " / " + (+tr.dataset.b + 1);
    if (tr.dataset.demo) i.className = "demo";
    tr.appendChild(i);
  });

  /* ---------- motion + interaction ---------- */
  const prog = $("#progress");
  const onScroll = () => {
    const max = document.documentElement.scrollHeight - innerHeight;
    prog.style.transform = "scaleX(" + (max > 0 ? scrollY / max : 0) + ")";
  };
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  if (!reduce && "IntersectionObserver" in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
    }), { rootMargin: "0px 0px -8% 0px" });
    $$(".reveal").forEach(el => io.observe(el));
  } else $$(".reveal").forEach(el => el.classList.add("in"));
  setTimeout(() => $$(".reveal").forEach(el => el.classList.add("in")), 4000);

  const links = $$(".nav-links a");
  const navIO = new IntersectionObserver(es => es.forEach(e => {
    if (e.isIntersecting) links.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + e.target.id));
  }), { rootMargin: "-45% 0px -50% 0px" });
  ["decide", "math", "filters", "proof", "plan"].forEach(id => navIO.observe(document.getElementById(id)));

  if (!reduce && matchMedia("(pointer: fine)").matches) {
    $$(".magnetic").forEach(b => {
      b.addEventListener("pointermove", e => {
        const r = b.getBoundingClientRect();
        b.style.setProperty("--mx", ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + "px");
        b.style.setProperty("--my", ((e.clientY - r.top - r.height / 2) * 0.32).toFixed(1) + "px");
      });
      b.addEventListener("pointerleave", () => { b.style.setProperty("--mx", "0px"); b.style.setProperty("--my", "0px"); });
    });
    $$(".glow").forEach(c => c.addEventListener("pointermove", e => {
      const r = c.getBoundingClientRect();
      c.style.setProperty("--gx", (e.clientX - r.left) + "px");
      c.style.setProperty("--gy", (e.clientY - r.top) + "px");
    }));
  }

  /* ---------- redraw on resize / theme ---------- */
  const redraw = () => { readTokens(); renderExplorer(); calc(); if (reduce) hero.staticFrame(); };
  let rz;
  addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(redraw, 120); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redraw);
  new MutationObserver(redraw).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(redraw);
})();
