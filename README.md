# Weather (Python / Flask)

Modern weather web app (white/blue UI) + OpenWeather API.

## Features
- Responsive layout (phone / tablet / desktop)
- Current weather + forecast
- Map (OpenStreetMap / Leaflet)
- Auth: register/login/logout
- Profile: default city, units, language, favorites
- PostgreSQL support (Railway) via `DATABASE_URL`

## Local run
1) Create venv, install deps:
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

2) Create `.env` from `.env.example` and set:
- `OPENWEATHER_API_KEY`
- `SECRET_KEY`
(Optional locally) `DATABASE_URL` for Postgres; otherwise SQLite `local.db` will be used.

3) Run:
```bash
python app.py
```
Open: http://localhost:8000

## Deploy
See `README_RAILWAY.md`.
