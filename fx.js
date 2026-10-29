/* Film layer: letterbox, timecode, lazy video, cursor, tilt, GSAP scroll direction. */
(function () {
  "use strict";
  const $ = (s, el) => (el || document).querySelector(s);
  const $$ = (s, el) => Array.from((el || document).querySelectorAll(s));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer: fine)").matches;

  /* signal tape (simulated) */
  const tape = [
    ["COIN-A", "+12.4%", "u", "score 94 / TAKE"], ["COIN-B", "+3.1%", "u", "wick / REJECT"], ["COIN-C", "+0.4%", "u", "absorption / REJECT"],
    ["COIN-D", "-9.8%", "d", "score 91 / TAKE SHORT"], ["COIN-E", "+4.2%", "u", "OI falling / IGNORED"], ["COIN-F", "+14.0%", "u", "late / REJECT"],
    ["COIN-G", "+1.2%", "u", "score 38"], ["COIN-H", "-0.6%", "d", "score 22"], ["COIN-I", "+27.5%", "u", "runner / CHANDELIER"],
  ];
  const row = tape.map(t => '<span><b>' + t[0] + '</b><span class="' + t[2] + '">' + t[1] + '</span> &nbsp;' +
    (t[3].includes("TAKE") || t[3].includes("CHANDELIER") ? '<span class="g">' + t[3] + "</span>" : t[3]) + "</span>").join("");
  $("#tape").innerHTML = row + row;

  /* timecode */
  const tc = $("#tc"), t0 = performance.now();
  const pad = n => String(n).padStart(2, "0");
  setInterval(() => {
    const ms = performance.now() - t0, s = Math.floor(ms / 1000);
    tc.textContent = pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60) + ":" + pad(Math.floor(ms / 40) % 25);
  }, 40);

  /* nav state */
  const nav = $("#nav");
  const onScroll = () => nav.classList.toggle("scrolled", scrollY > 40);
  addEventListener("scroll", onScroll, { passive: true }); onScroll();

  /* lazy video: load near view, pause out of view */
  const vids = $$("video[data-src]");
  if ("IntersectionObserver" in window) {
    const vio = new IntersectionObserver(es => es.forEach(e => {
      const v = e.target;
      if (e.isIntersecting) {
        if (!v.src) { v.src = v.dataset.src; }
        if (!reduce) v.play().catch(() => {});
      } else if (!v.paused) v.pause();
    }), { rootMargin: "300px 0px" });
    vids.forEach(v => vio.observe(v));
    const hv = $("#hero-video");
    new IntersectionObserver(es => { es[0].isIntersecting && !reduce ? hv.play().catch(() => {}) : hv.pause(); }).observe(hv);
  } else vids.forEach(v => { v.src = v.dataset.src; });
  if (reduce) { const hv = $("#hero-video"); hv.removeAttribute("autoplay"); hv.pause(); }

  /* cursor */
  if (fine && !reduce) {
    const c = $(".cursor");
    let x = innerWidth / 2, y = innerHeight / 2, cx = x, cy = y;
    addEventListener("pointermove", e => { x = e.clientX; y = e.clientY; }, { passive: true });
    (function tick() { cx += (x - cx) * 0.2; cy += (y - cy) * 0.2; c.style.transform = "translate(" + cx + "px," + cy + "px)"; requestAnimationFrame(tick); })();
    $$("a, button, input, .tab, .fr").forEach(el => {
      el.addEventListener("pointerenter", () => c.classList.add("big"));
      el.addEventListener("pointerleave", () => c.classList.remove("big"));
    });
  }

  /* 3D tilt */
  if (fine && !reduce) {
    $$(".tilt").forEach(el => {
      el.style.transition = "transform .6s cubic-bezier(.2,.8,.2,1)";
      el.addEventListener("pointermove", e => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
        el.style.transform = "perspective(1100px) rotateY(" + (px * 7).toFixed(2) + "deg) rotateX(" + (-py * 7).toFixed(2) + "deg) translateZ(0)";
      });
      el.addEventListener("pointerleave", () => { el.style.transform = ""; });
    });
  }

  /* split titles into masked words */
  $$(".splitme").forEach(h => {
    const walk = node => Array.from(node.childNodes).forEach(n => {
      if (n.nodeType === 3) {
        const frag = document.createDocumentFragment();
        n.textContent.split(/(\s+)/).forEach(part => {
          if (!part) return;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
          const o = document.createElement("span"); o.className = "split";
          const i = document.createElement("span"); i.className = "w"; i.textContent = part;
          o.appendChild(i); frag.appendChild(o);
        });
        n.replaceWith(frag);
      } else if (n.nodeType === 1 && !n.classList.contains("split")) walk(n);
    });
    walk(h);
  });

  const lb = $$(".lb");
  if (reduce || !window.gsap) { lb.forEach(l => l.remove()); return; }

  const g = window.gsap;
  g.registerPlugin(window.ScrollTrigger);
  g.ticker.lagSmoothing(0);

  /* opening shot: letterbox opens, title rises */
  const tl = g.timeline({ defaults: { ease: "expo.out" } });
  tl.fromTo(".hero .bgv video", { scale: 1.35 }, { scale: 1.12, duration: 3.2, ease: "power2.out" }, 0)
    .from(".hero .bgv", { opacity: 0, duration: 2.2, ease: "power2.out" }, 0)
    .to(lb, { height: 0, duration: 1.4, ease: "power4.inOut", onComplete: () => lb.forEach(l => l.remove()) }, 0.3)
    .from(".hero h1 .w", { yPercent: 115, rotateX: -60, transformOrigin: "50% 100%", duration: 1.3, stagger: 0.06 }, 0.6)
    .from(".hero .eyebrow, .hero .fade-up, .hud, .corner", { opacity: 0, y: 20, duration: 1, stagger: 0.06 }, 1.0)
    .from(".tape", { yPercent: 100, duration: 1 }, 1.2);

  /* hero leaves the frame */
  g.to(".hero .bgv", { yPercent: 22, ease: "none", scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: true } });
  g.to(".hero-in", { yPercent: -18, opacity: 0, ease: "none", scrollTrigger: { trigger: ".hero", start: "40% top", end: "bottom top", scrub: true } });

  /* titles */
  $$(".splitme").forEach(h => {
    g.from($$(".w", h), { yPercent: 110, rotate: 3, duration: 1.3, ease: "expo.out", stagger: 0.05,
      scrollTrigger: { trigger: h, start: "top 86%" } });
  });
  $$(".sec-head .eyebrow, .sec-head p").forEach(el => g.from(el, { opacity: 0, y: 24, duration: 1.1, ease: "expo.out", scrollTrigger: { trigger: el, start: "top 90%" } }));

  /* film frames open like a shutter */
  $$(".reveal-frame").forEach(f => {
    g.fromTo(f, { clipPath: "inset(14% 10% 14% 10% round 34px)" }, { clipPath: "inset(0% 0% 0% 0% round 20px)", ease: "none",
      scrollTrigger: { trigger: f, start: "top 95%", end: "top 40%", scrub: 0.6 } });
    const m = $("video, img", f);
    if (m) g.fromTo(m, { scale: 1.3 }, { scale: 1, ease: "none", scrollTrigger: { trigger: f, start: "top 95%", end: "bottom top", scrub: 0.6 } });
  });

  /* full-bleed parallax */
  $$(".bleed > .bgv").forEach(b => g.fromTo(b, { yPercent: -8 }, { yPercent: 8, ease: "none", scrollTrigger: { trigger: b.parentElement, start: "top bottom", end: "bottom top", scrub: true } }));

  /* film strip slides in like a reel */
  g.from(".strip", { xPercent: 12, rotate: -2, opacity: 0, duration: 1.6, ease: "expo.out", scrollTrigger: { trigger: ".strip", start: "top 88%" } });
  g.from(".fr", { yPercent: 18, opacity: 0, duration: 1.2, ease: "expo.out", stagger: 0.1, scrollTrigger: { trigger: ".strip", start: "top 80%" } });

  /* cards rise in groups */
  ScrollTrigger.batch(".card:not(.reveal-frame), .facts > div", {
    start: "top 92%",
    onEnter: els => g.from(els, { y: 46, opacity: 0, duration: 1.1, ease: "expo.out", stagger: 0.08, overwrite: true }),
  });

  /* counters */
  $$("[data-count]").forEach(el => {
    const end = +el.dataset.count, o = { v: 0 };
    g.to(o, { v: end, duration: 1.4, ease: "power2.out", onUpdate: () => { el.textContent = Math.round(o.v); },
      scrollTrigger: { trigger: el, start: "top 90%" } });
  });

  /* gantt bars draw */
  g.from(".g-track i", { scaleX: 0, transformOrigin: "0 50%", duration: 1.2, ease: "expo.out", stagger: 0.12, scrollTrigger: { trigger: ".gantt", start: "top 85%" } });

  addEventListener("load", () => ScrollTrigger.refresh());
})();
