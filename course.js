// Закрытые материалы курса: расшифровка страницы ключом из ссылки (/course/#КЛЮЧ).
// Шифротекст лежит в <script id="course-data">, собирает его tools/build_course.py.
// Ключ из ссылки запоминается в localStorage («course-key») и убирается из адресной строки,
// чтобы дальше по материалам можно было ходить обычными ссылками.
(function () {
  var STORE = "course-key";
  var root = document.getElementById("course-root");
  var dataEl = document.getElementById("course-data");
  var locked = document.querySelector(".course-locked");
  if (!root || !dataEl) return;

  function showLocked(stale) {
    locked.hidden = false;
    if (stale) locked.querySelector(".course-stale").hidden = false;
  }
  function b64ToBytes(s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    while (s.length % 4) s += "=";
    var bin = atob(s), out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  var fromHash = (location.hash.match(/^#([A-Za-z0-9_-]{43})$/) || [])[1];
  var saved = null;
  try { saved = localStorage.getItem(STORE); } catch (e) {}
  var keyText = fromHash || saved;
  var remembered = false;
  if (fromHash) {
    try { localStorage.setItem(STORE, fromHash); remembered = true; } catch (e) {}
    // убираем ключ из адресной строки, только если он сохранился (иначе ссылки дальше не откроются)
    if (remembered && history.replaceState) history.replaceState(null, "", location.pathname + location.search);
  }
  if (!keyText || !window.crypto || !crypto.subtle) { showLocked(false); return; }

  // ---------- урок карточками: одна подтема на экран ----------
  // Видна одна карточка; открытые карточки запоминаются (localStorage «course-cards:<путь>»),
  // их доля — прогресс урока, по нему плывёт рыбка в шапке (site.js, data-cards-progress).
  function initCards() {
    var deck = root.querySelector(".lesson-cards");
    if (!deck) return;
    var cards = [].slice.call(deck.querySelectorAll(".lesson-card"));
    var total = cards.length, cur = -1;
    var nav = root.querySelector(".card-nav"), pager = root.querySelector(".pager");
    var prevBtn = nav.querySelector(".card-prev"), nextBtn = nav.querySelector(".card-next");
    var count = nav.querySelector(".card-count");
    var links = [].slice.call(root.querySelectorAll("[data-card-link]"));
    var store = "course-cards:" + root.dataset.path, seen = {}, saved = null;
    try { saved = JSON.parse(localStorage.getItem(store) || "null"); } catch (e) {}
    if (saved && saved.seen) saved.seen.forEach(function (n) { if (n >= 1 && n <= total) seen[n] = true; });

    function cardOf(id) {
      var el = id && document.getElementById(id);
      var card = el && el.closest(".lesson-card");
      return card ? cards.indexOf(card) : -1;
    }
    function show(i, scroll) {
      i = Math.max(0, Math.min(total - 1, i));
      var changed = i !== cur;
      cur = i;
      cards.forEach(function (c, k) { c.hidden = k !== i; });
      seen[i + 1] = true;
      var n = Object.keys(seen).length;
      deck.dataset.cardsProgress = (n / total).toFixed(4);
      try { localStorage.setItem(store, JSON.stringify({ seen: Object.keys(seen).map(Number), last: i + 1 })); } catch (e) {}
      prevBtn.disabled = i === 0;
      nextBtn.hidden = i === total - 1;
      count.textContent = (i + 1) + " / " + total;
      if (pager) pager.hidden = i !== total - 1;   // переход к следующему материалу — на последней карточке
      links.forEach(function (a) {
        var k = +a.dataset.cardLink;
        if (k === i + 1) a.setAttribute("aria-current", "step"); else a.removeAttribute("aria-current");
        a.classList.toggle("seen", !!seen[k]);
      });
      // длинное оглавление сбоку прокручиваем к текущей карточке (страница при этом не двигается)
      var box = root.querySelector(".card-toc-box"), on = links[i];
      if (box && on && box.scrollHeight > box.clientHeight) {
        var b = box.getBoundingClientRect(), r = on.getBoundingClientRect();
        if (r.top < b.top + 40 || r.bottom > b.bottom - 20) box.scrollTop += r.top - b.top - b.height / 3;
      }
      if (history.replaceState && !/^#[A-Za-z0-9_-]{43}$/.test(location.hash))
        history.replaceState(null, "", location.pathname + location.search + "#card-" + (i + 1));
      if (scroll && changed) {
        var top = root.querySelector(".article-head").getBoundingClientRect().bottom;
        if (top < 0 || top > window.innerHeight) window.scrollTo(0, window.scrollY + cards[i].getBoundingClientRect().top - 110);
      }
      if (window.siteRefresh) window.siteRefresh();
    }

    prevBtn.addEventListener("click", function () { show(cur - 1, true); });
    nextBtn.addEventListener("click", function () { show(cur + 1, true); });
    // ссылки на карточку или на заголовок внутри неё (оглавление, ссылки в тексте)
    root.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest('a[href^="#"]');
      if (!a) return;
      var k = cardOf(a.getAttribute("href").slice(1));
      if (k < 0) return;
      e.preventDefault();
      show(k, false);
      if (tocBox && a.closest(".card-toc-box") && window.matchMedia("(max-width: 960px)").matches) tocBox.open = false;
      var target = document.getElementById(a.getAttribute("href").slice(1));
      (target.classList.contains("lesson-card") ? cards[k] : target).scrollIntoView();
    });
    document.addEventListener("keydown", function (e) {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.target.closest && e.target.closest('input, textarea, select, [contenteditable], [role="tab"], pre')) return;
      show(cur + (e.key === "ArrowRight" ? 1 : -1), true);
    });

    // на узком экране оглавление стоит над карточкой — сворачиваем его, чтобы не листать каждый раз
    var tocBox = root.querySelector(".card-toc-box details");
    if (tocBox && window.matchMedia("(max-width: 960px)").matches) tocBox.open = false;

    var fromUrl = cardOf(location.hash.slice(1));
    show(fromUrl >= 0 ? fromUrl : (saved && saved.last ? saved.last - 1 : 0), false);
    if (fromUrl >= 0 && location.hash.indexOf("#card-") !== 0) {
      var t = document.getElementById(location.hash.slice(1));
      if (t) t.scrollIntoView();
    }
  }

  var blob = b64ToBytes(dataEl.textContent.trim());
  crypto.subtle.importKey("raw", b64ToBytes(keyText), "AES-GCM", false, ["decrypt"])
    .then(function (key) {
      return crypto.subtle.decrypt(
        { name: "AES-GCM", iv: blob.slice(0, 12), additionalData: new TextEncoder().encode(root.dataset.path) },
        key, blob.slice(12));
    })
    .then(function (plain) {
      var page = JSON.parse(new TextDecoder().decode(plain));
      document.title = page.title;
      root.innerHTML = page.html;
      // localStorage недоступен (например, строгий приватный режим): передаём ключ дальше в ссылках
      if (fromHash && !remembered) {
        root.querySelectorAll('a[href]').forEach(function (a) {
          var h = a.getAttribute("href");
          if (/^(\.\.\/|\d+\/)/.test(h) && h.indexOf("#") < 0) a.setAttribute("href", h + "#" + keyText);
        });
      }
      initCards();
      if (window.siteInitTabs) window.siteInitTabs();
      if (window.sitePhrases) window.sitePhrases(root);
      if (window.siteRefresh) window.siteRefresh();
    })
    .catch(function () {
      // ключ не подошёл: если он был сохранён раньше, значит его сменили
      if (!fromHash && saved) { try { localStorage.removeItem(STORE); } catch (e) {} }
      showLocked(true);
    });
})();
