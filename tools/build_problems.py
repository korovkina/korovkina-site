"""Собирает раздел задач по Python из content/problems/*.py в problems/.

Запуск из корня сайта:
    python3 tools/build_problems.py
    python3 tools/build_problems.py --from ~/Documents/ShortcutEdu/issues   # сначала забрать свежие сборники

Формат сборника — обычный .py-файл, который можно решать и в редакторе:
    '''
    Вступление к сборнику (до первой задачи).

    1. Название задачи

    Условие. Строки вида  имя = ...  (и их продолжение с отступом) показываются как код.

    Ожидаемый вывод:
    строки вывода до пустой строки

    Пригодится: подсказка (прячется под спойлер)
    Вопрос на подумать: ...  /  Дополнительно: ...
    '''
    стартовый код с данными задачи

В конце файла после строки «# ===== Решения» можно хранить свои решения в комментариях:
сборка их отрезает, на сайт они не попадают.

Код задач запускается прямо в браузере: Python (Pyodide) лежит в pyodide/<версия>/,
страница — problems.js, сам запуск — в отдельном потоке problems/worker.js.
"""
import html
import re
import sys
import textwrap
import tomllib
from pathlib import Path

from build_articles import FOOT, head

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "problems"
OUT = ROOT / "problems"

TASK_HEAD = re.compile(r"^(\d+)\.\s+(\S.*)$")
CODE_LINE = re.compile(r"^[A-Za-z_]\w*\s*=\s")
URL = re.compile(r"https?://\S+")
EXTRA = {  # подписи особых строк в конце условия: (заголовок, CSS-класс врезки)
    "Вопрос на подумать": ("Вопрос на подумать", "note note-important"),
    "Дополнительно": ("Дополнительно", "note note-tip"),
}


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return one
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return few
    return many


SOLUTIONS_MARK = "# ===== Решения"


def split_source(text):
    """Делит файл на пары (строка документации, код после неё).
    Всё начиная со строки «# ===== Решения…» — решения автора, на сайт они не попадают."""
    text = text.split("\n" + SOLUTIONS_MARK, 1)[0]
    parts = text.split("'''")
    # parts: [до первой строки, doc1, код1, doc2, код2, ...]
    pairs = []
    for i in range(1, len(parts), 2):
        code = parts[i + 1] if i + 1 < len(parts) else ""
        pairs.append((parts[i].strip("\n"), code.strip("\n")))
    return pairs


def paragraphs(lines):
    """Группирует строки в абзацы по пустым строкам."""
    block = []
    for line in lines:
        if line.strip():
            block.append(line)
        elif block:
            yield block
            block = []
    if block:
        yield block


def inline(text):
    """Экранирует текст и превращает адреса в ссылки."""
    out, pos = [], 0
    for m in URL.finditer(text):
        out.append(html.escape(text[pos:m.start()]))
        url = m.group(0).rstrip(".,)")
        out.append(f'<a href="{html.escape(url)}" rel="noopener">{html.escape(url)}</a>')
        pos = m.start() + len(url)
    out.append(html.escape(text[pos:]))
    return "".join(out)


def link_label(url):
    """Подпись для голой ссылки: якорь или последний кусок адреса."""
    tail = url.split("#", 1)[1] if "#" in url else url.rstrip("/").rsplit("/", 1)[-1]
    return tail.replace("-", " ").replace("_", " ").removesuffix(".asp").removesuffix(".html")


def render_intro(text):
    out = []
    for block in paragraphs(text.split("\n")):
        first, rest = block[0], block[1:]
        if rest and re.match(r"^\d+\.\s", rest[0].strip()):
            # список ссылок: «N. Подпись: адрес», адреса могут продолжаться на следующих строках
            items = []
            for line in rest:
                m = re.match(r"^\d+\.\s+(.*)$", line.strip())
                if m:
                    items.append([m.group(1)])
                else:
                    items[-1].append(line.strip())
            lis = []
            for it in items:
                head_txt = it[0]
                urls = URL.findall(" ".join(it))
                label = URL.sub("", head_txt).strip().rstrip(":").strip()
                if len(urls) == 1:
                    lis.append(f'<li><a href="{html.escape(urls[0])}" rel="noopener">{html.escape(label)}</a></li>')
                else:
                    links = ", ".join(f'<a href="{html.escape(u)}" rel="noopener">{html.escape(link_label(u))}</a>' for u in urls)
                    lis.append(f"<li>{html.escape(label)}: {links}</li>")
            out.append(f"<p>{inline(first)}</p><ul>{''.join(lis)}</ul>")
        elif rest and all(line.startswith((" ", "\t")) for line in rest):
            # подпись и блок с отступом — это код
            code = textwrap.dedent("\n".join(rest))
            out.append(f'<p>{inline(first)}</p><pre><code>{html.escape(code)}</code></pre>')
        else:
            out.append(f"<p>{inline(' '.join(line.strip() for line in block))}</p>")
    return "\n".join(out)


def parse_task(doc, code):
    lines = doc.split("\n")
    m = TASK_HEAD.match(lines[0].strip())
    num, title = int(m.group(1)), m.group(2).strip()
    body, expected, hint, extras = [], [], None, []
    i = 1
    while i < len(lines):
        line = lines[i]
        s = line.strip()
        if s == "Ожидаемый вывод:":
            i += 1
            while i < len(lines) and lines[i].strip():
                expected.append(lines[i].rstrip())
                i += 1
            continue
        key = s.split(":", 1)[0]
        if s.startswith("Пригодится:"):
            hint = s.split(":", 1)[1].strip()
        elif key in EXTRA and ":" in s:
            extra = s.split(":", 1)[1].strip()
            extras.append((key, extra[:1].upper() + extra[1:]))
        else:
            body.append(line)
        i += 1
    return {"num": num, "title": title, "body": body, "expected": expected,
            "hint": hint, "extras": extras, "code": code}


def render_statement(lines):
    """Условие: абзацы текста, а строки с данными (имя = ... и продолжения с отступом) — блоком кода."""
    out, code, text = [], [], []

    def flush_text():
        if text:
            out.append(f"<p>{inline(' '.join(t.strip() for t in text))}</p>")
            text.clear()

    def flush_code():
        if code:
            out.append(f'<pre class="task-data"><code>{html.escape(chr(10).join(code))}</code></pre>')
            code.clear()

    for line in lines:
        if not line.strip():
            flush_text()
            flush_code()
        elif CODE_LINE.match(line) or (code and (line.startswith((" ", "\t")) or line.strip()[0] in "]})")):
            flush_text()
            code.append(line.rstrip())
        elif re.match(r"^[а-яa-z]\)\s", line.strip()):
            # пункты а), б) — каждый с новой строки
            flush_code()
            flush_text()
            text.append(line)
        elif text and line.startswith("   "):
            text.append(line)  # перенос длинного пункта
        else:
            flush_code()
            text.append(line)
    flush_text()
    flush_code()
    return "\n".join(out)


def render_task(slug, t):
    tid = f"task-{t['num']}"
    parts = [f'<section class="task" id="{tid}" data-task="{slug}/{t["num"]}" aria-labelledby="{tid}-title">',
             f'<h2 id="{tid}-title"><span class="task-num">{t["num"]}.</span> {html.escape(t["title"])}</h2>',
             render_statement(t["body"])]
    if t["hint"]:
        parts.append(f'<details class="spoiler task-hint"><summary>Подсказка</summary>'
                     f'<div class="spoiler-body"><p>Пригодится: {inline(t["hint"])}</p></div></details>')
    for key, text in t["extras"]:
        label, cls = EXTRA[key]
        parts.append(f'<aside class="{cls}"><p class="note-label">{label}</p><p>{inline(text)}</p></aside>')
    expected = "\n".join(t["expected"])
    starter = t["code"] + "\n\n"
    rows = max(5, starter.count("\n") + 2)
    parts.append(f"""<p class="task-label">Ожидаемый вывод</p>
<pre class="task-expected"><code>{html.escape(expected)}</code></pre>
<div class="runner" hidden>
  <p class="task-label"><label for="{tid}-code">Решение</label></p>
  <textarea class="runner-code" id="{tid}-code" rows="{rows}" spellcheck="false" autocapitalize="off" autocomplete="off" autocorrect="off">{html.escape(starter)}</textarea>
  <div class="runner-bar">
    <button type="button" class="btn primary runner-run">Запустить</button>
    <button type="button" class="btn ghost runner-reset">Сбросить</button>
    <span class="runner-keys">Ctrl+Enter</span>
  </div>
  <div class="runner-result" hidden>
    <p class="runner-status" role="status"></p>
    <pre class="runner-out"><code></code></pre>
  </div>
</div>
<noscript><p class="runner-off">Чтобы запускать код прямо на странице, включите JavaScript.</p></noscript>
</section>""")
    return "\n".join(parts)


def build_collection(c):
    pairs = split_source((SRC / c["file"]).read_text())
    intro_doc, first_code = pairs[0]
    # вступление и первая задача делят одну строку документации
    lines = intro_doc.split("\n")
    first_task = next(i for i, l in enumerate(lines) if TASK_HEAD.match(l.strip()) and i > 0 and not lines[i - 1].strip())
    intro = "\n".join(lines[:first_task]).strip()
    # первый абзац вступления становится подзаголовком страницы
    lead, _, intro = intro.partition("\n\n")
    lead = " ".join(l.strip() for l in lead.split("\n"))
    docs = [("\n".join(lines[first_task:]), first_code)] + pairs[1:]
    tasks = [parse_task(d, code) for d, code in docs]

    toc = "".join(f'<li><a href="#task-{t["num"]}">{t["num"]}. {html.escape(t["title"])}</a></li>' for t in tasks)
    page = head(f'{c["title"]} — задачи по Python — Татьяна Коровкина', c["description"],
                f'https://korovkina.uk/problems/{c["slug"]}/', 2, current="")
    page = page.replace("</head>", '  <script src="../../problems.js" defer></script>\n</head>')
    page += f"""
  <main id="main" class="article-page problems-page" data-worker="../worker.js">
    <div class="wrap article-layout">
      <header class="article-head">
        <p class="eyebrow"><a href="../">Задачи по Python</a> · {len(tasks)} {plural(len(tasks), "задача", "задачи", "задач")}</p>
        <h1 class="article-title">{html.escape(c["title"])}</h1>
        <p class="lead">{html.escape(lead)}</p>
      </header>
      <aside class="article-toc" aria-label="Задачи">
        <p class="toc-title">Задачи</p>
        <ol class="task-toc">{toc}</ol>
        <div class="aquarium" hidden>
          <div class="aq-tank" aria-hidden="true"></div>
          <p class="aq-count" aria-live="polite"></p>
        </div>
      </aside>
      <article class="article-body">
{render_intro(intro)}
<aside class="note runner-note" hidden><p class="note-label">Как решать</p><p>Код запускается прямо в браузере, вывод сразу сравнивается с ожидаемым, а решения сохраняются в этом браузере. При первом запуске загрузится Python — около 13 МБ.</p></aside>
{chr(10).join(render_task(c["slug"], t) for t in tasks)}
<section class="finale" id="finale" hidden aria-labelledby="finale-title">
  <p class="eyebrow">{len(tasks)} из {len(tasks)}</p>
  <h2 id="finale-title">Все задачи решены!</h2>
  <p>Все рыбки в аквариуме. Сохраните открытку на память или отправьте её тому, кто вас учит: пусть порадуется вместе с вами.</p>
  <p class="finale-name"><label for="finale-name">Имя на открытке</label><input id="finale-name" type="text" maxlength="40" autocomplete="name" placeholder="Например, Аня"></p>
  <canvas class="finale-card" width="1200" height="630" role="img" aria-label="Открытка: сборник «{html.escape(c["title"])}» решён"></canvas>
  <div class="runner-bar">
    <button type="button" class="btn primary finale-save">Скачать открытку</button>
    <button type="button" class="btn ghost finale-share" hidden>Поделиться</button>
  </div>
</section>
      </article>
    </div>
  </main>
"""
    page += FOOT
    d = OUT / c["slug"]
    d.mkdir(parents=True, exist_ok=True)
    (d / "index.html").write_text(page)
    return len(tasks)


def sync_from(folder):
    """Копирует сборники из папки автора в content/problems, отрезая решения: репозиторий публичный."""
    meta = tomllib.loads((SRC / "problems.toml").read_text())["collections"]
    for c in meta:
        text = (Path(folder).expanduser() / c["file"]).read_text()
        text = text.split("\n" + SOLUTIONS_MARK, 1)[0].rstrip() + "\n"
        (SRC / c["file"]).write_text(text)
        print(f"Скопирован {c['file']}")


def main():
    args = sys.argv[1:]
    if args[:1] == ["--from"]:
        sync_from(args[1])
    meta = tomllib.loads((SRC / "problems.toml").read_text())["collections"]
    cards = []
    for idx, c in enumerate(meta):
        n = build_collection(c)
        cards.append(
            f'<li><a class="article-card" href="{c["slug"]}/"><span class="k">{idx + 1:02d}</span>'
            f'<strong>{html.escape(c["title"])}</strong><span class="t">{html.escape(c["description"])}</span>'
            f'<span class="m">{n} {plural(n, "задача", "задачи", "задач")}</span></a></li>'
        )
    index = head("Задачи по Python — Татьяна Коровкина",
                 "Сборники задач по Python от Татьяны Коровкиной: решайте и запускайте код прямо в браузере.",
                 "https://korovkina.uk/problems/", 1, current="")
    index += f"""
  <main id="main">
    <section class="hero hero-sm">
      <div class="wrap">
        <p class="eyebrow">Задачи</p>
        <h1 class="page-title">Задачи по Python</h1>
        <p class="lead">Сборники задач для тренировки. Решение можно написать и запустить прямо на странице, а вывод сразу сравнится с ожидаемым.</p>
      </div>
    </section>
    <section class="section">
      <div class="wrap">
        <ol class="article-list">{"".join(cards)}</ol>
      </div>
    </section>
  </main>
"""
    index += FOOT
    (OUT / "index.html").write_text(index)
    print(f"Собрано сборников: {len(meta)}")


if __name__ == "__main__":
    main()
