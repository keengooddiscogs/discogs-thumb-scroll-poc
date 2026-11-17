/* =====================================================================
   Thumb scroll + jump indicator prototype
   Figma: "Collection Side Nav Jump List & Thumb Scroll" (2728:65746)

   The whole behaviour lives in ThumbScroll below and only needs:
     - a scroll container (the list)
     - an ordered array of sections: { key, el }
   Everything else in this file is scaffolding (data, rendering, notes).
   ===================================================================== */

(function () {
  "use strict";

  // ---------- tunables (the numbers devs care about) ----------
  const HIDE_DELAY_MS = 1000;     // Figma: "disappears after a 1sec delay"
  const MIN_SCREENS = 3;          // assumption 8: no thumb under 3 screens of content
  const TRACK_INSET = 20;         // px gap below header / above tab bar (Figma: thumb y=254.6, header ends 234)
  const THUMB_SIZE = 48;          // Figma symbol 21811:1965

  // ---------- data ----------
  function stripForSort(s) {
    return s
      .normalize("NFD").replace(/[̀-ͯ]/g, "") // Björk → Bjork
      .replace(/^(the|a|an)\s+/i, "")                    // "The Beatles" sorts under B
      .toUpperCase();
  }
  function letterKey(s) {
    const c = stripForSort(s).replace(/^[^A-Z0-9]+/, "").charAt(0);
    return /[A-Z]/.test(c) ? c : "#";
  }

  // deterministic pseudo-random "date added" so reloads match
  function seeded(i) {
    const x = Math.sin(i * 9301 + 49297) * 233280;
    return x - Math.floor(x);
  }
  const ALL = RECORDS.map((r, i) => {
    const added = 1999 + Math.floor(Math.pow(seeded(i), 0.6) * 28); // skews recent, 1999–2026
    return { artist: r[0], title: r[1], year: r[2], country: r[3], format: r[4], added, id: i };
  });
  const SHORT = ALL.filter((_, i) => i % 19 === 0).slice(0, 8);

  const SORTS = {
    artist: {
      chip: "Artist (A–Z)",
      cmp: (a, b) => cmpKey(a.artist, b.artist) || a.year - b.year,
      key: (r) => letterKey(r.artist),
    },
    title: {
      chip: "Title (A–Z)",
      cmp: (a, b) => cmpKey(a.title, b.title),
      key: (r) => letterKey(r.title),
    },
    added: {
      chip: "Date Added",
      cmp: (a, b) => b.added - a.added || cmpKey(a.artist, b.artist),
      key: (r) => String(r.added),
    },
  };
  function cmpKey(a, b) {
    const ka = letterKey(a) === "#" ? "~" + a : stripForSort(a); // "#" group goes last
    const kb = letterKey(b) === "#" ? "~" + b : stripForSort(b);
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  }

  // ---------- rendering ----------
  const state = { sort: "artist", size: "full" };
  const list = document.getElementById("list");

  function tileColor(s) {
    let h = 0;
    for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return `hsl(${h % 360} 22% 42%)`;
  }
  function esc(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  function render() {
    const sort = SORTS[state.sort];
    const rows = (state.size === "short" ? SHORT : ALL).slice().sort(sort.cmp);

    const groups = [];
    for (const r of rows) {
      const k = sort.key(r);
      if (!groups.length || groups[groups.length - 1].key !== k) groups.push({ key: k, rows: [] });
      groups[groups.length - 1].rows.push(r);
    }

    let html =
      '<section class="value-card">' +
      '<div class="vc-head">Estimated Collection Value: <span>Based on last 30 sales</span></div>' +
      '<div class="vc-cols"><div>Low<b>$999</b></div><div>Med<b>$999k</b></div><div>High<b>$1.2M</b></div></div>' +
      "</section>" +
      `<div class="list-count">${rows.length} items</div>`;

    for (const g of groups) {
      html += `<section class="section" data-key="${esc(g.key)}"><div class="section-head">${esc(g.key)}</div>`;
      for (const r of g.rows) {
        html +=
          '<article class="card tappable" data-action="na">' +
          `<div class="thumb-img" style="background:${tileColor(r.title)}">${esc(letterKey(r.title))}</div>` +
          '<div class="meta">' +
          `<div class="t">${esc(r.title)}</div>` +
          `<div class="a">${esc(r.artist)}</div>` +
          `<div class="d">${r.year} · ${esc(r.country)}</div>` +
          `<div class="d">${esc(r.format)}</div>` +
          "</div>" +
          '<div class="menu"><svg width="4" height="16" viewBox="0 0 4 16"><circle cx="2" cy="2" r="1.6"/><circle cx="2" cy="8" r="1.6"/><circle cx="2" cy="14" r="1.6"/></svg></div>' +
          "</article>";
      }
      html += "</section>";
    }

    list.innerHTML = html;
    list.scrollTop = 0;
    document.getElementById("sortLabel").textContent = sort.chip;
    thumb.setSections([...list.querySelectorAll(".section")].map((el) => ({ key: el.dataset.key, el })));
  }

  // =====================================================================
  // ThumbScroll — the component
  // =====================================================================
  function ThumbScroll({ scroller, track, wrap, handle, label }) {
    let sections = [];          // [{ key, top }] top = offset inside scroller
    let pressed = false;        // finger on the thumb
    let screenPressed = false;  // finger anywhere on the list
    let hideTimer = 0;
    let grabOffset = 0;
    let currentKey = null;
    let enabled = false;

    // --- geometry ---
    function layout() {
      const top = scroller.offsetTop + TRACK_INSET;
      const h = scroller.clientHeight - TRACK_INSET * 2;
      track.style.top = top + "px";
      track.style.height = h + "px";
      enabled = scroller.scrollHeight >= scroller.clientHeight * MIN_SCREENS;
      sync();
    }
    const travel = () => track.clientHeight - THUMB_SIZE;
    const maxScroll = () => scroller.scrollHeight - scroller.clientHeight;

    function setSections(list) {
      sections = list.map((s) => ({ key: s.key, top: s.el.offsetTop }));
      currentKey = null;
      hide(true);
      layout();
    }

    // Figma: "Appears when first item in collection reaches the top
    // and collection value scrolls away"
    function pastThreshold() {
      return sections.length > 0 && scroller.scrollTop >= sections[0].top;
    }

    // section whose header has reached the top of the list
    function keyAt(scrollTop) {
      // short final sections never reach the top, so at the very bottom show the last one
      if (sections.length && scrollTop >= maxScroll() - 1) return sections[sections.length - 1].key;
      let lo = 0, hi = sections.length - 1, ans = 0;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (sections[mid].top <= scrollTop + 1) { ans = mid; lo = mid + 1; } else hi = mid - 1;
      }
      return sections.length ? sections[ans].key : "";
    }

    function positionFromScroll() {
      const p = maxScroll() > 0 ? scroller.scrollTop / maxScroll() : 0;
      wrap.style.transform = `translateY(${Math.round(p * travel())}px)`;
    }

    function updateLabel() {
      const k = keyAt(scroller.scrollTop);
      if (k !== currentKey) {
        if (pressed && currentKey !== null && navigator.vibrate) navigator.vibrate(4); // assumption 9
        currentKey = k;
        label.textContent = k;
      }
    }

    // --- visibility ---
    function show() {
      clearTimeout(hideTimer);
      wrap.classList.add("visible");
    }
    function hide(now) {
      clearTimeout(hideTimer);
      if (now) { wrap.classList.remove("visible"); return; }
      hideTimer = setTimeout(() => {
        if (!pressed && !screenPressed) wrap.classList.remove("visible");
      }, HIDE_DELAY_MS);
    }
    function sync() {
      positionFromScroll();
      updateLabel();
    }

    // --- scroll ---
    scroller.addEventListener("scroll", () => {
      sync();
      if (pressed) return;                          // drag owns visibility
      if (!enabled || !pastThreshold()) return hide(true);
      show();
      if (!screenPressed) hide();                   // restart the 1s countdown
    }, { passive: true });

    // finger resting on the list keeps the thumb up (Figma: "stops pressing the screen")
    scroller.addEventListener("pointerdown", () => { screenPressed = true; clearTimeout(hideTimer); });
    const release = () => {
      if (!screenPressed) return;
      screenPressed = false;
      if (wrap.classList.contains("visible") && !pressed) hide();
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
    // touch scrolling fires pointercancel on the list once the browser takes over the
    // gesture, so also listen for touchend to know when the finger actually lifts
    scroller.addEventListener("touchend", release, { passive: true });

    // --- drag the thumb (assumption 5) ---
    handle.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      pressed = true;
      show();
      wrap.classList.add("pressed");
      const r = wrap.getBoundingClientRect();
      grabOffset = e.clientY - r.top;
      currentKey = keyAt(scroller.scrollTop);
      label.textContent = currentKey;
    });
    handle.addEventListener("pointermove", (e) => {
      if (!pressed) return;
      const t = track.getBoundingClientRect();
      const y = Math.min(Math.max(e.clientY - t.top - grabOffset, 0), travel());
      scroller.scrollTop = (y / travel()) * maxScroll();
      wrap.style.transform = `translateY(${Math.round(y)}px)`; // follow finger exactly
      updateLabel();
    });
    const endDrag = (e) => {
      if (!pressed) return;
      pressed = false;
      wrap.classList.remove("pressed");
      try { handle.releasePointerCapture(e.pointerId); } catch (_) {}
      if (!pastThreshold()) hide(true); else hide();
    };
    handle.addEventListener("pointerup", endDrag);
    handle.addEventListener("pointercancel", endDrag);

    window.addEventListener("resize", layout);
    return { setSections, layout };
  }

  const thumb = ThumbScroll({
    scroller: list,
    track: document.getElementById("track"),
    wrap: document.getElementById("thumbWrap"),
    handle: document.getElementById("thumb"),
    label: document.getElementById("jumpLabel"),
  });

  // ---------- notes panel + controls ----------
  const phone = document.getElementById("phone");
  const tpl = document.getElementById("notesTpl");
  const containers = [document.getElementById("notes"), document.getElementById("sheet")];
  containers.forEach((c) => c.appendChild(tpl.content.cloneNode(true)));

  function bindControls() {
    containers.forEach((c) => {
      c.querySelector("#ctlSort").addEventListener("change", (e) => setSort(e.target.value));
      c.querySelector("#ctlSize").addEventListener("change", (e) => { state.size = e.target.value; syncControls(); render(); });
      c.querySelector("#ctlDebug").addEventListener("change", (e) => {
        phone.classList.toggle("debug", e.target.checked);
        syncControls();
      });
    });
  }
  function syncControls() {
    containers.forEach((c) => {
      c.querySelector("#ctlSort").value = state.sort;
      c.querySelector("#ctlSize").value = state.size;
      c.querySelector("#ctlDebug").checked = phone.classList.contains("debug");
    });
  }
  function setSort(s) {
    state.sort = s;
    syncControls();
    render();
  }

  // ---------- taps ----------
  const toastEl = document.getElementById("toast");
  let toastTimer = 0;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1400);
  }
  const SORT_ORDER = ["artist", "added", "title"];
  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-action]");
    if (!t) return;
    const a = t.dataset.action;
    if (a === "na") toast("Not in this prototype");
    else if (a === "sort") {
      const next = SORT_ORDER[(SORT_ORDER.indexOf(state.sort) + 1) % SORT_ORDER.length];
      setSort(next);
      toast("Sorted by " + SORTS[next].chip);
    } else if (a === "notes") phone.classList.add("sheet-open");
    else if (a === "close-notes") phone.classList.remove("sheet-open");
  });

  bindControls();
  syncControls();
  render();
  if (document.fonts) document.fonts.ready.then(() => thumb.layout());
})();
