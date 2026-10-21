/* Meadow — GSAP scroll-scrub film + Blender 3D hero (classic script; Three.js via dynamic import) */
(function () {
  "use strict";
  document.documentElement.dataset.enhanced = "true";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var hasGSAP = typeof window.gsap !== "undefined";
  var hasST = typeof window.ScrollTrigger !== "undefined";
  if (hasGSAP && hasST) gsap.registerPlugin(ScrollTrigger);
  try { console.log("%cMeadow build 8", "background:#0071e3;color:#fff;padding:2px 6px;border-radius:4px", "canvas film renderer"); } catch (e) {}

  /* ---------- Smooth scroll (Lenis) synced to ScrollTrigger ---------- */
  var lenis = null;
  try {
    if (!reduceMotion.matches && typeof window.Lenis !== "undefined" && hasGSAP && hasST) {
      lenis = new Lenis({ smoothWheel: true, lerp: 0.09 });
      lenis.on("scroll", ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    }
  } catch (e) { lenis = null; }

  // Anchor links through Lenis when present
  document.querySelectorAll('a[href^="#"]').forEach(function (a) {
    a.addEventListener("click", function (ev) {
      var id = a.getAttribute("href");
      if (id.length < 2) return;
      var el = document.querySelector(id);
      if (!el) return;
      ev.preventDefault();
      if (lenis) lenis.scrollTo(el, { offset: -64 });
      else el.scrollIntoView({ behavior: reduceMotion.matches ? "auto" : "smooth" });
      nav && nav.setAttribute("data-open", "false");
    });
  });

  /* ---------- Mobile nav / year / billing ---------- */
  var nav = document.querySelector(".nav");
  var navToggle = document.querySelector(".nav__toggle");
  if (nav && navToggle) {
    navToggle.addEventListener("click", function () {
      var open = nav.getAttribute("data-open") !== "true";
      nav.setAttribute("data-open", String(open));
      navToggle.setAttribute("aria-expanded", String(open));
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") nav.setAttribute("data-open", "false"); });
  }
  var year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());

  document.querySelectorAll("[data-billing]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var period = btn.getAttribute("data-billing");
      document.querySelectorAll("[data-billing]").forEach(function (o) {
        var on = o === btn;
        o.classList.toggle("is-active", on);
        o.setAttribute("aria-pressed", String(on));
      });
      document.querySelectorAll(".plan__amount").forEach(function (el) { el.textContent = "$" + el.getAttribute("data-" + period); });
      document.querySelectorAll(".plan__period").forEach(function (el) { el.textContent = el.getAttribute("data-" + period); });
    });
  });

  /* ---------- Reveal + KPI count-up (lightweight, GSAP-independent) ---------- */
  var revealEls = document.querySelectorAll(".reveal");
  if ("IntersectionObserver" in window && !reduceMotion.matches) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); } });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    revealEls.forEach(function (el) { io.observe(el); });
  } else { revealEls.forEach(function (el) { el.classList.add("is-visible"); }); }

  var fmtCompact = function (v) { return v >= 1000 ? (v / 1000).toFixed(1).replace(/\.0$/, "") + "K" : String(Math.round(v)); };
  var runCount = function (el) {
    var target = parseFloat(el.getAttribute("data-count-to")) || 0;
    var prefix = el.getAttribute("data-prefix") || "";
    var mode = el.getAttribute("data-format") || "plain";
    var dec = parseInt(el.getAttribute("data-decimals") || "0", 10);
    var render = function (v) { el.textContent = mode === "percent" ? v.toFixed(dec) + "%" : prefix + (mode === "compact" ? fmtCompact(v) : String(Math.round(v))); };
    if (reduceMotion.matches) { render(target); return; }
    var t0 = null, dur = 1100;
    var step = function (t) {
      if (t0 === null) t0 = t;
      var p = Math.min((t - t0) / dur, 1), e = 1 - Math.pow(1 - p, 3);
      render(target * e);
      if (p < 1) requestAnimationFrame(step); else render(target);
    };
    requestAnimationFrame(step);
  };
  var counters = document.querySelectorAll(".kpi__value[data-count-to]");
  if ("IntersectionObserver" in window) {
    var cio = new IntersectionObserver(function (es) { es.forEach(function (en) { if (en.isIntersecting) { runCount(en.target); cio.unobserve(en.target); } }); }, { threshold: 0.4 });
    counters.forEach(function (el) { cio.observe(el); });
  } else counters.forEach(runCount);

  /* ---------- Header progress ---------- */
  var headerBar = document.getElementById("scrollProgressBar");
  var setHeaderProgress = function (p) { if (headerBar) headerBar.style.transform = "scaleX(" + p.toFixed(4) + ")"; };
  if (hasGSAP && hasST && !reduceMotion.matches) {
    gsap.to({}, {
      ease: "none",
      scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 0.3, onUpdate: function (s) { setHeaderProgress(s.progress); } }
    });
  } else {
    var onScroll = function () {
      var h = document.documentElement;
      var max = h.scrollHeight - h.clientHeight;
      setHeaderProgress(max > 0 ? h.scrollTop / max : 0);
    };
    document.addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }

  /* =====================================================
     SHARED SCROLL CLOCK — one progress value (0 at page top,
     1 at page bottom) drives BOTH the fullscreen film and the
     fixed centered 3D stage, so background + object stay in sync.
     ===================================================== */
  var scrollState = { progress: 0 };
  var filmKick = null; // assigned by initScrub; forces a safe seek pass
  // Choreography state for the fixed 3D stage. Defaults = hero pose so the
  // first paint is correct even before the choreo timeline is built.
  // Tick reads this every frame; a section-anchored GSAP timeline tweens it.
  var choreo = { x: 0, y: 0.10, s: 1, tilt: 0, spin: 0, roll: 0, cx: 0, cy: 0, cz: 0 };
  var actBreaks = []; // [{ at: 0..1, label }] — filled when choreo is built

  /* =====================================================
     FULL-PAGE SCROLL-SCRUB VIDEO (fixed fullscreen background)
     - video is position:fixed behind the whole page
     - FULL page scroll maps to the FULL video:
         page top    -> currentTime 0
         page bottom -> currentTime duration
     - scroll down = forward, scroll up = reverse (same path)
     ===================================================== */
  var video = document.getElementById("scrubVideo");
  var filmBar = document.getElementById("filmProgress");
  var hudTime = document.getElementById("hudTime");
  var beats = Array.prototype.slice.call(document.querySelectorAll("[data-beat]"));

  var fmtTime = function (s) {
    if (!isFinite(s) || s < 0) s = 0;
    var m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return (m < 10 ? "0" + m : "" + m) + ":" + (sec < 10 ? "0" + sec : "" + sec);
  };

  var paintHud = function (t, d, p) {
    if (hudTime) hudTime.textContent = fmtTime(t) + " / " + fmtTime(d);
    if (filmBar) filmBar.style.transform = "scaleX(" + p.toFixed(4) + ")";
    setHeaderProgress(p);
    paintAct(p);
  };

  var hudAct = document.getElementById("hudAct");
  var paintAct = function (p) {
    if (!hudAct || !actBreaks.length) return;
    var label = actBreaks[0].label;
    for (var i = 0; i < actBreaks.length; i++) {
      if (p >= actBreaks[i].at - 0.001) label = actBreaks[i].label;
    }
    if (hudAct.textContent !== label) hudAct.textContent = label;
  };

  var initBeatsFallback = function () {
    // No GSAP / no metadata: leave beats readable, loop the film natively.
    // Never hijack a working scrub — if scrub was built, stay out.
    if (typeof scrubBuilt !== "undefined" && scrubBuilt) return;
    if (video && !reduceMotion.matches) { video.loop = true; video.muted = true; video.play().catch(function () {}); }
  };

  /* =====================================================
     CANVAS FILM RENDERER — black-proof fullscreen background.
     The <video> is the decoder; the <canvas> is what you see.
     Every rAF we draw the current video frame (object-fit:cover).
     If a seek has no decoded frame yet (readyState < 2), we simply
     DON'T draw — the canvas keeps the last good frame. That removes
     the blank/black flash a bare <video> shows mid-seek on some
     browsers/GPUs, without changing the scrub mapping.
     ===================================================== */
  var filmCanvas = document.getElementById("filmCanvas");
  var fctx = filmCanvas ? filmCanvas.getContext("2d") : null;
  var sizeFilmCanvas = function () {
    if (!filmCanvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    var cw = Math.round(window.innerWidth * dpr);
    var ch = Math.round(window.innerHeight * dpr);
    if (filmCanvas.width !== cw || filmCanvas.height !== ch) {
      filmCanvas.width = cw; filmCanvas.height = ch;
    }
  };
  var drawFilm = function () {
    requestAnimationFrame(drawFilm);
    if (!fctx || !video) return;
    if (video.readyState >= 2 && video.videoWidth) {
      var cw = filmCanvas.width, ch = filmCanvas.height;
      var vw = video.videoWidth, vh = video.videoHeight;
      var s = Math.max(cw / vw, ch / vh);
      var dw = vw * s, dh = vh * s;
      try { fctx.drawImage(video, (cw - dw) / 2, (ch - dh) / 2, dw, dh); } catch (e) {}
    }
    // else: hold the previous frame (never paint black)
  };
  if (filmCanvas && fctx) {
    sizeFilmCanvas();
    window.addEventListener("resize", sizeFilmCanvas);
    drawFilm();
  }

  var initScrub = function () {
    if (!video) return;
    var duration = video.duration || 0;
    if (!isFinite(duration) || duration <= 0) { initBeatsFallback(); return; }

    // Never play the video on a timer — scroll owns every frame.
    // Exclusive control: kill any fallback loop/playback decisively.
    video.loop = false;
    try { video.pause(); } catch (e) {}
    paintHud(video.currentTime || 0, duration, 0);

    if (reduceMotion.matches || !hasGSAP || !hasST) { paintHud(0, duration, 0); return; }

    // Seek safely: only set currentTime when the decoder has data and is
    // not already seeking. Scroll writes a TARGET; a rAF loop applies it.
    // This is what prevents the black-flash / stuck-black failure mode.
    var target = 0;
    var rafId = 0;
    var applyTarget = function () {
      rafId = 0;
      if (video.readyState < 2 || video.seeking) { rafId = requestAnimationFrame(applyTarget); return; }
      var t = Math.min(Math.max(target, 0), Math.max(duration - 0.04, 0));
      if (Math.abs((video.currentTime || 0) - t) > 1 / 30) {
        try { video.currentTime = t; } catch (e) { rafId = requestAnimationFrame(applyTarget); return; }
      }
      // Keep pumping while the target keeps moving (active scroll).
      if (applyTarget._live) rafId = requestAnimationFrame(applyTarget);
    };
    applyTarget._live = false;
    var kick = function () {
      applyTarget._live = true;
      if (!rafId) rafId = requestAnimationFrame(applyTarget);
      clearTimeout(kick._t);
      kick._t = setTimeout(function () { applyTarget._live = false; }, 600);
    };
    filmKick = kick;

    // 1) FULL-PAGE scrub: body top->bottom drives 0->duration.
    ScrollTrigger.create({
      trigger: document.body,
      start: "top top",
      end: "bottom bottom",
      scrub: 1,
      onUpdate: function (self) {
        target = self.progress * duration;
        scrollState.progress = self.progress; // same clock -> 3D stage
        paintHud(target, duration, self.progress);
        kick();
      }
    });
    video.addEventListener("seeked", function () { if (applyTarget._live) kick(); });
    video.addEventListener("canplay", function () { kick(); });
    kick(); // paint frame 0 immediately (or as soon as data allows)

    // 2) Beats drift over the fixed film as normal scrolling sections.
    beats.forEach(function (beat) {
      gsap.fromTo(beat, { autoAlpha: 0, y: 80, scale: 0.985 }, {
        autoAlpha: 1, y: 0, scale: 1, ease: "none",
        scrollTrigger: { trigger: beat, start: "top 88%", end: "top 42%", scrub: 1 }
      });
    });

    // 2b) Word-by-word title reveals inside each beat (manual split —
    // no paid SplitText plugin needed). Words tumble in with perspective
    // across a slightly wider scroll range than the beat container.
    document.querySelectorAll(".beat__title").forEach(function (t) {
      var lines = t.innerHTML.split(/<br\s*\/?>/i);
      t.innerHTML = lines.map(function (line) {
        return line.split(/(\s+)/).map(function (part) {
          return /^\s*$/.test(part) ? part : '<span class="w">' + part + "</span>";
        }).join("");
      }).join("<br>");
    });
    beats.forEach(function (beat) {
      var words = beat.querySelectorAll(".beat__title .w");
      if (words.length) {
        gsap.fromTo(words, { autoAlpha: 0, y: 46, rotateX: -38 }, {
          autoAlpha: 1, y: 0, rotateX: 0, stagger: 0.06, ease: "none",
          scrollTrigger: { trigger: beat, start: "top 94%", end: "top 46%", scrub: 1 }
        });
      }
    });

    // 2c) Gentle parallax drift on section titles (Apple-style depth).
    gsap.utils.toArray(".section__title").forEach(function (el) {
      gsap.fromTo(el, { yPercent: 10 }, {
        yPercent: -10, ease: "none",
        scrollTrigger: { trigger: el, start: "top bottom", end: "bottom top", scrub: 1 }
      });
    });

    // 3) FIVE-ACT CHOREOGRAPHY for the fixed 3D stage + film grade.
    // Each act anchors to its section's real page position, so box, camera
    // and film mood interpolate continuously across the whole scroll —
    // and reverse cleanly, since it's one scrubbed timeline.
    var ACTS = [
      { sel: ".hero",    x: 0,     y: 0.10, s: 1.00, spin: 0,    tilt: 0,    roll: 0,    cx: 0,    cy: 0,    cz: 0,    b: 1.00, sat: 1.00, label: "AKT I · RDZEŃ" },
      { sel: ".beat--1", x: -1.35, y: 0,    s: 0.80, spin: 2.2,  tilt: 0.12, roll: 0.06, cx: -0.3, cy: 0,    cz: 0.3,  b: 0.94, sat: 1.02, label: "AKT I · RDZEŃ" },
      { sel: ".beat--2", x: 1.35,  y: 0,    s: 0.80, spin: 4.4,  tilt: 0.20, roll: 0.12, cx: 0.3,  cy: 0,    cz: 0.3,  b: 0.92, sat: 1.04, label: "AKT II · PRZEPŁYW" },
      { sel: ".beat--3", x: -1.35, y: -0.05,s: 0.85, spin: 6.6,  tilt: 0.30, roll: 0.20, cx: -0.3, cy: 0.1,  cz: 0.2,  b: 0.94, sat: 1.02, label: "AKT III · TRANSFORMACJA" },
      { sel: ".beat--4", x: 0,     y: 0,    s: 1.10, spin: 8.4,  tilt: 0.38, roll: 0.26, cx: 0,    cy: 0,    cz: -0.3, b: 0.96, sat: 1.00, label: "AKT IV · DOŁĄCZ" },
      { sel: "#craft",   x: 0,     y: 0.05, s: 1.15, spin: 10.2, tilt: 0.50, roll: 0.30, cx: 0,    cy: -0.2, cz: -1.1, b: 0.95, sat: 1.05, label: "NARZĘDZIA" },
      { sel: "#metrics", x: 1.50,  y: 0.55, s: 0.55, spin: 11.6, tilt: 0.62, roll: 0.34, cx: 0.6,  cy: 0.5,  cz: 0.9,  b: 1.00, sat: 1.00, label: "EFEKTY" },
      { sel: "#pricing", x: 0,     y: 0.10, s: 1.05, spin: 12.6, tilt: 0.70, roll: 0.40, cx: 0,    cy: 0,    cz: 0,    b: 1.02, sat: 1.00, label: "PACK" }
    ];
    var found = [];
    ACTS.forEach(function (a) {
      var el = document.querySelector(a.sel);
      if (el) { a.el = el; found.push(a); }
    });
    if (found.length > 1) {
      var docEl = document.documentElement;
      var max = Math.max(docEl.scrollHeight - window.innerHeight, 1);
      var pos = found.map(function (a) {
        var r = a.el.getBoundingClientRect();
        var off = r.top + (window.scrollY || window.pageYOffset);
        return Math.min(Math.max(off / max, 0), 1) * 100;
      });
      for (var pi = 1; pi < pos.length; pi++) pos[pi] = Math.max(pos[pi], pos[pi - 1] + 2);
      var grade = function (a) { return "brightness(" + a.b.toFixed(3) + ") saturate(" + a.sat.toFixed(3) + ")"; };
      var ctl = gsap.timeline({
        scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 1 }
      });
      ctl.set(choreo, { x: found[0].x, y: found[0].y, s: found[0].s, tilt: found[0].tilt, spin: found[0].spin, roll: found[0].roll, cx: found[0].cx, cy: found[0].cy, cz: found[0].cz }, 0);
      ctl.set(".film-bg__video", { filter: grade(found[0]) }, 0);
      for (var ai = 1; ai < found.length; ai++) {
        var gap = Math.max(pos[ai] - pos[ai - 1], 0.5);
        ctl.to(choreo, { x: found[ai].x, y: found[ai].y, s: found[ai].s, tilt: found[ai].tilt, spin: found[ai].spin, roll: found[ai].roll, cx: found[ai].cx, cy: found[ai].cy, cz: found[ai].cz, duration: gap, ease: "sine.inOut" }, pos[ai - 1]);
        ctl.to(".film-bg__video", { filter: grade(found[ai]), duration: gap, ease: "sine.inOut" }, pos[ai - 1]);
      }
      ctl.to({}, { duration: Math.max(100 - pos[pos.length - 1], 0.5) }, pos[pos.length - 1]);
      actBreaks = found.map(function (a, i) { return { at: pos[i] / 100, label: a.label }; });
      paintAct(scrollState.progress || 0);
    }

    // Hero title parallax out (Apple-style).
    gsap.to(".hero__inner", {
      yPercent: -12, autoAlpha: 0.25, ease: "none",
      scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 1 }
    });

    // Subtle cinematic settle on the fixed footage across the full page.
    gsap.fromTo(".film-bg__video", { scale: 1.1 }, {
      scale: 1, ease: "none",
      scrollTrigger: { trigger: document.body, start: "top top", end: "bottom bottom", scrub: 1 }
    });

    ScrollTrigger.refresh();
    // Re-measure after fonts/assets settle so act anchors stay truthful.
    window.addEventListener("load", function () { ScrollTrigger.refresh(); });
  };

  if (video) {
    video.muted = true;
    video.playsInline = true;

    // Conventional asset paths (see README). Both are PROBED so a code-only
    // checkout — with no media committed — degrades gracefully to the gradient
    // film + procedural hero instead of logging 404s. Drop files in to enable.
    var FILM_SRC = "assets/media/scrub-film.mp4";
    var scrubBuilt = false;

    // Warm the film into memory: fetch the full mp4 once, then swap the
    // video element onto a blob URL. Seeks then hit local memory instead of
    // the network, which is what makes scrubbing feel instant.
    var warmFilm = function () {
      if (!("fetch" in window) || !FILM_SRC || /^blob:/.test(video.src)) return;
      fetch(FILM_SRC).then(function (res) {
        if (!res.ok) throw new Error("film fetch " + res.status);
        var total = parseInt(res.headers.get("Content-Length") || "0", 10);
        if (!res.body || !total) return res.blob().then(useBlob);
        var reader = res.body.getReader();
        var chunks = [];
        var got = 0;
        var pump = function () {
          return reader.read().then(function (r) {
            if (r.done) { useBlob(new Blob(chunks, { type: "video/mp4" })); return; }
            chunks.push(r.value);
            got += r.value.length;
            if (hudTime) hudTime.textContent = "LOADING FILM · " + Math.round(got / total * 100) + "%";
            return pump();
          });
        };
        return pump();
      }).catch(function () { /* progressive streaming continues */ });
    };
    var useBlob = function (blob) {
      try {
        var url = URL.createObjectURL(blob);
        var keepT = 0;
        try { keepT = video.currentTime || 0; } catch (e) {}
        video.src = url;
        video.addEventListener("loadedmetadata", function () {
          video.loop = false; // the blob swap must not resurrect playback
          try { video.pause(); } catch (e) {}
          try { video.currentTime = keepT; } catch (e) {}
          // clear the "LOADING FILM" HUD and repaint the timecode
          paintHud(video.currentTime || 0, video.duration || 0, scrollState.progress || 0);
          if (filmKick) filmKick();
        }, { once: true });
        try { video.load(); } catch (e) {}
      } catch (e) {}
    };

    var ready = function () {
      if (scrubBuilt) return;
      scrubBuilt = true;
      initScrub();
      warmFilm();
    };

    var startFilm = function () {
      video.src = FILM_SRC;
      try { video.load(); } catch (e) {}
      if (video.readyState >= 1 && isFinite(video.duration) && video.duration > 0) ready();
      else {
        video.addEventListener("loadedmetadata", ready, { once: true });
        video.addEventListener("error", initBeatsFallback, { once: true });
        // Safety: if metadata never arrives, fall back. Skipped once scrub owns it.
        setTimeout(function () { if (!scrubBuilt && (!isFinite(video.duration) || video.duration <= 0)) initBeatsFallback(); }, 6000);
      }
    };

    // Only fetch the film if it actually exists (avoids console 404s when the
    // template ships without media). Add assets/media/scrub-film.mp4 to enable it.
    if ("fetch" in window) {
      fetch(FILM_SRC, { method: "HEAD" })
        .then(function (r) { if (r.ok) startFilm(); })
        .catch(function () { startFilm(); });
    } else { startFilm(); }
  }

  /* =====================================================
     HERO 3D — assets/Objects/hero.glb
     (export any Blender object via the skill; procedural fallback if absent)
     three.js via local importmap, dynamic import so the page
     never breaks if WebGL or the model is unavailable.
     ===================================================== */
  var statusEl = document.getElementById("hero3dStatus");
  var say = function (t) { if (statusEl) statusEl.textContent = t; };

  // Procedural rust texture fallback (no external assets needed).
  var makeRustTexture = function (THREE) {
    var c = document.createElement("canvas"); c.width = c.height = 512;
    var g = c.getContext("2d");
    g.fillStyle = "#6b5a52"; g.fillRect(0, 0, 512, 512);
    for (var i = 0; i < 5200; i++) {
      var x = Math.random() * 512, y = Math.random() * 512, r = 1 + Math.random() * 7;
      var tones = ["#7a4a2b", "#8a5a33", "#4e3a30", "#a06a3a", "#3c2f2a", "#b07a45"];
      g.fillStyle = tones[(Math.random() * tones.length) | 0];
      g.globalAlpha = 0.12 + Math.random() * 0.5;
      g.beginPath(); g.arc(x, y, r, 0, 7); g.fill();
    }
    g.globalAlpha = 0.25; g.strokeStyle = "#2e2521";
    for (var s = 0; s < 40; s++) {
      g.lineWidth = 0.6 + Math.random() * 1.6;
      g.beginPath(); var sx = Math.random() * 512; g.moveTo(sx, 0); g.lineTo(sx + (Math.random() * 40 - 20), 512); g.stroke();
    }
    var tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    return tex;
  };

  var initHero3D = async function () {
    var canvas = document.getElementById("hero3d");
    if (!canvas || reduceMotion.matches) { if (!canvas) return; }
    var THREE, GLTFLoader, RoomEnvironment;
    try {
      THREE = await import("three");
      var lmod = await import("three/addons/loaders/GLTFLoader.js");
      var emod = await import("three/addons/environments/RoomEnvironment.js");
      GLTFLoader = lmod.GLTFLoader; RoomEnvironment = emod.RoomEnvironment;
    } catch (e) { say("3D unavailable offline — copy still shines."); return; }

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
    } catch (e) { say("WebGL unavailable — copy still shines."); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    var scene = new THREE.Scene();
    var camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
    camera.position.set(3.4, 2.1, 5.2);

    var pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

    // Echo the .blend studio rig: key / rim / fill / top-soft.
    var key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(4, 6, 3); scene.add(key);
    var rim = new THREE.DirectionalLight(0x88bbff, 1.6); rim.position.set(-5, 3, -4); scene.add(rim);
    var fill = new THREE.DirectionalLight(0xffd9a8, 0.7); fill.position.set(-2, 1, 5); scene.add(fill);
    scene.add(new THREE.AmbientLight(0xffffff, 0.25));

    var rig = new THREE.Group(); scene.add(rig);
    var spin = new THREE.Group(); rig.add(spin);
    rig.position.y = 0.15;

    var fitObject = function (obj) {
      var box = new THREE.Box3().setFromObject(obj);
      var size = box.getSize(new THREE.Vector3());
      var center = box.getCenter(new THREE.Vector3());
      obj.position.sub(center);
      var maxDim = Math.max(size.x, size.y, size.z) || 1;
      var s = 2.3 / maxDim;
      obj.scale.multiplyScalar(s);
      return s;
    };

    var setStatus = function (ok) { say("procesor proflowsync · scroll steruje"); if (statusEl) setTimeout(function(){ statusEl.style.opacity = "0"; }, 3200); };

    // Hero proflowsync: procesor z logo (budowany w kodzie, barwy marki).
    var makeLogoTex = function () {
      var c = document.createElement("canvas"); c.width = c.height = 512; var g = c.getContext("2d");
      g.fillStyle = "#0a0c1e"; g.fillRect(0, 0, 512, 512);
      g.strokeStyle = "#28e0c8"; g.globalAlpha = 0.35; g.lineWidth = 2;
      for (var i = 1; i < 11; i++) { g.beginPath(); g.moveTo(32, 32 + i * 42); g.lineTo(480, 32 + i * 42); g.stroke(); g.beginPath(); g.moveTo(32 + i * 42, 32); g.lineTo(32 + i * 42, 480); g.stroke(); }
      g.globalAlpha = 1; var grd = g.createLinearGradient(100, 0, 412, 0);
      grd.addColorStop(0, "#28e0c8"); grd.addColorStop(0.5, "#7c5cff"); grd.addColorStop(1, "#ff5ca8");
      g.shadowColor = "#7c5cff"; g.shadowBlur = 34; g.fillStyle = grd; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "800 190px Inter,Arial,sans-serif"; g.fillText("◆", 256, 205);
      g.font = "800 62px Inter,Arial,sans-serif"; g.fillText("proflowsync", 256, 345);
      var t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
    };
    var usePlaceholder = function () {
      var W = 1.65, Hh = 0.38, D = 1.65;
      var body = new THREE.Mesh(new THREE.BoxGeometry(W, Hh, D),
        new THREE.MeshStandardMaterial({ color: 0x0b0d1c, emissive: new THREE.Color(0x7c5cff), emissiveIntensity: 0.22, metalness: 0.9, roughness: 0.32 }));
      spin.add(body);
      var logo = makeLogoTex();
      var top = new THREE.Mesh(new THREE.PlaneGeometry(W * 0.9, D * 0.9),
        new THREE.MeshStandardMaterial({ map: logo, emissiveMap: logo, emissive: new THREE.Color(0xffffff), emissiveIntensity: 0.55, roughness: 0.4, metalness: 0.25 }));
      top.rotation.x = -Math.PI / 2; top.position.y = Hh / 2 + 0.012; spin.add(top);
      var edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(W, Hh, D)),
        new THREE.LineBasicMaterial({ color: 0x28e0c8, transparent: true, opacity: 0.7 }));
      spin.add(edge);
      var pinMat = new THREE.MeshStandardMaterial({ color: 0xd9b24a, metalness: 0.95, roughness: 0.28 });
      var per = 12, dummy = new THREE.Object3D(), k = 0;
      var pins = new THREE.InstancedMesh(new THREE.BoxGeometry(0.075, 0.05, 0.2), pinMat, per * 4);
      for (var i = 0; i < per; i++) {
        var t = -W / 2 + (W / (per - 1)) * i;
        dummy.position.set(t, 0, D / 2 + 0.11); dummy.rotation.set(0, 0, 0); dummy.updateMatrix(); pins.setMatrixAt(k++, dummy.matrix);
        dummy.position.set(t, 0, -D / 2 - 0.11); dummy.updateMatrix(); pins.setMatrixAt(k++, dummy.matrix);
        dummy.position.set(W / 2 + 0.11, 0, t); dummy.rotation.set(0, Math.PI / 2, 0); dummy.updateMatrix(); pins.setMatrixAt(k++, dummy.matrix);
        dummy.position.set(-W / 2 - 0.11, 0, t); dummy.updateMatrix(); pins.setMatrixAt(k++, dummy.matrix);
      }
      spin.add(pins);
      setStatus(false);
    };
    usePlaceholder();

    // Ground shadow-catcher glow.
    var shadowTex = (function () {
      var c = document.createElement("canvas"); c.width = c.height = 256;
      var g = c.getContext("2d");
      var grad = g.createRadialGradient(128, 128, 10, 128, 128, 128);
      grad.addColorStop(0, "rgba(0,0,0,.5)"); grad.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
      return new THREE.CanvasTexture(c);
    })();
    var shadow = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 4.4), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = -1.25; scene.add(shadow);

    // Interaction: mouse parallax only. The stage is fixed + pointer-transparent
    // (content must stay clickable), so orbit is driven by mouse position and
    // the shared full-page scroll clock — the box never leaves the center.
    var targetRX = 0.25, targetRY = 0.6, curRX = 0.25, curRY = 0.6;
    var mx = 0, my = 0;
    window.addEventListener("pointermove", function (e) {
      mx = (e.clientX / window.innerWidth - 0.5); my = (e.clientY / window.innerHeight - 0.5);
    }, { passive: true });

    var resize = function () {
      var w = canvas.clientWidth || canvas.parentElement.clientWidth || window.innerWidth;
      var h = canvas.clientHeight || canvas.parentElement.clientHeight || window.innerHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / Math.max(h, 1);
      camera.updateProjectionMatrix();
    };
    window.addEventListener("resize", resize); resize();

    // Full-page side travel fades out on narrow screens so the box stays
    // centered instead of sliding off-canvas.
    var sxFactor = function () { return Math.min(1, (window.innerWidth || 1200) / 1100); };

    var clock = new THREE.Clock();
    var tick = function () {
      requestAnimationFrame(tick);
      var t = clock.getElapsedTime();
      if (!reduceMotion.matches) targetRY += 0.0016; // gentle idle life
      curRX += (targetRX - curRX) * 0.06;
      curRY += (targetRY - curRY) * 0.06;
      // Act choreography (tweened by the scrubbed timeline above): rotation,
      // stage position, scale and camera dolly. Scroll up and every value
      // reverses along the same path — box, camera and film stay in sync.
      spin.rotation.set(
        curRX + choreo.tilt,
        curRY + choreo.spin,
        choreo.roll
      );
      rig.position.set(choreo.x * sxFactor(), choreo.y, 0);
      rig.scale.setScalar(Math.max(choreo.s, 0.2));
      shadow.position.x = choreo.x * sxFactor();
      shadow.scale.setScalar(Math.max(choreo.s, 0.2));
      spin.position.y = Math.sin(t * 0.9) * 0.08;
      camera.position.x += ((3.4 + choreo.cx + mx * 0.7) - camera.position.x) * 0.04;
      camera.position.y += ((2.1 + choreo.cy - my * 0.5) - camera.position.y) * 0.04;
      camera.position.z += ((5.2 + choreo.cz) - camera.position.z) * 0.06;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    };
    if (reduceMotion.matches) { renderer.render(scene, camera); }
    else tick();
  };

  if (document.readyState === "complete" || document.readyState === "interactive") initHero3D();
  else document.addEventListener("DOMContentLoaded", initHero3D);
})();
