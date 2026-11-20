"""Собирает закрытые материалы курсов из course-src/ в course/.

Запуск из корня сайта:
    python3 -m pip install markdown cryptography   # один раз
    python3 tools/build_course.py                  # собрать, ключ прежний
    python3 tools/build_course.py --new-key        # собрать с новым ключом (старая ссылка перестанет работать)
    python3 tools/build_course.py --dump /tmp/x    # дополнительно сохранить расшифрованные страницы для проверки

Как это устроено:
- course-src/ — отдельный закрытый репозиторий korovkina/korovkina-course (в .gitignore сайта).
  В нём папки курсов в формате LMS Шортката (config.toml + education/) и site.toml —
  какие курсы выкладывать на сайт.
- На сайт попадают уроки из config.toml, кроме квизов. Всё, что относится к LMS, вычищается:
  комментарии, блоки ::: github-task, раздел «Формат проверки», инструкции по сдаче.
  Задачи (github_*.md) в практике превращаются в ссылки на LeetCode; если у задачи
  нет источника на LeetCode, для неё делается отдельная страница с условием.
- Картинки встраиваются прямо в страницу, поэтому тоже зашифрованы.
- Ключ — 32 случайных байта в course-src/.key. Каждая страница шифруется AES-256-GCM,
  в course/ на GitHub лежит только шифротекст и пустая «оболочка».
- Ссылка для студентов: https://korovkina.uk/course/#КЛЮЧ. Часть после # браузер
  не отправляет на сервер; course.js расшифровывает страницу прямо в браузере.
- Страницы уроков пронумерованы (/course/basics/1/…), чтобы по именам папок
  в публичном репозитории нельзя было понять, о чём материалы.
"""
import base64
import html
import json
import mimetypes
import os
import re
import shutil
import sys
import tomllib
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_articles import FOOT, reading_minutes, render_article, site_header  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "course-src"
OUT = ROOT / "course"
KEY_FILE = SRC / ".key"
SITE = "https://korovkina.uk"


# ---------- ключ и шифрование ----------

def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def load_key(new):
    if new or not KEY_FILE.exists():
        KEY_FILE.write_text(b64url(os.urandom(32)) + "\n")
        os.chmod(KEY_FILE, 0o600)
    raw = KEY_FILE.read_text().strip()
    key = base64.urlsafe_b64decode(raw + "=" * (-len(raw) % 4))
    assert len(key) == 32, "в course-src/.key должен быть ключ из 32 байт"
    return raw, key


def encrypt(key, path, title, body):
    """Шифрует {title, html}; path (например «course/basics/1/») привязывает шифротекст к своей странице."""
    iv = os.urandom(12)
    data = json.dumps({"title": title, "html": body}, ensure_ascii=False).encode()
    return base64.b64encode(iv + AESGCM(key).encrypt(iv, data, path.encode())).decode()


# ---------- чистка Markdown из LMS ----------

FENCE = re.compile(r"^```.*?^```[ \t]*$", re.M | re.S)


def protect_fences(text):
    """Прячет блоки кода, чтобы правки текста их не задели."""
    saved = []

    def keep(m):
        saved.append(m.group(0))
        return f"XFENCEX{len(saved) - 1}X"
    return FENCE.sub(keep, text), saved


def restore_fences(text, saved):
    return re.sub(r"XFENCEX(\d+)X", lambda m: saved[int(m.group(1))], text)


def task_source(path):
    m = re.search(r"\*\*Источник:\*\*\s*\[[^\]]*\]\((https://leetcode\.com/problems/[^)\s]+)\)", path.read_text())
    return m.group(1) if m else None


def clean_markdown(text, kind):
    """Убирает следы LMS. kind: lesson | intro | practice | task."""
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    # блоки для LMS: ::: github-task … :::
    text = re.sub(r"^::: github-task\n.*?^:::[ \t]*$\n?", "", text, flags=re.M | re.S)
    if kind == "task":
        text = re.split(r"^## Формат проверки", text, maxsplit=1, flags=re.M)[0]
        text = re.sub(r"\*\*(Примеры?) \(суть задачи;.*?\):\*\*", r"**\1:**", text)
    if kind == "intro":
        # раздел про сдачу в LMS и пункт про квиз (квизы на сайт не переносятся)
        text = re.sub(r"^## Как сдавать практику\n.*?(?=^## )", "", text, flags=re.M | re.S)
        text = re.sub(r"^\d+\. .*[Кк]виз.*\n", "", text, flags=re.M)
        text = text.replace("https://web.shortcut.education/lms/public/algo/articles/complexity/",
                            f"{SITE}/articles/complexity/")
    if kind == "practice":
        text = re.sub(r"^## Задания с автоматической проверкой", "## Задачи", text, flags=re.M)
        text = re.sub(r"^.*проверяется автоматически.*\n\n?", "", text, flags=re.M)
    return text


# ---------- особые блоки: <details> и ::: bubbles ----------

def render_page_md(text):
    """Markdown урока → (HTML, оглавление). Понимает <details> и ::: bubbles поверх возможностей статей."""
    blocks = []

    def stash(html_block):
        blocks.append(html_block)
        return f"\n\nXBLOCKX{len(blocks) - 1}X\n\n"

    def details(m):
        inner_html, _ = render_article(m.group(2))
        return stash(f'<details class="spoiler"><summary>{html.escape(m.group(1).strip())}</summary>'
                     f'<div class="spoiler-body">{inner_html}</div></details>')
    text = re.sub(r"^<details>\s*\n<summary>(.*?)</summary>\s*\n(.*?)^</details>[ \t]*$", details, text,
                  flags=re.M | re.S)

    text = re.sub(r"^::: bubbles[^\n]*\n", lambda m: stash('<div class="bubbles">'), text, flags=re.M)
    # закрывающее ::: после bubbles (вкладки ::: tabs закрываются внутри render_article сами)
    out, depth = [], 0
    for line in text.split("\n"):
        if line.startswith("::: tabs"):
            depth += 1
        elif line.strip() == ":::" and depth:
            depth -= 1
        elif line.strip() == ":::":
            out.append(stash("</div>").strip("\n"))
            continue
        out.append(line)
    text = "\n".join(out)

    body, toc = render_article(text)
    for n, b in enumerate(blocks):
        body = body.replace(f"<p>XBLOCKX{n}X</p>", b).replace(f"XBLOCKX{n}X", b)
    return body, toc


# ---------- курс ----------

def lesson_kind(module_slug, lesson):
    f = lesson["file"]
    if module_slug == "intro":
        return "intro", "О курсе"
    if module_slug == "company_tasks":
        return "lesson", "Задачи компаний"
    if lesson.get("type") == "reading" or "practice" in f:
        return "practice", "Практика"
    return "lesson", "Лекция"


def build_course(conf, key, dump):
    cdir = SRC / conf["dir"]
    slug = conf["slug"]
    edu = cdir / tomllib.loads((cdir / "config.toml").read_text())["course"].get("education_dir", "education")
    modules = tomllib.loads((cdir / "config.toml").read_text())["modules"]
    warnings = []

    # 1. какие страницы будут: уроки по порядку, затем задачи без LeetCode
    pages, tasks = [], {}          # tasks: путь к github_*.md → ссылка
    for m in modules:
        mconf = edu / m["slug"] / "config.toml"
        lessons = tomllib.loads(mconf.read_text()).get("lessons", []) if mconf.exists() else []
        for les in lessons:
            p = edu / m["slug"] / les["file"]
            if les.get("type") == "quiz":
                continue
            if not p.exists():
                warnings.append(f"нет файла {p.relative_to(SRC)}")
                continue
            if p.name.startswith("github_"):
                tasks[p] = {"title": les["title"], "module": m, "src": task_source(p)}
                continue
            kind, label = lesson_kind(m["slug"], les)
            pages.append({"path": p, "title": les["title"], "module": m, "kind": kind, "label": label})
    lesson_count = len(pages)
    for p, t in tasks.items():
        if not t["src"]:
            pages.append({"path": p, "title": t["title"], "module": t["module"], "kind": "task", "label": "Задача"})
    for n, pg in enumerate(pages, start=1):
        pg["n"] = n
        if pg["kind"] == "task":
            tasks[pg["path"]]["page"] = n

    def task_href(p):
        t = tasks[p]
        return t["src"] or f'../{t["page"]}/'

    # 2. Markdown → HTML
    referenced = set()
    for pg in pages:
        text, fences = protect_fences(pg["path"].read_text())
        text = clean_markdown(text, pg["kind"])
        base = pg["path"].parent

        def image(m):
            src = (base / m.group(2)).resolve()
            if not src.exists():
                warnings.append(f"нет картинки {m.group(2)} в {pg['path'].relative_to(SRC)}")
                return ""
            mime = mimetypes.guess_type(src.name)[0] or "application/octet-stream"
            return f'![{m.group(1)}](data:{mime};base64,{base64.b64encode(src.read_bytes()).decode()})'
        text = re.sub(r"!\[([^\]]*)\]\(([^)\s]+)(?:\s+=\d*x\d*)?\)", image, text)

        def link(m):
            target = (base / m.group(1)).resolve()
            if target in tasks:
                referenced.add(target)
                return f"]({task_href(target)})"
            for other in pages:
                if other["path"].resolve() == target:
                    return f"](../{other['n']}/{m.group(2) or ''})"
            warnings.append(f"ссылка на {m.group(1)} из {pg['path'].relative_to(SRC)} никуда не ведёт")
            return f"]({m.group(2) or '#'})"
        text = re.sub(r"\]\(((?!https?:)[\w./-]+\.md)(#[^)\s]*)?\)", link, text)
        pg["body"], pg["toc"] = render_page_md(restore_fences(text, fences))
        pg["mins"] = reading_minutes(restore_fences(re.sub(r"data:[^)]+", "", text), fences))

    # задачи, на которые не ссылается ни одна страница практики, — списком в конце темы
    orphans = {}
    for p, t in tasks.items():
        if p not in referenced:
            orphans.setdefault(t["module"]["slug"], []).append((t["title"], p))

    # 3. страницы уроков
    out_dir = OUT / slug
    out_dir.mkdir(parents=True)
    lessons_only = [pg for pg in pages if pg["kind"] != "task"]
    for pg in pages:
        n = pg["n"]
        toc_html = "".join(f'<li><a href="#{t["id"]}">{html.escape(t["name"])}</a></li>' for t in pg["toc"])
        toc_block = (f'<aside class="article-toc" aria-label="Содержание"><p class="toc-title">Содержание</p>'
                     f'<ol>{toc_html}</ol></aside>') if pg["toc"] else ""
        if pg["kind"] == "task":
            pager = '<nav class="pager" aria-label="Навигация"><a href="../"><span>← к курсу</span>' \
                    f'{html.escape(conf["title"])}</a><span></span></nav>'
        else:
            i = lessons_only.index(pg)
            prev_p = lessons_only[i - 1] if i > 0 else None
            next_p = lessons_only[i + 1] if i + 1 < len(lessons_only) else None
            pager = '<nav class="pager" aria-label="Другие материалы">'
            pager += f'<a href="../{prev_p["n"]}/"><span>← назад</span>{html.escape(prev_p["title"])}</a>' if prev_p else "<span></span>"
            pager += f'<a class="next" href="../{next_p["n"]}/"><span>дальше →</span>{html.escape(next_p["title"])}</a>' if next_p else "<span></span>"
            pager += "</nav>"
        body = f"""<div class="wrap article-layout">
  <header class="article-head">
    <p class="eyebrow"><a href="../">{html.escape(conf["title"])}</a> · {html.escape(pg["module"]["title"])}</p>
    <h1 class="article-title">{html.escape(pg["title"])}</h1>
    <p class="lesson-meta">{pg["label"]} · {pg["mins"]} мин</p>
  </header>
  {toc_block}
  <article class="article-body">
{pg["body"]}
    {pager}
  </article>
</div>"""
        path = f"course/{slug}/{n}/"
        title = f'{pg["title"]} — {conf["title"]}'
        (out_dir / str(n)).mkdir()
        (out_dir / str(n) / "index.html").write_text(shell(3, path, encrypt(key, path, title, body)))
        if dump:
            (dump / slug).mkdir(parents=True, exist_ok=True)
            (dump / slug / f"{n}.html").write_text(body)

    # 4. страница курса: темы и уроки
    sections = []
    for m in modules:
        items = [pg for pg in lessons_only if pg["module"] is m]
        extra = orphans.get(m["slug"], [])
        if not items and not extra:
            continue
        lis = "".join(
            f'<li><a class="lesson-row" href="{pg["n"]}/"><span class="k">{pg["label"]}</span>'
            f'<strong>{html.escape(pg["title"])}</strong><span class="m">{pg["mins"]} мин</span></a></li>'
            for pg in items)
        for title, p in extra:
            href = task_href(p).replace("../", "")
            ext = ' rel="noopener"' if href.startswith("http") else ""
            lis += (f'<li><a class="lesson-row" href="{href}"{ext}><span class="k">Задача</span>'
                    f'<strong>{html.escape(title)}</strong><span class="m">{"LeetCode ↗" if ext else ""}</span></a></li>')
        sections.append(f'<section class="course-module"><h2>{html.escape(m["title"])}</h2><ol class="lesson-list">{lis}</ol></section>')
    index = f"""<section class="hero hero-sm">
  <div class="wrap">
    <p class="eyebrow"><a href="../">Материалы курсов</a></p>
    <h1 class="page-title">{html.escape(conf["title"])}</h1>
    <p class="lead">{html.escape(conf.get("description", ""))}</p>
  </div>
</section>
<section class="section">
  <div class="wrap course-modules">{"".join(sections)}</div>
</section>"""
    path = f"course/{slug}/"
    (out_dir / "index.html").write_text(shell(2, path, encrypt(key, path, f'{conf["title"]} — материалы', index)))
    if dump:
        (dump / slug / "index.html").write_text(index)
    n_tasks_pages = len(pages) - lesson_count
    return {"lessons": lesson_count, "task_pages": n_tasks_pages, "tasks": len(tasks),
            "orphans": sum(len(v) for v in orphans.values()), "warnings": warnings}


def shell(depth, path, payload):
    """Открытая часть страницы: шапка, сообщение «нужна ссылка» и шифротекст."""
    up = "../" * depth
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>Материалы курса — Татьяна Коровкина</title>
  <meta name="robots" content="noindex, nofollow">
  <meta name="referrer" content="no-referrer">
  <link rel="icon" href="{up}favicon.svg" type="image/svg+xml">
  <script>try{{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}}catch(e){{}}</script>
  <link rel="stylesheet" href="{up}styles.css">
  <script src="{up}site.js" defer></script>
  <script src="{up}course.js" defer></script>
</head>
<body>
{site_header(up)}
  <main id="main" class="course-page">
    <div id="course-root" data-path="{path}" aria-live="polite"></div>
    <section class="hero hero-sm course-locked" hidden>
      <div class="wrap">
        <p class="eyebrow">Материалы курса</p>
        <h1 class="page-title">Нужна ссылка от преподавателя</h1>
        <p class="lead">Материалы открываются только по личной ссылке. Если она у вас есть, откройте её целиком, вместе с частью после «#».</p>
        <p class="lead course-stale" hidden>Похоже, ссылка устарела. Попросите у преподавателя новую.</p>
      </div>
    </section>
    <noscript>
      <section class="hero hero-sm"><div class="wrap">
        <h1 class="page-title">Нужен JavaScript</h1>
        <p class="lead">Материалы курса расшифровываются в браузере, поэтому без JavaScript не откроются.</p>
      </div></section>
    </noscript>
    <script type="application/octet-stream" id="course-data">{payload}</script>
  </main>
{FOOT}"""


def plural(n, one, few, many):
    if n % 10 == 1 and n % 100 != 11:
        return f"{n} {one}"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return f"{n} {few}"
    return f"{n} {many}"


def main():
    raw_key, key = load_key("--new-key" in sys.argv)
    dump = None
    if "--dump" in sys.argv:
        dump = Path(sys.argv[sys.argv.index("--dump") + 1])
        shutil.rmtree(dump, ignore_errors=True)
        dump.mkdir(parents=True)
    site = tomllib.loads((SRC / "site.toml").read_text())

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()

    cards = []
    for i, c in enumerate(site["courses"], start=1):
        st = build_course(c, key, dump)
        print(f'{c["slug"]}: уроков {st["lessons"]}, задач {st["tasks"]} '
              f'(отдельных страниц с условием {st["task_pages"]}, вне практики {st["orphans"]})')
        for w in st["warnings"]:
            print(f"  ! {w}")
        cards.append(
            f'<li><a class="article-card" href="{c["slug"]}/"><span class="k">{i:02d}</span>'
            f'<strong>{html.escape(c["title"])}</strong><span class="t">{html.escape(c.get("description", ""))}</span>'
            f'<span class="m">{plural(st["lessons"], "материал", "материала", "материалов")}</span></a></li>'
        )

    index = f"""<section class="hero hero-sm">
  <div class="wrap">
    <p class="eyebrow">Материалы курсов</p>
    <h1 class="page-title">{html.escape(site["title"])}</h1>
    <p class="lead">{html.escape(site.get("description", ""))}</p>
  </div>
</section>
<section class="section">
  <div class="wrap">
    <ol class="article-list">{"".join(cards)}</ol>
  </div>
</section>"""
    (OUT / "index.html").write_text(shell(1, "course/", encrypt(key, "course/", f'{site["title"]} — Татьяна Коровкина', index)))
    if dump:
        (dump / "index.html").write_text(index)
    print(f"Ссылка для студентов: {SITE}/course/#{raw_key}")


if __name__ == "__main__":
    main()
