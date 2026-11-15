// Вкладки с кодом в статьях и запуск видео на странице «Выступления».
(function () {
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
})();
