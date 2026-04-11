# Dream Journal

Монорепозиторий для приложения анализа снов:

- `backend` - Spring Boot 3, JPA, Flyway, PostgreSQL, Ollama integration
- `frontend` - React JS + Vite
- `docker-compose.yml` - PostgreSQL, Ollama, backend и frontend
- `docs/technical-spec.md` - зафиксированное ТЗ MVP

## Структура

```text
.
|-- backend
|-- frontend
|-- docs
|-- docker-compose.yml
```

## Что уже есть

- вход по логину без пароля для MVP;
- список снов пользователя;
- создание нового сна;
- чат по выбранному сну;
- удаление сна вместе с историей;
- интеграционный слой под Ollama с локальным fallback, если модель недоступна;
- стартовая адаптивная UI-оболочка.

## Быстрый старт через Docker Compose

```bash
docker compose up --build
```

После запуска:

- frontend: `http://localhost:3000`
- backend: `http://localhost:8080`
- ollama: `http://localhost:11434`
- postgres: `localhost:5432`

## Локальный запуск без Docker для frontend/backend

### Инфраструктура

```bash
docker compose up -d postgres ollama
```

### Backend

```bash
cd backend
mvn spring-boot:run
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Следующий шаг

Ближайшее развитие:

- нормальная аутентификация через Spring Security + JWT;
- улучшение промпта и структуры ответа Ollama;
- потоковая выдача ответа;
- тесты backend и frontend.

## Telegram bot

The repo now also contains a `telegram-bot` service and `docs/telegram-bot.md`.

Quick setup:

1. Create a real bot in Telegram through BotFather with `/newbot`.
2. Put the bot username and token into `.env`.
3. Set `APP_TELEGRAM_ENABLED=true`.
4. Run `docker compose up --build backend frontend telegram-bot`.
5. Open the web app, generate a Telegram link code, and open the bot from the sidebar card.

Important: the code for the bot is already added to this repository, but the real Telegram bot account itself must still be created manually in BotFather, because that step requires your Telegram account.