// Задачи по Python: редактор решения, запуск кода в браузере и сверка с ожидаемым выводом.
// Python (Pyodide) работает в отдельном потоке (problems/worker.js) и грузится только при первом запуске.
// Решения и отметки «решено» хранятся в localStorage этого браузера.
(function () {
  var page = document.querySelector(".problems-page");
  if (!page || !window.Worker) return;
  var TIMEOUT = 10000;   // мс: дольше считаем, что программа зависла

  function load(key) { try { return localStorage.getItem(key); } catch (e) { return null; } }
  function save(key, val) {
    try { if (val === null) localStorage.removeItem(key); else localStorage.setItem(key, val); } catch (e) {}
  }
  // вывод сравниваем без хвостовых пробелов в строках и пустых строк в конце
  // defaultdict печатается как defaultdict(<class 'list'>, {...}): засчитываем его как обычный словарь {...}
  function plainDicts(s) {
    var start, from = 0;
    while ((start = s.indexOf("defaultdict(<", from)) >= 0) {
      var i = start + "defaultdict(".length, depth = 0;
      for (; i < s.length; i++) {                     // фабрика: <class 'list'>, <function <lambda> at 0x…>
        if (s[i] === "<") depth++;
        else if (s[i] === ">" && --depth === 0) break;
      }
      if (s.slice(i + 1, i + 3) !== ", " || s[i + 3] !== "{") { from = start + 1; continue; }
      var open = i + 3, j = open;
      for (depth = 0; j < s.length; j++) {            // словарь до парной закрывающей скобки
        if (s[j] === "{") depth++;
        else if (s[j] === "}" && --depth === 0) break;
      }
      if (s[j + 1] !== ")") { from = start + 1; continue; }
      s = s.slice(0, start) + s.slice(open, j + 1) + s.slice(j + 2);
      from = start;
    }
    return s;
  }
  function norm(s) { return s.replace(/\r/g, "").split("\n").map(function (l) { return l.replace(/\s+$/, ""); }).join("\n").replace(/\n+$/, ""); }

  // ---------- общий поток с Python ----------
  var worker = null, ready = false, current = null, timer = null;

  function startWorker() {
    ready = false;
    worker = new Worker(page.dataset.worker, { type: "module" });
    worker.onmessage = function (e) {
      var m = e.data, t = current;
      if (m.type === "ready") {
        ready = true;
        if (t) { status(t, "Выполняется…", "busy"); armTimer(); }
        return;
      }
      if (!t) return;
      if (m.type === "out" || m.type === "err") append(t, m.type, m.text);
      else if (m.type === "done") finish(t);
      else if (m.type === "fail") stop(t, "Не получилось загрузить Python: " + m.text, "bad", true);
    };
    worker.onerror = function (e) {
      if (current) stop(current, "Не получилось загрузить Python. Проверьте интернет и попробуйте ещё раз.", "bad", true);
      if (e && e.preventDefault) e.preventDefault();
    };
  }
  function killWorker() {
    if (worker) worker.terminate();
    worker = null;
    ready = false;
  }
  function armTimer() {
    clearTimeout(timer);
    timer = setTimeout(function () {
      if (current) stop(current, "Остановлено: программа работает дольше " + TIMEOUT / 1000 + " секунд. Возможно, где-то бесконечный цикл?", "bad", true);
    }, TIMEOUT);
  }

  // ---------- одна задача ----------
  var loadTimer = null;
  function status(t, text, kind) {
    clearInterval(loadTimer);
    t.status.textContent = text;
    t.status.className = "runner-status" + (kind ? " is-" + kind : "");
    if (kind === "busy") t.status.appendChild(loader());
  }
  // пока идёт работа, туда-сюда плавает рыбка и пускает пузыри
  function loader() {
    var wrap = document.createElement("span"), swim = document.createElement("span"), fish = document.createElement("span");
    wrap.className = "runner-loader";
    wrap.setAttribute("aria-hidden", "true");
    swim.className = "loader-swim";
    fish.className = "fish fish-loader";
    fish.style.setProperty("--fish-color", "var(--fish-" + (1 + Math.floor(Math.random() * 6)) + ")");
    swim.appendChild(fish);
    for (var i = 0; i < 3; i++) {
      var b = document.createElement("span");
      b.className = "loader-bubble";
      b.style.animationDelay = (i * 0.45) + "s";
      swim.appendChild(b);
    }
    wrap.appendChild(swim);
    return wrap;
  }
  // первая загрузка Python небыстрая: подписи сменяют друг друга, чтобы было не скучно ждать
  var LOAD_TEXTS = [
    "Загружаю Python…",
    "Рыбка плывёт за интерпретатором…",
    "Python весит около 13 МБ, грузится только в первый раз",
    "Почти доплыла…"
  ];
  function loading(t) {
    var i = 0;
    status(t, LOAD_TEXTS[0], "busy");
    loadTimer = setInterval(function () {
      i = Math.min(i + 1, LOAD_TEXTS.length - 1);
      t.status.firstChild.nodeValue = LOAD_TEXTS[i];
      if (i === LOAD_TEXTS.length - 1) clearInterval(loadTimer);
    }, 2500);
  }
  function append(t, type, text) {
    t.output += type === "out" ? text : "";
    t.hadError = t.hadError || type === "err";
    var last = t.out.lastChild;
    if (last && last.dataset.type === type) last.textContent += text;
    else {
      var span = document.createElement("span");
      span.dataset.type = type;
      if (type === "err") span.className = "runner-err";
      span.textContent = text;
      t.out.appendChild(span);
    }
  }
  function setRunning(t, on) {
    t.run.textContent = on ? "Стоп" : "Запустить";
    t.run.classList.toggle("is-stop", on);
    t.box.classList.toggle("is-running", on);
  }
  function run(t) {
    if (current) stop(current, "Остановлено.", "", true);
    current = t;
    t.output = "";
    t.hadError = false;
    t.out.textContent = "";
    t.result.hidden = false;
    setRunning(t, true);
    if (!worker) startWorker();
    if (ready) { status(t, "Выполняется…", "busy"); armTimer(); }
    else loading(t);
    worker.postMessage({ code: t.code.value, stdin: "" });
  }
  // остановка: поток с Python приходится убить, следующий запуск поднимет его заново
  function stop(t, text, kind, kill) {
    clearTimeout(timer);
    if (kill) killWorker();
    current = null;
    setRunning(t, false);
    status(t, text, kind);
  }
  function finish(t) {
    clearTimeout(timer);
    current = null;
    setRunning(t, false);
    var got = norm(plainDicts(t.output)), want = norm(t.expected);
    if (t.hadError) return status(t, "Программа завершилась с ошибкой.", "bad");
    if (!got) return status(t, "Программа ничего не вывела. Результат нужно напечатать через print().", "");
    if (got === want) {
      status(t, "Совпадает с ожидаемым выводом!", "ok");
      markSolved(t, true);
      if (window.siteFishSchool) {
        var r = t.run.getBoundingClientRect();
        window.siteFishSchool(r.left + r.width / 2, r.top + r.height / 2);
      }
      return;
    }
    var g = got.split("\n"), w = want.split("\n"), i = 0;
    while (i < g.length && i < w.length && g[i] === w[i]) i++;
    status(t, g.length !== w.length && i === Math.min(g.length, w.length)
      ? "Почти: строк в выводе " + g.length + ", а ожидается " + w.length + "."
      : "Отличается от ожидаемого вывода в строке " + (i + 1) + ".", "diff");
  }
  function markSolved(t, on) {
    save("problems:solved:" + t.id, on ? "1" : null);
    var link = document.querySelector('.task-toc a[href="#' + t.el.id + '"]');
    if (link) link.parentNode.classList.toggle("is-solved", on);
    t.el.classList.toggle("is-solved", on);
  }

  // ---------- редактор: отступы как в редакторе кода ----------
  var IND = "    ";
  function insert(ta, text) {
    // execCommand сохраняет историю Ctrl+Z; если не сработал — вставляем вручную
    if (!document.execCommand || !document.execCommand("insertText", false, text)) {
      ta.setRangeText(text, ta.selectionStart, ta.selectionEnd, "end");
      ta.dispatchEvent(new Event("input"));
    }
  }
  function lineStart(v, pos) { return v.lastIndexOf("\n", pos - 1) + 1; }
  function shiftLines(ta, back) {
    var v = ta.value, s = lineStart(v, ta.selectionStart), e = ta.selectionEnd;
    if (e > s && v[e - 1] === "\n") e--;                       // выделение до начала следующей строки её не захватывает
    var end = v.indexOf("\n", e); if (end < 0) end = v.length;
    var lines = v.slice(s, end).split("\n");
    var out = lines.map(function (l) { return back ? l.replace(/^ {1,4}|^\t/, "") : IND + l; }).join("\n");
    ta.setSelectionRange(s, end);
    insert(ta, out);
    ta.setSelectionRange(s, s + out.length);
  }
  var tabTrap = true;   // после Esc клавиша Tab снова переводит фокус дальше по странице
  function onKey(t, e) {
    var ta = t.code;
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); run(t); return; }
    if (e.key === "Escape") { tabTrap = false; return; }
    if (e.key === "Tab" && tabTrap && !e.ctrlKey && !e.altKey && !e.metaKey) {
      e.preventDefault();
      if (e.shiftKey || ta.selectionStart !== ta.selectionEnd && ta.value.slice(ta.selectionStart, ta.selectionEnd).indexOf("\n") >= 0) shiftLines(ta, e.shiftKey);
      else insert(ta, IND.slice((ta.selectionStart - lineStart(ta.value, ta.selectionStart)) % 4));
      return;
    }
    if (e.key === "Enter" && !e.shiftKey && !e.altKey && !e.isComposing) {
      // новая строка с тем же отступом; после двоеточия — на уровень глубже
      var v = ta.value, s = lineStart(v, ta.selectionStart), line = v.slice(s, ta.selectionStart);
      var indent = line.match(/^[ \t]*/)[0];
      if (/:\s*(#.*)?$/.test(line)) indent += IND;
      e.preventDefault();
      insert(ta, "\n" + indent);
      return;
    }
    if (e.key === "Backspace" && ta.selectionStart === ta.selectionEnd) {
      // Backspace в отступе стирает сразу 4 пробела
      var p = ta.selectionStart, before = ta.value.slice(lineStart(ta.value, p), p);
      if (before.length && /^ +$/.test(before)) {
        e.preventDefault();
        var n = before.length % 4 || 4;
        ta.setSelectionRange(p - n, p);
        insert(ta, "");
      }
    }
    tabTrap = true;
  }
  function fit(ta) {
    ta.style.height = "auto";
    ta.style.height = (ta.scrollHeight + 2) + "px";
  }

  // ---------- сборка ----------
  document.querySelectorAll(".task").forEach(function (el) {
    var box = el.querySelector(".runner");
    if (!box) return;
    var t = {
      el: el, box: box, id: el.dataset.task,
      code: box.querySelector(".runner-code"),
      run: box.querySelector(".runner-run"),
      result: box.querySelector(".runner-result"),
      status: box.querySelector(".runner-status"),
      out: box.querySelector(".runner-out code"),
      expected: el.querySelector(".task-expected").textContent
    };
    var key = "problems:code:" + t.id, savedCode = load(key);
    if (savedCode !== null) t.code.value = savedCode;
    if (load("problems:solved:" + t.id)) markSolved(t, true);
    box.hidden = false;
    fit(t.code);
    var saveTimer = null;
    t.code.addEventListener("input", function () {
      fit(t.code);
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        save(key, t.code.value === t.code.defaultValue ? null : t.code.value);
      }, 300);
    });
    t.code.addEventListener("keydown", function (e) { onKey(t, e); });
    t.code.addEventListener("blur", function () { tabTrap = true; });
    t.run.addEventListener("click", function () {
      if (current === t) stop(t, "Остановлено.", "", true);
      else run(t);
    });
    box.querySelector(".runner-reset").addEventListener("click", function () {
      if (current === t) stop(t, "Остановлено.", "", true);
      // через выделение и вставку, чтобы сброс можно было отменить Ctrl+Z
      t.code.focus();
      t.code.select();
      insert(t.code, t.code.defaultValue);
      t.result.hidden = true;
    });
  });
  var note = document.querySelector(".runner-note");
  if (note) note.hidden = false;
  if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
    document.querySelectorAll(".runner-keys").forEach(function (k) { k.textContent = "⌘+Enter"; });
  }
  window.addEventListener("resize", function () {
    document.querySelectorAll(".runner-code").forEach(fit);
  });
})();
