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
  // defaultdict и Counter засчитываем как обычный словарь:
  //   defaultdict(<class 'list'>, {...}) → {...},  Counter({...}) → {...},  Counter() → {}
  // Counter печатает ключи по убыванию частоты, поэтому строку с ним сравниваем без учёта порядка ключей.
  var WRAPS = ["defaultdict(<", "Counter("];
  function closing(s, i, open, close) {              // индекс парной скобки к s[i]
    for (var depth = 0; i < s.length; i++) {
      if (s[i] === open) depth++;
      else if (s[i] === close && --depth === 0) return i;
    }
    return -1;
  }
  function plainDicts(s) {
    var from = 0;
    for (;;) {
      var start = -1, kind = null;
      WRAPS.forEach(function (w) {
        var k = s.indexOf(w, from);
        if (k >= 0 && (start < 0 || k < start)) { start = k; kind = w; }
      });
      if (start < 0) return s;
      var open;
      if (kind === "Counter(") {
        open = start + kind.length;
        if (s[open] === ")") { s = s.slice(0, start) + "{}" + s.slice(open + 1); continue; }
      } else {
        var gt = closing(s, start + "defaultdict(".length, "<", ">");   // фабрика: <class 'list'>, <function <lambda> at 0x…>
        open = gt + 3;
        if (gt < 0 || s.slice(gt + 1, open) !== ", ") { from = start + 1; continue; }
      }
      var end = s[open] === "{" ? closing(s, open, "{", "}") : -1;
      if (end < 0 || s[end + 1] !== ")") { from = start + 1; continue; }
      s = s.slice(0, start) + s.slice(open, end + 1) + s.slice(end + 2);
      from = start;
    }
  }
  // элементы словаря верхнего уровня: '{'a': 1, 'b': [1, 2]}' → ["'a': 1", "'b': [1, 2]"]
  function dictItems(s) {
    if (s[0] !== "{" || s[s.length - 1] !== "}") return null;
    var items = [], cur = "", depth = 0, quote = null;
    for (var i = 1; i < s.length - 1; i++) {
      var ch = s[i];
      if (quote) {
        if (ch === "\\") { cur += ch + s[++i]; continue; }
        if (ch === quote) quote = null;
      } else if (ch === "'" || ch === '"') quote = ch;
      else if ("([{".indexOf(ch) >= 0) depth++;
      else if (")]}".indexOf(ch) >= 0) depth--;
      else if (ch === "," && depth === 0) { items.push(cur.trim()); cur = ""; continue; }
      cur += ch;
    }
    if (cur.trim()) items.push(cur.trim());
    return items.sort();
  }
  function sameLine(g, w) {
    if (g === w) return true;
    if (g.indexOf("Counter(") < 0) return false;
    var u = plainDicts(g), a = dictItems(u), b = dictItems(w);
    return u === w || !!(a && b && a.join("\n") === b.join("\n"));
  }
  function defaultDicts(s) {                          // только defaultdict: Counter оставляем, чтобы знать, где порядок не важен
    return s.split("\n").map(function (l) { return l.indexOf("Counter(") >= 0 ? l : plainDicts(l); }).join("\n");
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
    var got = norm(defaultDicts(t.output)), want = norm(t.expected);
    var g = got.split("\n"), w = want.split("\n"), i = 0;
    while (i < g.length && i < w.length && sameLine(g[i], w[i])) i++;
    if (t.hadError) return status(t, "Программа завершилась с ошибкой.", "bad");
    if (!got) return status(t, "Программа ничего не вывела. Результат нужно напечатать через print().", "");
    if (i === g.length && i === w.length) {
      var wasDone = solvedCount() === tasks.length;
      status(t, "Совпадает с ожидаемым выводом!", "ok");
      markSolved(t, true);
      addFish(t, true);
      updateAquarium();
      var r = t.run.getBoundingClientRect();
      if (window.siteFishSchool) window.siteFishSchool(r.left + r.width / 2, r.top + r.height / 2);
      if (!wasDone && solvedCount() === tasks.length) complete(t);
      return;
    }
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

  // ---------- аквариум: за каждую решённую задачу в него заплывает рыбка ----------
  var tasks = [], aq = document.querySelector(".aquarium");
  var tank = aq && aq.querySelector(".aq-tank"), aqCount = aq && aq.querySelector(".aq-count");
  function plural(n, one, few, many) {
    var d = n % 10, h = n % 100;
    return d === 1 && h !== 11 ? one : d >= 2 && d <= 4 && (h < 12 || h > 14) ? few : many;
  }
  function solvedCount() { return tasks.filter(function (t) { return t.el.classList.contains("is-solved"); }).length; }
  // место, цвет и скорость у каждой рыбки свои, но одни и те же при каждом открытии страницы
  function fishSpot(n) {
    function rnd(k) { var v = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return v - Math.floor(v); }
    var dur = 7 + rnd(1) * 6;
    return { color: 1 + n % 6, top: Math.round(((n * 0.618034) % 1) * 66), a: Math.round(2 + rnd(2) * 25),
             b: Math.round(65 + rnd(3) * 33), dur: dur.toFixed(1), delay: (-rnd(4) * dur).toFixed(1) };
  }
  function addFish(t, fresh) {
    if (!tank || tank.querySelector('[data-n="' + t.num + '"]')) return;
    var p = fishSpot(t.num), f = document.createElement("span");
    f.className = "fish aq-fish" + (fresh ? " aq-new" : "");
    f.dataset.n = t.num;
    f.style.setProperty("--fish-color", "var(--fish-" + p.color + ")");
    f.style.top = (16 + p.top) + "px";
    f.style.setProperty("--a", p.a + "%");
    f.style.setProperty("--b", "calc(" + p.b + "% - 22px)");
    f.style.setProperty("--dur", p.dur + "s");
    f.style.setProperty("--delay", p.delay + "s");
    tank.appendChild(f);
  }
  function updateAquarium() {
    if (!aq) return;
    var n = solvedCount(), total = tasks.length;
    aq.classList.toggle("is-full", n === total);
    if (n === total) {
      aqCount.textContent = "Все " + total + " " + plural(total, "рыбка", "рыбки", "рыбок") + " на месте! ";
      var a = document.createElement("a");
      a.href = "#finale";
      a.textContent = "Открытка ↓";
      aqCount.appendChild(a);
      showFinale();
    } else {
      aqCount.textContent = n ? "В аквариуме " + n + " из " + total + ". Решите ещё задачу — заплывёт новая рыбка."
        : "Пока пусто: за каждую решённую задачу сюда заплывёт рыбка.";
    }
  }
  // последняя задача решена: две волны рыб и ссылка на открытку
  function complete(t) {
    status(t, "Совпадает! Это была последняя задача. ", "ok");
    var a = document.createElement("a");
    a.href = "#finale";
    a.textContent = "Забрать открытку ↓";
    t.status.appendChild(a);
    setTimeout(function () {
      if (window.siteFishSchool) window.siteFishSchool(window.innerWidth - 40, window.innerHeight - 40);
    }, 1500);
  }

  // ---------- открытка «сборник решён» ----------
  var finale = document.querySelector(".finale");
  var CARD = { paper: "#F3F1EC", ink: "#18262D", muted: "#55646B", ptr: "#467083", accent: "#3B6577", line: "#D9D6CE", water: "#E2EBEE",
               fish: ["#C94C7C", "#C9623A", "#A87E00", "#3E8C4C", "#22877A", "#7A5CC4"] };
  var FISH_BODY = "M7 9C10.5 3.5 19 3 26.5 9C19 15 10.5 14.5 7 9ZM7 9L2 4.5V13.5Z", FISH_GILL = "M14.5 5.8Q13 9 14.5 12.2";
  function slug() { return tasks.length ? tasks[0].id.split("/")[0] : "problems"; }
  function doneDate() {
    var key = "problems:done:" + slug(), d = load(key);
    if (!d) { d = new Date().toISOString(); save(key, d); }
    return new Date(d).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
  }
  function drawFish(x, cx, cy, size, color, flip) {
    x.save();
    x.translate(cx, cy);
    x.scale(flip ? -size / 32 : size / 32, size / 32);
    x.translate(-16, -9);
    x.strokeStyle = color; x.fillStyle = color;
    x.lineWidth = 1.6; x.lineJoin = "round"; x.lineCap = "round";
    x.stroke(new Path2D(FISH_BODY));
    x.stroke(new Path2D(FISH_GILL));
    x.beginPath(); x.arc(21.5, 8, 1.3, 0, Math.PI * 2); x.fill();
    x.restore();
  }
  function wrapText(x, text, maxW) {
    var lines = [], cur = "";
    text.split(" ").forEach(function (w) {
      var tryLine = cur ? cur + " " + w : w;
      if (cur && x.measureText(tryLine).width > maxW) { lines.push(cur); cur = w; } else cur = tryLine;
    });
    if (cur) lines.push(cur);
    return lines;
  }
  function drawCard() {
    var c = finale.querySelector(".finale-card"), x = c.getContext("2d"), W = c.width, H = c.height;
    var title = document.querySelector(".article-title").textContent, total = tasks.length;
    var name = (finale.querySelector("#finale-name").value || "").trim();
    x.fillStyle = CARD.paper; x.fillRect(0, 0, W, H);
    x.strokeStyle = CARD.line; x.lineWidth = 2;
    x.beginPath(); x.roundRect(24, 24, W - 48, H - 48, 28); x.stroke();

    x.textBaseline = "alphabetic";
    x.fillStyle = CARD.ptr; x.font = "500 22px 'IBM Plex Mono', monospace";
    x.fillText("ЗАДАЧИ ПО PYTHON · " + total + " ИЗ " + total, 80, 112);
    x.fillStyle = CARD.ink; x.font = "600 64px 'Source Serif 4', Georgia, serif";
    var y = 186;
    wrapText(x, "«" + title + "»", 600).forEach(function (l) { x.fillText(l, 80, y); y += 72; });
    x.fillStyle = CARD.muted; x.font = "400 30px 'IBM Plex Sans', sans-serif";
    x.fillText("Сборник решён полностью", 80, y + 6);
    if (name) {
      x.fillStyle = CARD.accent; x.font = "600 42px 'IBM Plex Sans', sans-serif";
      wrapText(x, name, 600).slice(0, 2).forEach(function (l, i) { x.fillText(l, 80, y + 82 + i * 50); });
    }
    x.fillStyle = CARD.muted; x.font = "400 22px 'IBM Plex Mono', monospace";
    x.fillText(doneDate(), 80, 512);
    x.fillStyle = CARD.ptr;
    x.fillText("korovkina.uk/problems/" + slug() + "/", 80, 560);
    x.textAlign = "right"; x.fillStyle = CARD.muted;
    x.fillText("next → None", W - 80, 560);
    x.textAlign = "left";

    // аквариум со всеми рыбками
    var ax = 740, ay = 130, aw = 380, ah = 330;
    x.fillStyle = CARD.water;
    x.beginPath(); x.roundRect(ax, ay + 24, aw, ah - 24, [0, 0, 26, 26]); x.fill();
    x.fillStyle = CARD.line;
    x.beginPath(); x.roundRect(ax, ay + ah - 30, aw, 30, [0, 0, 26, 26]); x.fill();
    x.strokeStyle = CARD.ptr; x.lineWidth = 3;
    x.beginPath(); x.moveTo(ax, ay); x.lineTo(ax, ay + ah - 26); x.arcTo(ax, ay + ah, ax + 26, ay + ah, 26);
    x.lineTo(ax + aw - 26, ay + ah); x.arcTo(ax + aw, ay + ah, ax + aw, ay + ah - 26, 26); x.lineTo(ax + aw, ay); x.stroke();
    tasks.forEach(function (t, i) {
      var p = fishSpot(t.num), cols = 3, row = Math.floor(i / cols), col = i % cols;
      var rows = Math.ceil(tasks.length / cols), cellH = (ah - 90) / rows;
      var fx = ax + 70 + col * 120 + ((p.top * 3) % 40) - 20, fy = ay + 58 + row * cellH + cellH / 2;
      drawFish(x, fx, fy, 56, CARD.fish[p.color - 1], t.num % 2 === 0);
    });
    x.strokeStyle = CARD.ptr; x.lineWidth = 2;
    [[ax + aw - 46, ay + 70, 7], [ax + aw - 36, ay + 44, 5], [ax + aw - 48, ay + 24, 4]].forEach(function (b) {
      x.beginPath(); x.arc(b[0], b[1], b[2], 0, Math.PI * 2); x.stroke();
    });
    x.save();
    x.translate(ax + 40, ay + ah + 58); x.rotate(-0.04);
    x.fillStyle = CARD.accent; x.font = "40px Caveat, cursive";
    x.fillText("все рыбки на месте!", 0, 0);
    x.restore();
  }
  function redrawCard() {
    // шрифты сайта подгружаем до рисования, иначе на холсте окажутся системные
    var fonts = ["500 22px 'IBM Plex Mono'", "600 64px 'Source Serif 4'", "400 30px 'IBM Plex Sans'", "600 42px 'IBM Plex Sans'", "40px Caveat"];
    var wait = document.fonts && document.fonts.load
      ? Promise.all(fonts.map(function (f) { return document.fonts.load(f, "Задачи Python"); }))
      : Promise.resolve();
    wait.then(drawCard, drawCard);
  }
  function cardBlob(cb) { finale.querySelector(".finale-card").toBlob(cb, "image/png"); }
  function showFinale() {
    if (!finale || !finale.hidden) return;
    finale.hidden = false;
    var input = finale.querySelector("#finale-name"), saved = load("problems:name");
    if (saved) input.value = saved;
    input.addEventListener("input", function () { save("problems:name", input.value.trim() || null); redrawCard(); });
    redrawCard();
    var file = "korovkina-" + slug() + ".png";
    finale.querySelector(".finale-save").addEventListener("click", function () {
      cardBlob(function (b) {
        var a = document.createElement("a");
        a.href = URL.createObjectURL(b);
        a.download = file;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      });
    });
    // на телефоне открытку можно сразу отправить в Telegram через системное меню «Поделиться»
    var share = finale.querySelector(".finale-share");
    try {
      if (navigator.canShare && navigator.canShare({ files: [new File([""], file, { type: "image/png" })] })) share.hidden = false;
    } catch (e) {}
    share.addEventListener("click", function () {
      cardBlob(function (b) {
        navigator.share({
          files: [new File([b], file, { type: "image/png" })],
          text: "Сборник «" + document.querySelector(".article-title").textContent + "» решён! " + location.origin + location.pathname
        }).catch(function () {});
      });
    });
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
      el: el, box: box, id: el.dataset.task, num: +el.dataset.task.split("/")[1],
      code: box.querySelector(".runner-code"),
      run: box.querySelector(".runner-run"),
      result: box.querySelector(".runner-result"),
      status: box.querySelector(".runner-status"),
      out: box.querySelector(".runner-out code"),
      expected: el.querySelector(".task-expected").textContent
    };
    var key = "problems:code:" + t.id, savedCode = load(key);
    if (savedCode !== null) t.code.value = savedCode;
    tasks.push(t);
    if (load("problems:solved:" + t.id)) { markSolved(t, true); addFish(t, false); }
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
  if (aq) { aq.hidden = false; updateAquarium(); }
  var note = document.querySelector(".runner-note");
  if (note) note.hidden = false;
  if (/Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent)) {
    document.querySelectorAll(".runner-keys").forEach(function (k) { k.textContent = "⌘+Enter"; });
  }
  window.addEventListener("resize", function () {
    document.querySelectorAll(".runner-code").forEach(fit);
  });
})();
