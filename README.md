# Сайт-визитка Татьяны Коровкиной — korovkina.uk

Статический сайт: главная `index.html`, английская версия `en/`, страницы «Выступления» (`talks/`) и «Статьи» (`articles/`), общие `styles.css` и `site.js`, шрифты в `fonts/`, файл `CNAME` с доменом.
Собирать нужно только статьи (см. ниже), остальное — готовые HTML-файлы. `404.html` — страница «Рыба уплыла» для несуществующих адресов (в ней пути абсолютные, от корня сайта).
Шрифты лежат локально, поэтому сайт не обращается к Google Fonts. Своих cookies и аналитики у сайта нет.
Тема (светлая или тёмная) по умолчанию берётся из настроек системы; переключатель в шапке запоминает выбор в localStorage браузера посетителя (ключ `theme`). Переключатель есть и в шаблоне статей `tools/build_articles.py`.

## Как добавить эфир

Откройте `talks/index.html`, скопируйте блок `<li class="talk">…</li>` и поменяйте в нём:
ID видео в `data-yt` (часть ссылки после `watch?v=`), дату эфира (в `<time>` и в aria-label), ссылку на YouTube, заголовок и описание.
Новые эфиры ставьте первыми в списке.
Видео грузится с YouTube (через youtube-nocookie.com) только после нажатия на обложку: пока посетитель не нажал, к YouTube запросов нет.

## Как добавить или обновить статью

Статьи лежат в `content/articles/` в формате Markdown, а страницы в `articles/` собираются из них:

1. Положите `.md` в `content/articles/` (картинки `.png` туда же, в тексте ссылайтесь на них как `../images/имя.png`).
2. Допишите статью в `content/articles/articles.toml`: slug (адрес), файл, заголовок, описание.
3. Из корня сайта: `python3 -m pip install markdown` (один раз), затем `python3 tools/build_articles.py`.
4. Загрузите изменения на GitHub.

Править HTML в `articles/` вручную не нужно: при следующей сборке он перезапишется.

## Закрытые материалы курса (/course)

Страница `korovkina.uk/course/` открывается только по ссылке с ключом: `https://korovkina.uk/course/#КЛЮЧ`.
На GitHub лежит только зашифрованный текст: без ключа его не прочитать, даже открыв файлы в репозитории.
Ключ (часть после `#`) браузер не отправляет на сервер. После первого открытия ключ запоминается в браузере студента и убирается из адресной строки, дальше материалы открываются обычными ссылками.

- Исходники курса — в папке `course-src/`: `course.toml` (порядок, названия, описания) и файлы `.md` (тот же формат, что у статей: вкладки с кодом, заметки).
- **Папка `course-src/` на GitHub не попадает** (она в `.gitignore`). Храните её копию сами: если она пропадёт, исходники курса и ключ не восстановить.
- Ключ лежит в `course-src/.key`.

Собрать и обновить:

1. `python3 -m pip install markdown cryptography` (один раз).
2. Из корня сайта: `python3 tools/build_course.py`. Скрипт пересоберёт папку `course/` и напечатает ссылку для студентов.
3. Загрузите изменения на GitHub.

Если ссылка утекла: `python3 tools/build_course.py --new-key`. Старая ссылка перестанет работать, новую разошлите студентам.
На страницы курса нет ссылок с сайта, и поисковикам запрещено их индексировать.

## Картинка для превью ссылок

Twitter, Telegram и другие сервисы показывают в превью `og.png` (русские страницы) и `og-en.png` (английская), 1200×630.
Шаблон обложки — `tools/og-card.html`. Чтобы пересобрать картинки после правок, из корня сайта:

```sh
C="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$C" --headless=new --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=3000 --screenshot=og.png "file://$PWD/tools/og-card.html"
"$C" --headless=new --hide-scrollbars --allow-file-access-from-files --force-device-scale-factor=1 --window-size=1200,630 --virtual-time-budget=3000 --screenshot=og-en.png "file://$PWD/tools/og-card.html#en"
```

Фото на обложке берётся из `images/tatiana.jpg`; без флага `--allow-file-access-from-files` Chrome его не подгрузит.

## Как посмотреть локально

Откройте `index.html` в браузере двойным щелчком.

## Публикация: GitHub Pages + домен в Cloudflare

### 1. GitHub

1. Включите двухфакторную аутентификацию в аккаунте GitHub.
2. Создайте публичный репозиторий, например `korovkina-site`, и загрузите туда содержимое этой папки, включая файл `CNAME`.
3. Settings → Pages → Source: «Deploy from a branch», ветка `main`, папка `/ (root)`.
4. В поле Custom domain должно стоять `korovkina.uk`: GitHub подставит его из файла `CNAME`, если нет, впишите вручную.

### 2. Cloudflare: DNS-записи

dash.cloudflare.com → домен `korovkina.uk` → DNS → Records.

Сначала удалите записи `A`, `AAAA` и `CNAME` для `korovkina.uk` и `www`, если они уже есть (например, заглушка после покупки).

Затем добавьте пять записей. У каждой переключите Proxy status на серое облачко, «DNS only»:

| Type | Name | Значение |
|---|---|---|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |
| CNAME | `www` | `ВАШ-ЛОГИН.github.io` |

Адреса для записей `A` — официальные адреса GitHub Pages. Перед настройкой сверьте их с документацией GitHub: «Managing a custom domain for your GitHub Pages site».

«DNS only» нужен по двум причинам: GitHub сам выпускает HTTPS-сертификат, а посетители ходят напрямую на GitHub, минуя сеть Cloudflare (из России она открывается с перебоями).

### 3. Защита домена

GitHub → Settings аккаунта → Pages → Verified domains → Add a domain → `korovkina.uk`. GitHub покажет TXT-запись: добавьте её в Cloudflare (тоже DNS → Records). Это не даст никому чужому привязать ваш домен к своему сайту.

### 4. HTTPS

Подождите от нескольких часов до суток, пока DNS обновится. Затем в Settings → Pages включите «Enforce HTTPS».
Проверьте, что открываются оба адреса: https://korovkina.uk и https://www.korovkina.uk.

### 5. Аккаунт Cloudflare

Включите двухфакторную аутентификацию и проверьте срок действия карты для автопродления домена.
