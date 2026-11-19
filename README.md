# Наш вечер в Пскове — конструктор свиданий

Простой, мобильный сайт для приглашения на свидание с двумя переключаемыми романтичными темами (**Тёплая** и **Вечерняя**), автоматическим обновлением афиши Пскова через GitHub Actions и тихой отправкой выбора в Telegram.

## Структура проекта
- `index.html`, `styles.css`, `app.js`, `config.js` — статический сайт для GitHub Pages.
- `data/curated_places.json` — проверенные рестораны, кафе, кинотеатры, лазертаг, VR и квесты Пскова.
- `data/places.json` — итоговый файл с данными, который читает сайт.
- `scraper/parse_pskov.py` — Python-парсер городских событий и мастер-классов.
- `.github/workflows/update-data.yml` — ежедневное автообновление `data/places.json`.
- `cloudflare-worker/worker.js` — прокси для тихой отправки в Telegram без раскрытия токена бота.

## Быстрый запуск за 5 минут

### 1. Создайте Telegram-бота
1. Откройте `@BotFather` в Telegram, отправьте `/newbot` и скопируйте **BOT_TOKEN**.
2. Откройте созданного бота и нажмите **Start** (чтобы он мог писать вам).
3. Узнайте свой **CHAT_ID** (например, через `@userinfobot`).

### 2. Разверните бесплатный Cloudflare Worker (чтобы скрыть токен)
1. Зайдите на [workers.cloudflare.com](https://workers.cloudflare.com/) (бесплатно, карта не нужна) и нажмите **Create Worker**.
2. Вставьте код из файла `cloudflare-worker/worker.js` и нажмите **Deploy**.
3. В настройках Worker (**Settings → Variables and Secrets**) добавьте две переменные:
   - `BOT_TOKEN` — ваш токен от `@BotFather`
   - `CHAT_ID` — ваш Telegram ID
4. Скопируйте URL вашего Worker (вида `https://date-bot.yourname.workers.dev`) и вставьте его в `config.js` в поле `telegramWorkerUrl`.

### 3. Загрузите на GitHub Pages
1. Создайте репозиторий на GitHub и загрузите туда все файлы проекта.
2. Включите хостинг: **Settings → Pages → Source: Deploy from a branch → Branch: main / (root)**.
3. Разрешите парсеру обновлять данные: **Settings → Actions → General → Workflow permissions → Read and write permissions**.
4. Готово! Ссылка вида `https://ваш-логин.github.io/название-репозитория/` уже работает.
