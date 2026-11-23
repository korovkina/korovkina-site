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
