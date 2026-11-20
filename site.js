// Вкладки с кодом в статьях, запуск видео на странице «Выступления», рыбки на главной и их цвета.
(function () {
  // ---------- цвет рыбок: случайный из палитры --fish-1…--fish-6 (styles.css), без повторов на странице ----------
  var FISH_COLORS = 6, usedColors = [];
  function paintFish(el) {
    var free = [];
    for (var i = 1; i <= FISH_COLORS; i++) if (usedColors.indexOf(i) < 0) free.push(i);
    if (!free.length) { usedColors = []; return paintFish(el); }
    var k = free[Math.floor(Math.random() * free.length)];
    usedColors.push(k);
    el.style.setProperty("--fish-color", "var(--fish-" + k + ")");
  }
  document.querySelectorAll(".site-foot .mono, .lost-art .swim").forEach(paintFish);

  // ---------- вкладки: выбранный язык одинаковый во всех блоках страницы ----------
  var KEY = "code-lang";
  var groups = document.querySelectorAll(".tabs");

  function choose(lang, remember) {
    groups.forEach(function (g) {
      var panels = g.querySelectorAll(".tab-panel");
      var has = Array.prototype.some.call(panels, function (p) { return p.dataset.lang === lang; });
      var pick = has ? lang : panels[0].dataset.lang;
      panels.forEach(function (p) { p.hidden = p.dataset.lang !== pick; });
      g.querySelectorAll('[role="tab"]').forEach(function (b) {
        var on = b.dataset.lang === pick;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
    });
    if (remember) { try { localStorage.setItem(KEY, lang); } catch (e) {} }
  }

  if (groups.length) {
    groups.forEach(function (g) {
      g.classList.add("tabs-ready");
      g.querySelector(".tab-list").hidden = false;
      g.querySelectorAll('[role="tab"]').forEach(function (b) {
        b.addEventListener("click", function () {
          var top = b.getBoundingClientRect().top;
          choose(b.dataset.lang, true);
          // не даём странице «прыгнуть», если блоки выше изменили высоту
          window.scrollBy(0, b.getBoundingClientRect().top - top);
        });
      });
    });
    var saved = null;
    try { saved = localStorage.getItem(KEY); } catch (e) {}
    choose(saved || groups[0].querySelector(".tab-panel").dataset.lang, false);
  }

  // ---------- видео: YouTube грузится только после нажатия ----------
  document.querySelectorAll(".talk-player[data-yt]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var id = btn.dataset.yt;
      var frame = document.createElement("iframe");
      frame.src = "https://www.youtube-nocookie.com/embed/" + encodeURIComponent(id) + "?autoplay=1&rel=0";
      frame.title = btn.getAttribute("aria-label") || "Видео";
      frame.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      frame.allowFullscreen = true;
      frame.className = "talk-frame";
      btn.replaceWith(frame);
    });
  });
  // ---------- рыбки на цепочке: медленная (сверху) идёт на 1 ноду, быстрая (снизу) на 2 ----------
  var chain = document.querySelector(".hero .nodes");
  if (chain) {
    var nodes = chain.querySelectorAll(".node");
    var slow = document.createElement("span"), fast = document.createElement("span");
    slow.className = "fish fish-slow"; fast.className = "fish fish-fast";
    slow.setAttribute("aria-hidden", "true"); fast.setAttribute("aria-hidden", "true");
    chain.appendChild(slow); chain.appendChild(fast);
    paintFish(slow); paintFish(fast);
    var calm = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // шаги: [нода медленной, нода быстрой (-1 — уплыла за None), видна ли быстрая]
    var STEPS = [[0, 0, 1], [1, 2, 1], [2, -1, 0]];
    var cur = calm ? 1 : 0, loops = 0;

    function pos(i, below) {
      var c = chain.getBoundingClientRect();
      var r = i < 0 ? nodes[nodes.length - 1].getBoundingClientRect() : nodes[i].getBoundingClientRect();
      var x = i < 0 ? r.right - c.left + 40 : r.left - c.left + r.width / 2 - 15;
      var y = below ? r.bottom - c.top + 8 : r.top - c.top - 25;
      return "translate(" + Math.round(x) + "px," + Math.round(y) + "px)";
    }
    function show(k, instant) {
      var st = STEPS[k];
      [slow, fast].forEach(function (f) { f.classList.toggle("no-anim", !!instant); });
      slow.style.transform = pos(st[0], false);
      fast.style.transform = pos(st[1], true);
      fast.style.opacity = st[2];
      slow.style.opacity = 1;
      if (instant) { void chain.offsetWidth; [slow, fast].forEach(function (f) { f.classList.remove("no-anim"); }); }
    }
    function fits() {
      // если цепочка переносится на две строки (телефон), рыбки не показываем
      var t = nodes[0].getBoundingClientRect().top;
      return Array.prototype.every.call(nodes, function (n) { return Math.abs(n.getBoundingClientRect().top - t) < 2; });
    }
    function layout() {
      var ok = fits();
      slow.hidden = fast.hidden = !ok;
      if (ok) show(cur, true);
    }
    function tick() {
      if (cur < STEPS.length - 1) { cur++; show(cur); setTimeout(tick, 1700); return; }
      loops++;
      if (loops >= 3) { cur = 1; show(cur); return; }       // три круга и отдыхаем
      slow.style.opacity = 0;
      setTimeout(function () { cur = 0; show(cur, true); setTimeout(tick, 1400); }, 900);
    }
    layout();
    window.addEventListener("resize", layout);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout);
    if (!calm) setTimeout(tick, 1600);
  }
})();
