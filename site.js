// Вкладки с кодом в статьях, запуск видео на странице «Выступления», рыбки (на главной, в меню, над вкладками, прогресс чтения) и их цвета, переключатель темы.
(function () {
  // ---------- тема: светлая или тёмная; выбор хранится в localStorage («theme»), без выбора — как в системе ----------
  var root = document.documentElement;
  var systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  var themeButtons = document.querySelectorAll("[data-theme-set]");
  function currentTheme() { return root.dataset.theme || (systemDark && systemDark.matches ? "dark" : "light"); }
  function syncTheme() {
    var t = currentTheme();
    themeButtons.forEach(function (b) { b.setAttribute("aria-pressed", b.dataset.themeSet === t ? "true" : "false"); });
  }
  themeButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      root.dataset.theme = b.dataset.themeSet;
      try { localStorage.setItem("theme", b.dataset.themeSet); } catch (e) {}
      syncTheme();
    });
  });
  document.querySelectorAll(".theme-switch").forEach(function (g) { g.hidden = false; });
  if (systemDark) {
    if (systemDark.addEventListener) systemDark.addEventListener("change", syncTheme);
    else if (systemDark.addListener) systemDark.addListener(syncTheme);
  }
  syncTheme();

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

  // переместить рыбку в точку (x, y) внутри её контейнера; рыбка разворачивается мордой туда, куда плывёт
  function moveFish(f, x, y, instant) {
    if (f._x !== undefined && Math.abs(x - f._x) > 1) f._left = x < f._x;
    f._x = x;
    f.classList.toggle("no-anim", !!instant);
    f.style.transform = "translate(" + Math.round(x) + "px," + Math.round(y) + "px)" + (f._left ? " scaleX(-1)" : "");
    if (instant) { void f.offsetWidth; f.classList.remove("no-anim"); }
  }

  // ---------- вкладки: выбранный язык одинаковый во всех блоках страницы ----------
  // window.siteInitTabs() можно вызвать ещё раз, когда вкладки появились позже (расшифрованный курс)
  var KEY = "code-lang";

  function choose(lang, remember) {
    document.querySelectorAll(".tabs").forEach(function (g) {
      var panels = g.querySelectorAll(".tab-panel");
      var has = Array.prototype.some.call(panels, function (p) { return p.dataset.lang === lang; });
      var pick = has ? lang : panels[0].dataset.lang;
      panels.forEach(function (p) { p.hidden = p.dataset.lang !== pick; });
      g.querySelectorAll('[role="tab"]').forEach(function (b) {
        var on = b.dataset.lang === pick;
        b.setAttribute("aria-selected", on ? "true" : "false");
        b.tabIndex = on ? 0 : -1;
      });
      placeTabFish(g, false);
    });
    if (remember) { try { localStorage.setItem(KEY, lang); } catch (e) {} }
  }

  // рыбка-указатель над выбранной вкладкой
  function placeTabFish(g, instant) {
    var f = g.querySelector(".fish-tab"), b = g.querySelector('[aria-selected="true"]');
    if (!f || !b) return;
    var list = f.parentNode.getBoundingClientRect(), r = b.getBoundingClientRect();
    if (!list.width) return;                       // вкладки скрыты (например, в закрытом спойлере)
    moveFish(f, r.left - list.left + r.width / 2 - 8, r.top - list.top - 12, instant || f._x === undefined);
  }

  function initTabs() {
    var fresh = document.querySelectorAll(".tabs:not(.tabs-ready)");
    if (!fresh.length) return;
    fresh.forEach(function (g) {
      g.classList.add("tabs-ready");
      var list = g.querySelector(".tab-list");
      list.hidden = false;
      var f = document.createElement("span");
      f.className = "fish fish-tab";
      f.setAttribute("aria-hidden", "true");
      list.appendChild(f);
      paintFish(f);
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
    choose(saved || document.querySelector(".tabs .tab-panel").dataset.lang, false);
  }
  initTabs();
  window.siteInitTabs = initTabs;
  // вкладки внутри спойлера получают размеры, только когда спойлер открыт
  document.addEventListener("toggle", function (e) {
    if (e.target.querySelectorAll) e.target.querySelectorAll(".tabs-ready").forEach(function (g) { placeTabFish(g, true); });
  }, true);

  // ---------- рыбка-указатель в меню-цепочке и рыбка — прогресс чтения ----------
  var chainEl = document.querySelector(".site-head .chain");
  var navFish = null;
  if (chainEl) {
    navFish = document.createElement("span");
    navFish.className = "fish fish-nav";
    navFish.setAttribute("aria-hidden", "true");
    chainEl.appendChild(navFish);
    paintFish(navFish);
  }
  function chainItem(selector) {
    var el = chainEl.querySelector(selector);
    return el ? el.closest("li") : null;
  }
  function navTarget() {
    var noneItem = chainItem(".none");
    if (chainEl.querySelector('a[href="#about"]')) {
      // главная: раздел, до которого дочитали; в самом низу — None
      var doc = document.documentElement;
      if (window.scrollY > 0 && window.innerHeight + window.scrollY >= doc.scrollHeight - 4) return noneItem;
      var line = window.innerHeight * 0.35, id = "top";
      document.querySelectorAll("main > section[id]").forEach(function (sec) {
        if (sec.getBoundingClientRect().top <= line) id = sec.id;
      });
      return chainItem('a[href="#' + id + '"]') || chainItem('a[href="talks/"]');
    }
    if (document.querySelector(".lost")) return noneItem;             // 404: рыба уплыла за None
    var cur = chainItem('[aria-current="page"]');
    if (cur) return cur;
    if (location.pathname.indexOf("/course/") >= 0) return chainItem('a[href$="#course"]');
    return null;
  }
  function placeNavFish(instant) {
    var li = navTarget();
    navFish.hidden = !li;
    if (!li) return;
    var c = chainEl.getBoundingClientRect(), r = li.querySelector("a, span").getBoundingClientRect();
    moveFish(navFish, r.left - c.left + r.width / 2 - 9, r.top - c.top - 11, instant);
  }

  // прогресс чтения: линия по нижнему краю шапки, рыбка плывёт по ней от начала статьи к концу
  var siteHead = document.querySelector(".site-head"), progress = null, progressFish = null, progressLine = null;
  function placeProgress() {
    var body = document.querySelector(".article-body");
    if (!body || !siteHead) { if (progress) progress.hidden = true; return; }
    if (!progress) {
      progress = document.createElement("div");
      progress.className = "read-progress";
      progress.setAttribute("aria-hidden", "true");
      progressLine = document.createElement("span");
      progressLine.className = "read-progress-line";
      progressFish = document.createElement("span");
      progressFish.className = "fish fish-read";
      progress.appendChild(progressLine);
      progress.appendChild(progressFish);
      siteHead.appendChild(progress);
      paintFish(progress);                         // линия и рыбка одного цвета
    }
    progress.hidden = false;
    var r = body.getBoundingClientRect(), vh = window.innerHeight;
    var p = r.height > vh ? -r.top / (r.height - vh) : (r.top < vh ? 1 : 0);
    p = Math.max(0, Math.min(1, p));
    progressLine.style.width = (p * 100) + "%";
    progressFish.style.transform = "translateX(" + Math.round(p * (progress.clientWidth - 20)) + "px)";
  }

  var ticking = false;
  function onScroll() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      ticking = false;
      if (navFish) placeNavFish(false);
      placeProgress();
    });
  }
  function refresh() {
    if (navFish) placeNavFish(true);
    placeProgress();
    document.querySelectorAll(".tabs-ready").forEach(function (g) { placeTabFish(g, true); });
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", refresh);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
  refresh();
  window.siteRefresh = refresh;                    // course.js зовёт после расшифровки страницы

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
