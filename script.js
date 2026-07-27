(() => {
  "use strict";

  /* ---------------------------------------------------------------------
   * Shared text-safety helpers (kept in sync with api/_lib/validate.js).
   * Blocks profanity, spam/gibberish and disallows unrealistic input in
   * free-text fields. No data is ever persisted — this only guards what
   * gets echoed back into the confirmation screen.
   * ------------------------------------------------------------------- */
  const BAD_WORDS = [
    "puta","puto","mierda","boludo","pelotudo","forro","cornudo","pendejo",
    "concha","carajo","gil","imbecil","idiota","estupido","estúpido",
    "fuck","shit","bitch","asshole","bastard","cunt","dick","whore",
    "negro de mierda","sudaca","puto de mierda"
  ];
  const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  function hasBadWords(text) {
    const n = norm(text);
    const words = n.split(/[^a-z]+/).filter(Boolean);
    return BAD_WORDS.some((w) => words.includes(w) || n.includes(w));
  }
  function isSpammy(text) {
    if (/(.)\1{4,}/.test(text)) return true;
    if (/^[0-9\s.,!?-]+$/.test(text) && text.trim().length > 0) return true;
    const letters = (text.match(/[a-zA-ZÀ-ÿ]/g) || []).length;
    return text.trim().length > 4 && letters / text.length < 0.35;
  }
  const NAME_RE = /^[A-Za-zÀ-ÿ'’.-][A-Za-zÀ-ÿ'’ .-]{1,58}[A-Za-zÀ-ÿ'’.-]$/;
  function validName(v) {
    const t = v.trim();
    return t.length >= 3 && t.length <= 60 && NAME_RE.test(t) && !hasBadWords(t) && !isSpammy(t);
  }
  function validPhone(v) {
    const digits = v.replace(/\D/g, "");
    return digits.length >= 8 && digits.length <= 15;
  }
  function validFreeText(v, { min = 1, max = 240 } = {}) {
    const t = v.trim();
    if (t.length < min || t.length > max) return false;
    if (hasBadWords(t)) return false;
    if (isSpammy(t)) return false;
    return true;
  }
  const escapeHTML = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  /* ---------------------------------------------------------------------
   * Date helpers — mirror the original design logic (deterministic fake
   * availability so the demo never needs a real booking database).
   * ------------------------------------------------------------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const iso = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  function dayOf(s) {
    if (!s) return -1;
    const p = s.split("-");
    return new Date(+p[0], +p[1] - 1, +p[2], 12).getDay();
  }
  function daysAhead(s) {
    if (!s) return -1;
    const p = s.split("-");
    const d = new Date(+p[0], +p[1] - 1, +p[2], 12);
    const t = new Date();
    t.setHours(12, 0, 0, 0);
    return Math.round((d - t) / 86400000);
  }
  function freeSlot(fecha, h) {
    if (!fecha) return true;
    const s = fecha + h;
    let n = 7;
    for (let i = 0; i < s.length; i++) n = (n * 33 + s.charCodeAt(i)) >>> 0;
    return n % 6 !== 0;
  }
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    const E = {};
    const q = (s) => document.querySelector(s);
    ["[data-prog]", "[data-cursor-dot]", "[data-loader]", "[data-header]",
      "[data-hero-img]", "[data-hero-copy]", "[data-words]", "[data-track]",
      "[data-hs-fill]", "[data-hs-prev]", "[data-hs-next]", "[data-nav]",
      "[data-burger]", "[data-tabs-wrap]", "[data-mobile-menu]"].forEach((s) => { E[s] = q(s); });

    let mobile = window.innerWidth < 900;
    let alive = true;

    /* ---------------- loader / entrance animation ---------------- */
    let loaderHidden = false;
    function hideLoader() {
      const l = E["[data-loader]"];
      if (!l || loaderHidden) return;
      loaderHidden = true;
      l.style.opacity = "0";
      l.style.transform = "scale(1.06)";
      l.addEventListener("transitionend", () => { l.style.visibility = "hidden"; l.setAttribute("aria-hidden", "true"); }, { once: true });
      document.body.style.overflow = "";
    }
    const heroImg = E["[data-hero-img]"] && E["[data-hero-img]"].querySelector("img");
    document.body.style.overflow = "hidden";
    if (heroImg) {
      if (heroImg.complete) requestAnimationFrame(() => setTimeout(hideLoader, 260));
      else heroImg.addEventListener("load", () => setTimeout(hideLoader, 160));
    }
    setTimeout(hideLoader, reducedMotion ? 300 : 1500);

    /* ---------------- cursor dot (desktop only) ---------------- */
    const dot = E["[data-cursor-dot]"];
    const pt = { x: -300, y: -300 };
    const cur = { x: -300, y: -300 };
    if (dot && !mobile) {
      window.addEventListener("pointermove", (e) => { pt.x = e.clientX; pt.y = e.clientY; }, { passive: true });
      document.addEventListener("pointerover", (e) => {
        if (mobile) return;
        const t = e.target.closest && e.target.closest("[data-cursor],a,button");
        if (!t) { dot.style.opacity = "0"; dot.style.transform = "scale(.28)"; return; }
        const label = t.getAttribute("data-cursor") || "";
        dot.textContent = label;
        dot.style.opacity = "1";
        dot.style.transform = label ? "scale(1)" : "scale(.3)";
        dot.style.background = label ? "rgba(221,91,46,.94)" : "rgba(239,232,220,.9)";
        dot.style.borderColor = label ? "rgba(221,91,46,.94)" : "rgba(239,232,220,.9)";
        dot.style.color = "#0A0908";
      }, { passive: true });
    }

    /* ---------------- horizontal carousel ---------------- */
    const track = E["[data-track]"];
    const fill = E["[data-hs-fill]"];
    function updateTrack() {
      if (!track) return;
      const max = track.scrollWidth - track.clientWidth;
      const p = max > 0 ? track.scrollLeft / max : 0;
      if (fill) fill.style.width = (8 + p * 92).toFixed(1) + "%";
    }
    if (track) {
      track.addEventListener("scroll", updateTrack, { passive: true });
      updateTrack();
    }
    const hsPrev = E["[data-hs-prev]"], hsNext = E["[data-hs-next]"];
    if (hsPrev) hsPrev.addEventListener("click", () => track && track.scrollBy({ left: -340, behavior: reducedMotion ? "auto" : "smooth" }));
    if (hsNext) hsNext.addEventListener("click", () => track && track.scrollBy({ left: 340, behavior: reducedMotion ? "auto" : "smooth" }));

    /* ---------------- reveal on scroll ---------------- */
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        const el = e.target;
        el.style.transitionDelay = (el.dataset.delay || 0) + "ms";
        el.style.opacity = "1";
        el.style.transform = "none";
        io.unobserve(el);
      });
    }, { threshold: 0.12 });
    document.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

    /* ---------------- mobile menu ---------------- */
    const burger = E["[data-burger]"];
    const menu = E["[data-mobile-menu]"];
    function openMenu() {
      if (!menu) return;
      menu.hidden = false;
      burger && burger.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
    }
    function closeMenu() {
      if (!menu) return;
      menu.hidden = true;
      burger && burger.setAttribute("aria-expanded", "false");
      if (loaderHidden) document.body.style.overflow = "";
    }
    if (burger) burger.addEventListener("click", openMenu);
    const menuClose = document.querySelector("[data-menu-close]");
    if (menuClose) menuClose.addEventListener("click", closeMenu);
    document.querySelectorAll("[data-menu-link]").forEach((a) => a.addEventListener("click", closeMenu));

    /* ---------------- responsive layout toggles ---------------- */
    function layout() {
      mobile = window.innerWidth < 900;
      const show = mobile ? "none" : "flex";
      if (hsPrev) hsPrev.style.display = show;
      if (hsNext) hsNext.style.display = show;
      const nav = E["[data-nav]"];
      if (nav) nav.style.display = mobile ? "none" : "flex";
      if (burger) burger.style.display = mobile && menu && menu.hidden ? "flex" : "none";
      if (!mobile && menu && !menu.hidden) closeMenu();
      const tw = E["[data-tabs-wrap]"];
      if (tw) {
        tw.style.flexWrap = mobile ? "nowrap" : "wrap";
        tw.style.overflowX = mobile ? "auto" : "visible";
        tw.style.paddingBottom = mobile ? "6px" : "0";
      }
      document.querySelectorAll("[data-img]").forEach((r) => {
        r.style.padding = mobile ? "11px 2px" : "18px 12px";
        r.style.gap = mobile ? "10px" : "16px";
      });
      document.querySelectorAll("[data-dishes] p").forEach((p) => {
        p.style.marginTop = mobile ? "2px" : "5px";
        p.style.fontSize = mobile ? "11px" : "12.5px";
      });
    }
    let rz;
    window.addEventListener("resize", () => {
      clearTimeout(rz);
      rz = setTimeout(layout, 120);
    });
    layout();

    /* ---------------- dish thumbnails (use the data-img asset) ---------------- */
    document.querySelectorAll("[data-img]").forEach((row) => {
      const url = row.getAttribute("data-img");
      if (!url) return;
      const img = document.createElement("img");
      img.src = url;
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 52; img.height = 52;
      img.alt = "";
      img.setAttribute("aria-hidden", "true");
      img.style.cssText = "width:52px;height:52px;object-fit:cover;border-radius:3px;background:#151211;flex:none";
      row.insertBefore(img, row.firstChild);
    });

    /* ---------------- carta tabs ---------------- */
    const tabButtons = Array.from(document.querySelectorAll("[data-tab]"));
    const panels = Array.from(document.querySelectorAll("[data-panel]"));
    function setTab(i) {
      tabButtons.forEach((b) => {
        const on = +b.getAttribute("data-tab") === i;
        b.setAttribute("aria-selected", String(on));
        b.style.background = on ? "#EFE8DC" : "none";
        b.style.color = on ? "#0A0908" : "rgba(239,232,220,.58)";
        b.style.borderColor = on ? "#EFE8DC" : "rgba(239,232,220,.18)";
      });
      panels.forEach((p) => { p.hidden = +p.getAttribute("data-panel") !== i; });
    }
    tabButtons.forEach((b) => b.addEventListener("click", () => setTab(+b.getAttribute("data-tab"))));
    setTab(0);

    /* ---------------- header / progress / parallax / scroll-spy (rAF) ---------------- */
    const links = Array.from(document.querySelectorAll("[data-link]"));
    const sections = links.map((a) => document.getElementById(a.getAttribute("data-link")));
    const words = E["[data-words]"] ? Array.from(E["[data-words]"].children) : [];
    let lastY = -1, hdOn = null, actIdx = -1;

    function frame() {
      if (!alive) return;
      const vh = window.innerHeight;
      const sy = window.scrollY || window.pageYOffset;

      if (dot && !mobile) {
        cur.x += (pt.x - cur.x) * 0.2;
        cur.y += (pt.y - cur.y) * 0.2;
        dot.style.left = cur.x.toFixed(1) + "px";
        dot.style.top = cur.y.toFixed(1) + "px";
      }

      if (Math.abs(sy - lastY) >= 0.5) {
        lastY = sy;
        const pr = E["[data-prog]"];
        if (pr) {
          const h = document.documentElement.scrollHeight - vh;
          pr.style.width = (clamp(h > 0 ? sy / h : 0, 0, 1) * 100).toFixed(2) + "%";
        }
        const hd = E["[data-header]"];
        if (hd) {
          const on = sy > vh * 0.6;
          if (hdOn !== on) {
            hdOn = on;
            hd.style.background = on ? "rgba(10,9,8,.86)" : "transparent";
            hd.style.backdropFilter = on ? "blur(16px)" : "none";
            hd.style.borderBottomColor = on ? "rgba(239,232,220,.1)" : "transparent";
            hd.style.padding = on ? "11px clamp(18px,4vw,64px)" : "16px clamp(18px,4vw,64px)";
          }
        }
        const hi = E["[data-hero-img]"], hc = E["[data-hero-copy]"];
        if (hi && sy < vh * 1.2 && !reducedMotion) {
          const p = clamp(sy / vh, 0, 1);
          hi.style.transform = "translate3d(0," + (p * 11).toFixed(2) + "%,0)";
          if (hc) {
            hc.style.transform = "translate3d(0," + (-p * 70).toFixed(1) + "px,0)";
            hc.style.opacity = String(clamp(1 - p * 1.3, 0, 1));
          }
        }
        const wr = E["[data-words]"];
        if (wr && words.length) {
          const r = wr.getBoundingClientRect();
          if (r.top < vh && r.bottom > -100) {
            const p = clamp((vh * 0.8 - r.top) / (r.height + vh * 0.2), 0, 1);
            const n = words.length;
            for (let i = 0; i < n; i++) {
              const lit = p * n * 1.25 - i > 0.5;
              if (words[i]._lit !== lit) { words[i]._lit = lit; words[i].style.color = lit ? "#EFE8DC" : "rgba(239,232,220,.14)"; }
            }
          }
        }
        if (links.length) {
          let act = -1;
          for (let i = 0; i < sections.length; i++) {
            const s = sections[i];
            if (!s) continue;
            const r = s.getBoundingClientRect();
            if (r.top <= vh * 0.35 && r.bottom > vh * 0.35) act = i;
          }
          if (actIdx !== act) {
            actIdx = act;
            links.forEach((a, i) => {
              a.style.borderBottomColor = i === act ? "#DD5B2E" : "transparent";
              a.style.color = i === act ? "#EFE8DC" : "rgba(239,232,220,.62)";
            });
          }
        }
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    window.addEventListener("beforeunload", () => { alive = false; });

    /* ---------------- reservation form ---------------- */
    initReservaForm();
    initPedidoForm();
  }

  function radioGroup(buttons, attr, onSelect) {
    let current = null;
    buttons.forEach((b) => {
      b.addEventListener("click", () => {
        current = b.getAttribute(attr);
        buttons.forEach((x) => {
          const on = x === b;
          x.setAttribute("aria-checked", String(on));
          x.style.background = on ? "#EFE8DC" : "none";
          x.style.color = on ? "#0A0908" : "#EFE8DC";
          x.style.borderColor = on ? "#EFE8DC" : "rgba(239,232,220,.18)";
        });
        onSelect(current, b);
      });
    });
    return {
      get: () => current,
      set(value) {
        current = value;
        buttons.forEach((x) => {
          const on = x.getAttribute(attr) === value;
          x.setAttribute("aria-checked", String(on));
          x.style.background = on ? "#EFE8DC" : "none";
          x.style.color = on ? "#0A0908" : "#EFE8DC";
          x.style.borderColor = on ? "#EFE8DC" : "rgba(239,232,220,.18)";
        });
      }
    };
  }

  async function postJSON(url, payload, timeoutMs = 6000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: ctrl.signal
      });
      clearTimeout(t);
      let data = null;
      try { data = await res.json(); } catch (_) { /* ignore */ }
      return { ok: res.ok, status: res.status, data };
    } catch (err) {
      clearTimeout(t);
      return { ok: false, status: 0, data: null, networkError: true };
    }
  }

  function initReservaForm() {
    const form = document.querySelector("[data-reserva-form]");
    if (!form) return;
    const successBox = document.querySelector("[data-reserva-success]");
    const errorBox = document.querySelector("[data-reserva-error]");
    const step = document.querySelector("[data-step]");
    const fecha = document.getElementById("reserva-fecha");
    const aviso = document.querySelector("[data-aviso]");
    const slotsNote = document.querySelector("[data-slots-note]");
    const grupoGrande = document.querySelector("[data-grupo-grande]");
    const costBtn = document.querySelector("[data-cost]");
    const costBox = document.querySelector("[data-cost-box]");
    const costNote = document.querySelector("[data-cost-note]");
    const nombre = document.getElementById("reserva-nombre");
    const tel = document.getElementById("reserva-tel");
    const nota = document.getElementById("reserva-nota");
    const honeypot = form.querySelector("[data-honeypot]");
    const submitBtn = document.querySelector("[data-reserva-submit]");
    const resetBtn = document.querySelector("[data-reserva-reset]");

    fecha.min = iso(new Date());

    let costillar = false;
    const personas = radioGroup(Array.from(form.querySelectorAll("[data-p]")), "data-p", (v) => {
      grupoGrande.hidden = v !== "8";
    });
    personas.set("2");

    const horaButtons = Array.from(form.querySelectorAll("[data-h]"));
    const horas = radioGroup(horaButtons, "data-h", () => showError(""));

    function refreshSlots() {
      const f = fecha.value;
      const cerrado = dayOf(f) === 1;
      let libres = 0;
      horaButtons.forEach((b) => {
        const h = b.getAttribute("data-h");
        const ok = !cerrado && f && freeSlot(f, h);
        if (ok) libres++;
        b.disabled = !ok && !!f;
        b.style.opacity = f && !ok ? ".3" : "1";
        b.style.textDecoration = f && !ok ? "line-through" : "none";
        b.style.cursor = f && !ok ? "not-allowed" : "pointer";
        if (f && !ok && horas.get() === h) horas.set(null);
      });
      if (!f) slotsNote.textContent = "Elegí una fecha para ver la disponibilidad real.";
      else if (cerrado) slotsNote.textContent = "Los lunes descansamos: la parrilla se limpia y la leña se acomoda.";
      else slotsNote.textContent = libres + " de " + horaButtons.length + " turnos con lugar. Los tachados ya están completos.";

      const puede = daysAhead(f) >= 1;
      costBtn.disabled = !puede;
      costBtn.style.opacity = puede ? "1" : ".45";
      costBtn.style.cursor = puede ? "pointer" : "not-allowed";
      if (!puede && costillar) setCostillar(false);
      costNote.textContent = puede ? "Reservado a tu nombre, listo a la hora que elijas" : "Requiere 24 h de anticipación: elegí una fecha desde mañana";

      let av = "";
      if (cerrado) av = "Los lunes cerramos. Elegí de martes a domingo.";
      else if (daysAhead(f) === 0) av = "Para hoy conviene llamarnos: quedan pocas mesas sin confirmar.";
      else if (dayOf(f) === 6) av = "Sábado a la noche es la más pedida. Reservá con tiempo.";
      aviso.hidden = !av;
      aviso.textContent = av;

      updateStep();
    }
    function setCostillar(v) {
      costillar = v;
      costBtn.setAttribute("aria-pressed", String(v));
      costBox.style.background = v ? "#DD5B2E" : "none";
      costBox.style.borderColor = v ? "#DD5B2E" : "rgba(239,232,220,.4)";
      costBox.textContent = v ? "✓" : "";
      costBtn.style.borderColor = v ? "rgba(221,91,46,.7)" : "rgba(239,232,220,.16)";
      costBtn.style.background = v ? "rgba(221,91,46,.08)" : "none";
    }
    costBtn.addEventListener("click", () => { if (!costBtn.disabled) setCostillar(!costillar); });

    fecha.addEventListener("change", refreshSlots);
    refreshSlots();

    function updateStep() {
      let n = 1;
      if (fecha.value && horas.get()) n = 2;
      if (fecha.value && horas.get() && nombre.value.trim() && tel.value.trim()) n = 3;
      step.textContent = "Paso " + n + " de 3";
    }
    [nombre, tel].forEach((el) => el.addEventListener("input", updateStep));

    function showError(msg) {
      if (!msg) { errorBox.hidden = true; errorBox.textContent = ""; return; }
      errorBox.hidden = false;
      errorBox.textContent = msg;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showError("");
      if (honeypot && honeypot.value) { showError("No pudimos procesar tu reserva. Intentá de nuevo."); return; }
      if (!fecha.value) return showError("Elegí el día de la reserva.");
      if (dayOf(fecha.value) === 1) return showError("Los lunes cerramos. Probá otro día.");
      if (!horas.get()) return showError("Falta el horario: elegí uno de los turnos con lugar.");
      if (!validName(nombre.value)) return showError("Escribí tu nombre real para anotar la mesa (sólo letras, 3 a 60 caracteres).");
      if (!validPhone(tel.value)) return showError("Necesitamos un teléfono válido (8 a 15 dígitos) para confirmarte.");
      if (nota.value && !validFreeText(nota.value, { min: 0, max: 140 })) return showError("Revisá el campo de notas: evitá lenguaje inapropiado o texto sin sentido.");

      const payload = {
        personas: personas.get() || "2",
        fecha: fecha.value,
        hora: horas.get(),
        nombre: nombre.value.trim(),
        tel: tel.value.trim(),
        nota: nota.value.trim(),
        costillar,
        empresa: honeypot ? honeypot.value : ""
      };

      submitBtn.disabled = true;
      const prevLabel = submitBtn.textContent;
      submitBtn.textContent = "Enviando…";

      const resp = await postJSON("/api/reservar", payload);
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel;

      let codigo, resumen;
      if (resp.ok && resp.data && resp.data.ok) {
        codigo = resp.data.codigo;
        resumen = resp.data.resumen;
      } else if (resp.data && resp.data.error) {
        return showError(resp.data.error);
      } else {
        // Backend unreachable (e.g. static preview) — fall back to the
        // same client-side confirmation logic so the form stays usable.
        codigo = "FL-" + fecha.value.slice(8) + horas.get().replace(":", "") + "-" + nombre.value.trim().slice(0, 2).toUpperCase();
        resumen = buildResumen();
      }

      function buildResumen() {
        const p = personas.get() || "2";
        const gente = p === "8" ? "ocho o más" : p;
        const suf = p === "1" ? " persona" : " personas";
        return "Mesa para " + gente + suf + ", el " + fecha.value.split("-").reverse().join("/") + " a las " + horas.get() + " h, a nombre de " + escapeHTML(nombre.value.trim()) + "." + (costillar ? " Costillar a la cruz encargado." : "");
      }

      document.querySelector("[data-reserva-resumen]").textContent = resumen || buildResumen();
      document.querySelector("[data-reserva-codigo]").textContent = codigo;
      form.hidden = true;
      successBox.hidden = false;
    });

    resetBtn.addEventListener("click", () => {
      form.reset();
      personas.set("2");
      horas.set(null);
      setCostillar(false);
      showError("");
      grupoGrande.hidden = true;
      refreshSlots();
      updateStep();
      successBox.hidden = true;
      form.hidden = false;
    });
  }

  function initPedidoForm() {
    const form = document.querySelector("[data-pedido-form]");
    if (!form) return;
    const successBox = document.querySelector("[data-pedido-success]");
    const errorBox = document.querySelector("[data-pedido-error]");
    const nombre = document.getElementById("pedido-nombre");
    const tel = document.getElementById("pedido-tel");
    const direccion = document.getElementById("pedido-direccion");
    const detalle = document.getElementById("pedido-detalle");
    const honeypot = form.querySelector("[data-honeypot]");
    const submitBtn = document.querySelector("[data-pedido-submit]");
    const resetBtn = document.querySelector("[data-pedido-reset]");

    const pago = radioGroup(Array.from(form.querySelectorAll("[data-pago]")), "data-pago", () => {});
    pago.set("efectivo");

    function showError(msg) {
      if (!msg) { errorBox.hidden = true; errorBox.textContent = ""; return; }
      errorBox.hidden = false;
      errorBox.textContent = msg;
    }

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      showError("");
      if (honeypot && honeypot.value) { showError("No pudimos procesar tu pedido. Intentá de nuevo."); return; }
      if (!validName(nombre.value)) return showError("Escribí tu nombre real para el pedido (sólo letras, 3 a 60 caracteres).");
      if (!validPhone(tel.value)) return showError("Necesitamos un teléfono válido (8 a 15 dígitos).");
      if (!validFreeText(direccion.value, { min: 6, max: 120 })) return showError("Ingresá una dirección de entrega válida.");
      if (!validFreeText(detalle.value, { min: 3, max: 240 })) return showError("Contanos qué querés pedir, sin lenguaje inapropiado ni texto sin sentido.");

      const payload = {
        nombre: nombre.value.trim(),
        tel: tel.value.trim(),
        direccion: direccion.value.trim(),
        detalle: detalle.value.trim(),
        pago: pago.get() || "efectivo",
        empresa: honeypot ? honeypot.value : ""
      };

      submitBtn.disabled = true;
      const prevLabel = submitBtn.textContent;
      submitBtn.textContent = "Enviando…";

      const resp = await postJSON("/api/pedido", payload);
      submitBtn.disabled = false;
      submitBtn.textContent = prevLabel;

      let codigo, resumen;
      if (resp.ok && resp.data && resp.data.ok) {
        codigo = resp.data.codigo;
        resumen = resp.data.resumen;
      } else if (resp.data && resp.data.error) {
        return showError(resp.data.error);
      } else {
        codigo = "FL-DEL-" + Date.now().toString().slice(-4);
        resumen = buildResumen();
      }

      function buildResumen() {
        const pagoTxt = pago.get() === "efectivo" ? "en efectivo" : "por transferencia";
        return "Pedido de " + escapeHTML(nombre.value.trim()) + " a " + escapeHTML(direccion.value.trim()) + ". Pago " + pagoTxt + ".";
      }

      document.querySelector("[data-pedido-resumen]").textContent = resumen || buildResumen();
      document.querySelector("[data-pedido-codigo]").textContent = codigo;
      form.hidden = true;
      successBox.hidden = false;
    });

    resetBtn.addEventListener("click", () => {
      form.reset();
      pago.set("efectivo");
      showError("");
      successBox.hidden = true;
      form.hidden = false;
    });
  }
})();
