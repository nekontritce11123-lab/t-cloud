# T-Cloud: Zero Effort Storage

Telegram Mini App для автоматического хранения и сортировки файлов.

## Функции

- **Авто-сортировка** — бот определяет тип файла и сортирует по категориям
- **Лента времени** — просмотр файлов по датам
- **Полнотекстовый поиск** — поиск по имени, подписи, отправителю
- **Галерея ссылок** — сохранение ссылок с OpenGraph превью

## Структура проекта

```
├── backend/          # Node.js бэкенд
│   ├── src/
│   │   ├── bot/      # Grammy Telegram бот
│   │   ├── api/      # Express REST API
│   │   ├── db/       # SQLite + Drizzle ORM
│   │   └── services/ # Бизнес-логика
│   └── data/         # SQLite база данных
├── src/              # React Mini App
│   ├── components/   # UI компоненты
│   ├── hooks/        # React хуки
│   └── api/          # API клиент
└── package.json
```

## Быстрый старт

### 1. Создайте бота

1. Откройте [@BotFather](https://t.me/BotFather) в Telegram
2. Отправьте `/newbot` и следуйте инструкциям
3. Скопируйте токен бота

### 2. Настройте проект

```bash
# Установка зависимостей
npm run install:all

# Создайте .env файл
cp backend/.env.example backend/.env

# Добавьте токен бота в backend/.env
```

### 3. Запуск

```bash
# Разработка (фронт + бэк одновременно)
npm run dev:all

# Или по отдельности:
npm run dev          # Только фронтенд (http://localhost:5173)
npm run dev:backend  # Только бэкенд (http://localhost:3000)
```

### 4. Настройте Mini App

1. В BotFather: `/mybots` → Выберите бота → `Bot Settings` → `Menu Button`
2. Укажите URL вашего Mini App (для разработки используйте ngrok)

## API Endpoints

| Метод | Endpoint | Описание |
|-------|----------|----------|
| GET | `/api/files` | Список файлов |
| GET | `/api/files/by-date` | Файлы по датам |
| GET | `/api/files/search?q=` | Поиск |
| GET | `/api/files/stats` | Статистика |
| GET | `/api/links` | Список ссылок |
| DELETE | `/api/files/:id` | Удалить файл |

## Технологии

- **Bot**: Grammy (Telegram Bot API)
- **API**: Express
- **Database**: SQLite + Drizzle ORM + FTS5
- **Frontend**: React + Vite + TypeScript
