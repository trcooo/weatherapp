# Deploy to Railway (Web + PostgreSQL)

## 1) Prepare GitHub repo
- Unzip project
- Commit and push to GitHub:

```bash
git init
git add .
git commit -m "weather web"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

## 2) Create Railway project + deploy web service
Railway → New Project → Deploy from GitHub Repo → select your repo.

## 3) Add PostgreSQL
Railway → New → Database → PostgreSQL.

After the database is created, **link** it to your web service:
- Open your web service → Variables
- Add a reference to the Postgres `DATABASE_URL` (Railway provides it from the Postgres service)

> The app reads `DATABASE_URL`. If it is missing, it falls back to local SQLite (`local.db`) for dev.

## 4) Add environment variables (web service)
Required:
- `OPENWEATHER_API_KEY` — OpenWeather key
- `SECRET_KEY` — long random string for Flask sessions

Provided by Railway Postgres (via reference):
- `DATABASE_URL`

Optional:
- `DEFAULT_CITY` (e.g. Москва)
- `OW_UNITS` (metric|imperial|standard)
- `OW_LANG` (ru|en|...)
- `OW_TIMEOUT_S` (e.g. 12)
- `PYTHONUNBUFFERED=1`

## 5) Public domain
Open your web service → Settings / Networking → Generate Domain.

## Notes
- Tables are created automatically on boot (`db.create_all()`).
- For production-grade migrations you can add Alembic/Flask-Migrate later.
