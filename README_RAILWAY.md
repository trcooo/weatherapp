# Деплой в Railway (через GitHub)

## 1) Подготовка репозитория

1. Создайте репозиторий на GitHub.
2. Загрузите туда содержимое этого проекта.

Команды:

```bash
git init
git add .
git commit -m "Weather app (python)"

git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2) Web‑сервис (сайт)

Railway → **New Project** → **Deploy from GitHub Repo** → выберите репозиторий.

Railway автоматически подхватит `railway.toml`:
- build: `pip install -r requirements.txt`
- start: `gunicorn app:app ...`
- healthcheck: `/api/health`

### ENV переменные (web)

В Railway → Variables добавьте:
- `OPENWEATHER_API_KEY` (обязательно)

Опционально:
- `DEFAULT_CITY` (например, `Москва`)
- `OW_UNITS` (`metric` / `imperial` / `standard`)
- `OW_LANG` (например, `ru`)
- `PYTHONUNBUFFERED=1`


Готово — сайт будет доступен по Railway domain.
