import os
from pathlib import Path

from flask import Flask, jsonify, render_template, request

from openweather_client import OpenWeatherError, pack_weather

BASE_DIR = Path(__file__).resolve().parent

app = Flask(
    __name__,
    static_folder=str(BASE_DIR / "static"),
    template_folder=str(BASE_DIR / "templates"),
)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    return jsonify({"ok": True})


@app.get("/api/weather")
def api_weather():
    city = request.args.get("city") or os.getenv("DEFAULT_CITY", "Moscow")
    units = request.args.get("units") or os.getenv("OW_UNITS", "metric")
    lang = request.args.get("lang") or os.getenv("OW_LANG", "ru")

    try:
        data = pack_weather(city=city, units=units, lang=lang)
        return jsonify(data)
    except OpenWeatherError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        return jsonify({"error": "Unexpected server error", "detail": str(e)}), 500


if __name__ == "__main__":
    # Railway provides PORT
    port = int(os.getenv("PORT", "8000"))
    app.run(host="0.0.0.0", port=port, debug=False)
