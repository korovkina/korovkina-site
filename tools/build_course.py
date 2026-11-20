"""Собирает закрытые материалы курса из course-src/ в course/.

Запуск из корня сайта:
    python3 -m pip install markdown cryptography   # один раз
    python3 tools/build_course.py                  # собрать, ключ прежний
    python3 tools/build_course.py --new-key        # собрать с новым ключом (старая ссылка перестанет работать)

Как это устроено:
- Исходники курса лежат в course-src/ (Markdown + course.toml). Эта папка в .gitignore
  и на GitHub не попадает — храните её копию сами.
- Ключ — 32 случайных байта в course-src/.key. Если файла нет, скрипт создаст его.
- Каждая страница шифруется AES-256-GCM. В course/ на GitHub лежит только шифротекст
  и пустая «оболочка» страницы, без названий тем.
- Ссылка для студентов: https://korovkina.uk/course/#КЛЮЧ. Часть после # браузер
  не отправляет на сервер; course.js расшифровывает страницу прямо в браузере.
- Адреса страниц — номера (/course/1/, /course/2/…), чтобы по именам папок
  в репозитории нельзя было понять, о чём материалы.
"""
import base64
import html
import json
import os
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
    """Шифрует {title, html}; path (например «course/1/») привязывает шифротекст к своей странице."""
    iv = os.urandom(12)
    data = json.dumps({"title": title, "html": body}, ensure_ascii=False).encode()
    return base64.b64encode(iv + AESGCM(key).encrypt(iv, data, path.encode())).decode()


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


def main():
    raw_key, key = load_key("--new-key" in sys.argv)
    course = tomllib.loads((SRC / "course.toml").read_text())
    items = course["materials"]

    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir()

    cards = []
    for n, m in enumerate(items, start=1):
        md_text = (SRC / m["file"]).read_text()
        content, toc = render_article(md_text)
        mins = reading_minutes(md_text)
        kind = html.escape(m.get("kind", "Материал"))
        toc_html = "".join(f'<li><a href="#{t["id"]}">{html.escape(t["name"])}</a></li>' for t in toc)
        toc_block = (f'<aside class="article-toc" aria-label="Содержание"><p class="toc-title">Содержание</p>'
                     f'<ol>{toc_html}</ol></aside>') if toc else ""
        prev_m = items[n - 2] if n > 1 else None
        next_m = items[n] if n < len(items) else None
        pager = '<nav class="pager" aria-label="Другие материалы">'
        pager += f'<a href="../{n - 1}/"><span>← предыдущий</span>{html.escape(prev_m["title"])}</a>' if prev_m else "<span></span>"
        pager += f'<a class="next" href="../{n + 1}/"><span>следующий →</span>{html.escape(next_m["title"])}</a>' if next_m else "<span></span>"
        pager += "</nav>"
        body = f"""<div class="wrap article-layout">
  <header class="article-head">
    <p class="eyebrow"><a href="../">Материалы курса</a> · {kind} {n} · {mins} мин</p>
    <h1 class="article-title">{html.escape(m["title"])}</h1>
    {f'<p class="lead">{html.escape(m["description"])}</p>' if m.get("description") else ""}
  </header>
  {toc_block}
  <article class="article-body">
{content}
    {pager}
  </article>
</div>"""
        path = f"course/{n}/"
        (OUT / str(n)).mkdir()
        (OUT / str(n) / "index.html").write_text(shell(2, path, encrypt(key, path, f'{m["title"]} — материалы курса', body)))
        desc = f'<span class="t">{html.escape(m["description"])}</span>' if m.get("description") else ""
        cards.append(
            f'<li><a class="article-card" href="{n}/"><span class="k">{n:02d}</span>'
            f'<strong>{html.escape(m["title"])}</strong>{desc}'
            f'<span class="m">{kind} · {mins} мин</span></a></li>'
        )

    index = f"""<section class="hero hero-sm">
  <div class="wrap">
    <p class="eyebrow">Материалы курса</p>
    <h1 class="page-title">{html.escape(course["title"])}</h1>
    {f'<p class="lead">{html.escape(course["description"])}</p>' if course.get("description") else ""}
  </div>
</section>
<section class="section">
  <div class="wrap">
    <ol class="article-list">{"".join(cards)}</ol>
  </div>
</section>"""
    (OUT / "index.html").write_text(shell(1, "course/", encrypt(key, "course/", f'{course["title"]} — материалы курса', index)))

    print(f"Собрано материалов: {len(items)}")
    print(f"Ссылка для студентов: {SITE}/course/#{raw_key}")


if __name__ == "__main__":
    main()
