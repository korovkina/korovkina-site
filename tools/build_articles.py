"""Собирает страницы статей из content/articles/*.md в articles/.

Запуск из корня сайта:
    python3 -m pip install markdown   # один раз
    python3 tools/build_articles.py

Понимает обычный Markdown (таблицы, блоки кода) и две особые конструкции из курса:
    ::: tabs / === Python / ... / :::   — вкладки с кодом на разных языках
    > [!NOTE] текст                      — врезка-заметка (а также TIP, IMPORTANT, WARNING, CAUTION)
"""
import html
import re
import shutil
import tomllib
from pathlib import Path

import markdown
from markdown.extensions.toc import slugify_unicode

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "content" / "articles"
OUT = ROOT / "articles"

MD_EXT = ["extra", "sane_lists"]

# врезки вида > [!NOTE]: подпись и CSS-класс
NOTE_KINDS = {
    "NOTE": ("Заметка", "note"),
    "TIP": ("Совет", "note note-tip"),
    "IMPORTANT": ("Важно", "note note-important"),
    "WARNING": ("Внимание", "note note-warning"),
    "CAUTION": ("Осторожно", "note note-warning"),
}


def md_fragment(text):
    return markdown.markdown(text, extensions=MD_EXT)


def fragment_with_blocks(text):
    """Кусок Markdown внутри вкладки: тоже понимает врезки > [!NOTE]."""
    body, blocks = extract_blocks(text)
    out = md_fragment(body)
    for n, b in enumerate(blocks):
        out = out.replace(f"<p>BLOCKPLACEHOLDER{n}</p>", b)
    return out


def extract_blocks(text):
    """Заменяет вкладки и заметки на метки, возвращает текст и HTML блоков."""
    lines = text.split("\n")
    out, blocks = [], []
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.strip() == "::: tabs":
            tabs, cur = [], None
            i += 1
            while i < len(lines) and lines[i].strip() != ":::":
                m = re.match(r"^=== (.+)$", lines[i])
                if m:
                    cur = [m.group(1).strip(), []]
                    tabs.append(cur)
                elif cur is not None:
                    cur[1].append(lines[i])
                i += 1
            i += 1  # пропускаем закрывающее :::
            n = len(blocks)
            buttons = "".join(
                f'<button type="button" role="tab" data-lang="{html.escape(name)}">{html.escape(name)}</button>'
                for name, _ in tabs
            )
            panels = "".join(
                f'<div class="tab-panel" role="tabpanel" data-lang="{html.escape(name)}">'
                f'<p class="tab-label">{html.escape(name)}</p>{fragment_with_blocks(chr(10).join(body))}</div>'
                for name, body in tabs
            )
            blocks.append(f'<div class="tabs"><div class="tab-list" role="tablist" hidden>{buttons}</div>{panels}</div>')
            out += ["", f"BLOCKPLACEHOLDER{n}", ""]
            continue
        m = re.match(r"^> \[!(NOTE|TIP|WARNING|IMPORTANT|CAUTION)\]\s*(.*)$", line)
        if m:
            kind = m.group(1)
            body = [m.group(2)]
            i += 1
            while i < len(lines) and lines[i].startswith(">"):
                body.append(lines[i][1:].lstrip())
                i += 1
            n = len(blocks)
            label, cls = NOTE_KINDS[kind]
            blocks.append(f'<aside class="{cls}"><p class="note-label">{label}</p>{md_fragment(chr(10).join(body))}</aside>')
            out += ["", f"BLOCKPLACEHOLDER{n}", ""]
            continue
        out.append(line)
        i += 1
    return "\n".join(out), blocks


LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d+\.)\s")


def normalize_lists(text):
    """Подгоняет списки под python-markdown, не трогая блоки кода:
    пустая строка перед списком, который идёт сразу за текстом,
    и отступ вложенных пунктов 4 пробела вместо 2–3."""
    out, in_code = [], False
    for line in text.split("\n"):
        if line.lstrip().startswith("```"):
            in_code = not in_code
            out.append(line)
            continue
        if not in_code:
            m = LIST_ITEM.match(line)
            if m:
                indent = len(m.group(1))
                if 0 < indent < 4:
                    line = "    " + line.lstrip()
                prev = out[-1] if out else ""
                if prev.strip() and not LIST_ITEM.match(prev) and not prev.startswith("    "):
                    out.append("")
        out.append(line)
    return "\n".join(out)


def render_article(md_text):
    md_text = re.sub(r"^\s*<!--.*?-->\s*", "", md_text, count=1, flags=re.S)
    md_text = normalize_lists(md_text)
    body, blocks = extract_blocks(md_text)
    conv = markdown.Markdown(
        extensions=MD_EXT + ["toc"],
        extension_configs={"toc": {"slugify": slugify_unicode, "toc_depth": "2-2"}},
    )
    out = conv.convert(body)
    for n, b in enumerate(blocks):
        out = out.replace(f"<p>BLOCKPLACEHOLDER{n}</p>", b)
    out = out.replace("<table>", '<div class="table-wrap"><table>').replace("</table>", "</table></div>")
    return out, conv.toc_tokens


def reading_minutes(md_text):
    prose = re.sub(r"```.*?```", "", md_text, flags=re.S)
    return max(1, round(len(re.findall(r"\w+", prose)) / 180))


def site_header(up, current=""):
    """Ссылка «перейти к содержанию» и шапка: цепочка разделов, тема, язык. current — атрибуты для ссылки «Статьи»."""
    return f"""  <a class="skip" href="#main">Перейти к содержанию</a>
  <header class="site-head">
    <div class="wrap head-row">
      <nav aria-label="Разделы сайта">
        <ol class="chain">
          <li><a class="head" href="{up}">head</a></li>
          <li><a href="{up}#about">Обо мне</a></li>
          <li><a href="{up}#course">Курс</a></li>
          <li><a href="{up}talks/">Выступления</a></li>
          <li><a href="{up}articles/"{current}>Статьи</a></li>
          <li><span class="none">None</span></li>
        </ol>
      </nav>
      <div class="head-tools">
        <div class="theme-switch" role="group" aria-label="Тема оформления" hidden>
          <button type="button" data-theme-set="light" aria-pressed="false" aria-label="Светлая тема" title="Светлая тема"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6"/></svg></button>
          <button type="button" data-theme-set="dark" aria-pressed="false" aria-label="Тёмная тема" title="Тёмная тема"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M19.5 14.6A8 8 0 1 1 9.4 4.5a6.4 6.4 0 0 0 10.1 10.1Z"/></svg></button>
        </div>
        <nav class="lang-switch" aria-label="Язык сайта">
          <span aria-current="true">RU</span>
          <a href="{up}en/" hreflang="en" lang="en">EN</a>
        </nav>
      </div>
    </div>
  </header>
"""


def head(title, description, canonical, depth):
    up = "../" * depth
    return f"""<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>{html.escape(title)}</title>
  <meta name="description" content="{html.escape(description)}">
  <meta property="og:type" content="article">
  <meta property="og:locale" content="ru_RU">
  <meta property="og:title" content="{html.escape(title)}">
  <meta property="og:description" content="{html.escape(description)}">
  <meta property="og:url" content="{canonical}">
  <meta property="og:image" content="https://korovkina.uk/og.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Татьяна Коровкина — алгоритмы и собеседования">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="{canonical}">
  <link rel="icon" href="{up}favicon.svg" type="image/svg+xml">
  <script>try{{var t=localStorage.getItem("theme");if(t==="light"||t==="dark")document.documentElement.dataset.theme=t}}catch(e){{}}</script>
  <link rel="stylesheet" href="{up}styles.css">
  <script src="{up}site.js" defer></script>
</head>
<body>
{site_header(up, ' aria-current="page"')}"""


FOOT = """
  <footer class="site-foot">
    <div class="wrap">
      <span>© 2026 Татьяна Коровкина</span>
      <span class="mono">next → None</span>
    </div>
  </footer>
</body>
</html>
"""


def main():
    meta = tomllib.loads((SRC / "articles.toml").read_text())["articles"]
    (OUT / "images").mkdir(parents=True, exist_ok=True)
    for img in SRC.glob("*.png"):
        shutil.copy2(img, OUT / "images" / img.name)

    cards = []
    for idx, a in enumerate(meta):
        md_text = (SRC / a["file"]).read_text()
        content, toc = render_article(md_text)
        mins = reading_minutes(md_text)
        toc_html = "".join(f'<li><a href="#{t["id"]}">{html.escape(t["name"])}</a></li>' for t in toc)
        prev_a = meta[idx - 1] if idx > 0 else None
        next_a = meta[idx + 1] if idx + 1 < len(meta) else None
        pager = '<nav class="pager" aria-label="Другие статьи">'
        pager += f'<a href="../{prev_a["slug"]}/"><span>← предыдущая</span>{html.escape(prev_a["title"])}</a>' if prev_a else "<span></span>"
        pager += f'<a class="next" href="../{next_a["slug"]}/"><span>следующая →</span>{html.escape(next_a["title"])}</a>' if next_a else "<span></span>"
        pager += "</nav>"
        page = head(f'{a["title"]} — Татьяна Коровкина', a["description"],
                    f'https://korovkina.uk/articles/{a["slug"]}/', 2)
        page += f"""
  <main id="main" class="article-page">
    <div class="wrap article-layout">
      <header class="article-head">
        <p class="eyebrow"><a href="../">Статьи</a> · {mins} мин чтения</p>
        <h1 class="article-title">{html.escape(a["title"])}</h1>
        <p class="lead">{html.escape(a["description"])}</p>
      </header>
      <aside class="article-toc" aria-label="Содержание">
        <p class="toc-title">Содержание</p>
        <ol>{toc_html}</ol>
      </aside>
      <article class="article-body">
{content}
        {pager}
      </article>
    </div>
  </main>
"""
        page += FOOT
        d = OUT / a["slug"]
        d.mkdir(parents=True, exist_ok=True)
        (d / "index.html").write_text(page)
        cards.append(
            f'<li><a class="article-card" href="{a["slug"]}/"><span class="k">{idx + 1:02d}</span>'
            f'<strong>{html.escape(a["title"])}</strong><span class="t">{html.escape(a["description"])}</span>'
            f'<span class="m">{mins} мин чтения</span></a></li>'
        )

    index = head("Статьи — Татьяна Коровкина",
                 "Статьи Татьяны Коровкиной об алгоритмах: сложность, оптимизация, сортировки.",
                 "https://korovkina.uk/articles/", 1)
    index += f"""
  <main id="main">
    <section class="hero hero-sm">
      <div class="wrap">
        <p class="eyebrow">Статьи</p>
        <h1 class="page-title">Статьи об алгоритмах</h1>
        <p class="lead">Подробные материалы, к которым удобно возвращаться при подготовке к собеседованиям. Код в примерах на Python, Java и Go.</p>
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
    print(f"Собрано статей: {len(meta)}")


if __name__ == "__main__":
    main()
