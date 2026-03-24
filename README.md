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
