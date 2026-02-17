import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request, redirect, url_for, flash
from flask_login import current_user, login_required

from openweather_client import OpenWeatherError, pack_weather
from extensions import db, login_manager
from models import User, FavoriteCity
from security import generate_csrf_token, validate_csrf

BASE_DIR = Path(__file__).resolve().parent

BUILD_ID = os.getenv('BUILD_ID', '20260217-1315')

app = Flask(
    __name__,
    static_folder=str(BASE_DIR / "static"),
    template_folder=str(BASE_DIR / "templates"),
)

app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 0  # disable static caching (helps mobile/Telegram webview)

# --- Security / sessions ---
app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret-change-me")
app.config["SESSION_COOKIE_HTTPONLY"] = True
# On Railway you will likely have HTTPS; you can set SESSION_COOKIE_SECURE=1 if you want strict cookies
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

# --- Database ---
def _db_uri() -> str:
    url = (os.getenv("DATABASE_URL") or "").strip()
    if not url:
        # local dev fallback
        return f"sqlite:///{(BASE_DIR / 'local.db').as_posix()}"
    # Compatibility with providers that still use postgres://
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    return url

app.config["SQLALCHEMY_DATABASE_URI"] = _db_uri()
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping": True}

db.init_app(app)

# --- Auth ---
login_manager.init_app(app)

@login_manager.user_loader
def load_user(user_id: str):
    try:
        return User.query.get(int(user_id))
    except Exception:
        return None

@app.context_processor
def inject_build_id():
    return {'build_id': BUILD_ID}

# --- CSRF ---
@app.before_request
def _csrf_protect():
    validate_csrf()


@app.after_request
def _no_cache_html(resp):
    # Telegram/Safari webviews can aggressively cache; keep HTML always fresh
    try:
        if resp.mimetype == 'text/html':
            resp.headers['Cache-Control'] = 'no-store, max-age=0'
    except Exception:
        pass
    return resp

@app.context_processor
def inject_globals():
    return {"csrf_token": generate_csrf_token}

# Register blueprints
from auth import auth_bp  # noqa: E402

app.register_blueprint(auth_bp)

# Create tables on boot (with a few retries for managed DBs)
import time

with app.app_context():
    for _ in range(5):
        try:
            db.create_all()
            break
        except Exception as e:
            print("DB init failed, retrying...", e)
            time.sleep(1.5)


@app.get("/")
def index():
    user_prefs = current_user.to_prefs() if current_user.is_authenticated else None
    return render_template("index.html", user_prefs=user_prefs)


@app.get("/profile")
@login_required
def profile():
    return render_template("profile.html", user=current_user)


@app.post("/profile")
@login_required
def profile_post():
    action = (request.form.get("action") or "").strip()

    if action == "prefs":
        default_city = (request.form.get("default_city") or "").strip()
        units = (request.form.get("units") or "metric").strip()
        lang = (request.form.get("lang") or "ru").strip()

        if units not in ("metric", "imperial", "standard"):
            units = "metric"
        if not lang:
            lang = "ru"

        current_user.default_city = default_city or None
        current_user.units = units
        current_user.lang = lang
        db.session.commit()

        flash("Профиль обновлён.", "ok")
        return redirect(url_for("profile"))

    if action == "add_fav":
        city = (request.form.get("fav_city") or "").strip()
        if not city:
            flash("Введите город.", "error")
            return redirect(url_for("profile"))
        try:
            db.session.add(FavoriteCity(user_id=current_user.id, city=city))
            db.session.commit()
            flash("Город добавлен в избранное.", "ok")
        except Exception:
            db.session.rollback()
            flash("Не удалось добавить (возможно, уже есть в избранном).", "error")
        return redirect(url_for("profile"))

    if action == "del_fav":
        fav_id = request.form.get("fav_id")
        if fav_id:
            fav = FavoriteCity.query.filter_by(id=int(fav_id), user_id=current_user.id).first()
            if fav:
                db.session.delete(fav)
                db.session.commit()
                flash("Удалено из избранного.", "ok")
        return redirect(url_for("profile"))

    flash("Неизвестное действие.", "error")
    return redirect(url_for("profile"))


@app.get("/api/health")
def health():
    return jsonify({"ok": True, 'build_id': BUILD_ID})


@app.get("/api/me")
def api_me():
    if not current_user.is_authenticated:
        return jsonify({"authenticated": False})
    return jsonify({"authenticated": True, "user": {"username": current_user.username, "email": current_user.email}, "prefs": current_user.to_prefs()})


@app.get("/api/weather")
def api_weather():
    # Priority: explicit query params -> user preferences -> env defaults
    city = (request.args.get("city") or "").strip()
    units = (request.args.get("units") or "").strip()
    lang = (request.args.get("lang") or "").strip()

    if current_user.is_authenticated:
        if not city:
            city = (current_user.default_city or current_user.last_city or "").strip()
        if not units:
            units = (current_user.units or "").strip()
        if not lang:
            lang = (current_user.lang or "").strip()

    city = city or os.getenv("DEFAULT_CITY", "Moscow")
    units = units or os.getenv("OW_UNITS", "metric")
    lang = lang or os.getenv("OW_LANG", "ru")

    try:
        data = pack_weather(city=city, units=units, lang=lang)

        if current_user.is_authenticated:
            current_user.last_city = city
            db.session.commit()

        return jsonify(data)
    except OpenWeatherError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "Unexpected server error", "detail": str(e)}), 500


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=False)
