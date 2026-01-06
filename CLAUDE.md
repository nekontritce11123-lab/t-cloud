# T-Cloud - Telegram Mini App для хранения файлов

## ВАЖНО: Деплой ТОЛЬКО через Python paramiko!

**НИКОГДА не использовать `ssh root@...` напрямую** - пароль не работает через bash.
Всегда использовать Python скрипты с paramiko (см. секцию "Деплой" ниже).

## Серверы

### Production (основной)
- **URL:** https://tcloud.daniilsimple.ru
- **Host:** 217.60.3.122
- **User:** root
- **Pass:** ZiW_1qjEippLtS2xrV
- **Backend:** systemd service `t-cloud`
- **Frontend:** /var/www/tcloud/
- **DB:** /root/t-cloud/backend/data/tcloud.db (SQLite)

### Backup (factchain)
- **URL:** https://factchain-traker.online
- **Host:** 37.140.192.181
- **User:** u3372484
- **Pass:** j758aqXHELv2l2AM
- **Frontend:** /var/www/u3372484/data/www/factchain-traker.online/
- **Backend:** на основном сервере (217.60.3.122)

## Деплой

### Frontend на Factchain (основной)
```bash
# Сначала build, потом deploy одной командой:
cd "f:/Code/Хранилище - ПУПУПУ" && npm run build && /c/Users/Daniel\ Simples/AppData/Local/Programs/Python/Python313/python -c "
import paramiko
import os

HOST = '37.140.192.181'
USER = 'u3372484'
PASS = 'j758aqXHELv2l2AM'
LOCAL_DIST = 'f:/Code/Хранилище - ПУПУПУ/dist'
REMOTE_PATH = '/var/www/u3372484/data/www/factchain-traker.online'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, 22, USER, PASS, timeout=30)
sftp = ssh.open_sftp()

stdin, stdout, stderr = ssh.exec_command(f'rm -rf {REMOTE_PATH}/assets/* {REMOTE_PATH}/index.html')
stdout.read()

sftp.put(f'{LOCAL_DIST}/index.html', f'{REMOTE_PATH}/index.html')
local_assets = f'{LOCAL_DIST}/assets'
for f in os.listdir(local_assets):
    sftp.put(f'{local_assets}/{f}', f'{REMOTE_PATH}/assets/{f}')
    print(f'Uploaded: {f}')

sftp.close()
ssh.close()
print('Done!')
"
```

### Backend (на tcloud сервере)
```bash
# Локальный build + деплой через paramiko:
cd "f:/Code/Хранилище - ПУПУПУ" && npm run build:backend && /c/Users/Daniel\ Simples/AppData/Local/Programs/Python/Python313/python -c "
import paramiko
import sys
sys.stdout.reconfigure(encoding='utf-8')

HOST = '217.60.3.122'
USER = 'root'
PASS = 'ZiW_1qjEippLtS2xrV'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, 22, USER, PASS, timeout=30)

stdin, stdout, stderr = ssh.exec_command('cd /root/t-cloud && git pull && npm run build:backend && systemctl restart t-cloud && echo OK')
print(stdout.read().decode('utf-8', errors='replace'))
err = stderr.read().decode('utf-8', errors='replace')
if err:
    print('STDERR:', err)

ssh.close()
print('Backend deployed!')
"
```

## Архитектура

- **Frontend:** React + Vite + TypeScript
- **Backend:** Express + Grammy (Telegram Bot) + SQLite (better-sqlite3 + Drizzle)
- **API:** REST с авторизацией через Telegram initData

## Ключевые файлы

### Frontend
- `src/App.tsx` - главный компонент
- `src/hooks/useFiles.ts` - хук для работы с файлами
- `src/api/client.ts` - API клиент
- `src/components/` - компоненты UI

### Backend
- `backend/src/index.ts` - точка входа
- `backend/src/api/routes/files.routes.ts` - API роуты
- `backend/src/db/index.ts` - база данных + FTS поиск
- `backend/src/bot/index.ts` - Telegram бот

## Исправленные баги (не повторять!)

### 1. Timeline useRef баг
**Проблема:** Переменные `longPressTimer` и `isLongPress` создавались без useRef, теряли состояние при ре-рендере.
**Решение:** Использовать `useRef` и `useCallback`:
```tsx
const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
const isLongPress = useRef(false);
```

### 2. Черный экран при очистке поиска
**Проблема:** При клике на X в поиске сначала очищался searchQuery, потом загружались данные - на мгновение files был пустой.
**Решение:** В `clearSearch()` сначала загружаем данные, потом очищаем query.

### 3. Двойная отправка файлов
**Проблема:** При быстром двойном клике файл отправлялся дважды.
**Решение:** Добавлен `sendingFileId` state как блокировка.

### 4. Длинные caption обрезались
**Проблема:** Telegram лимит: 1024 для фото, 4096 для остальных.
**Решение:** Если caption > лимита - отправляется отдельным текстовым сообщением.

### 5. FTS поиск не находил по forward_from_chat_title
**Проблема:** В FTS таблице не было поля forward_from_chat_title.
**Решение:** Пересоздание FTS таблицы с 4 полями: file_name, caption, forward_from_name, forward_from_chat_title.

### 6. Фото в 90px качестве
**Проблема:** Telegram thumbnail для фото только 90px.
**Решение:** Для mediaType='photo' использовать mainFileId вместо thumbnailFileId.

### 7. Карточки разной высоты (не квадратные)
**Проблема:** Вертикальные фото растягивали карточки.
**Решение:** `aspect-ratio: 1` на .card, `position: absolute; inset: 0` на .preview.

## CSS переменные (не хардкодить!)

```css
--color-success: #34c759;        /* Зеленая галочка cooldown */
--overlay-dark: rgba(0, 0, 0, 0.7);
--overlay-darker: rgba(0, 0, 0, 0.8);
--color-icon-secondary: rgba(255, 255, 255, 0.5);
```

## Фичи

- **24-часовой cooldown** на отправку файла (сохраняется в localStorage)
- **Сброс cooldown:** двойной клик на заголовок "T-Cloud"
- **Мультивыбор:** long-press на файле/ссылке
- **Корзина:** soft delete с возможностью восстановления
- **FTS поиск:** по имени файла, caption, от кого переслано

## Адаптивная сетка

```css
/* Mobile (<480px): */ minmax(100px, 1fr)
/* Tablet (480-768px): */ minmax(120px, 1fr)
/* Desktop (768-1200px): */ minmax(150px, 1fr)
/* Large (1200px+): */ minmax(180px, 1fr), max-width: 1400px
```
