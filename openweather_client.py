import os
import time
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import requests


@dataclass
class OpenWeatherConfig:
    api_key: str
    units: str = "metric"  # metric | imperial | standard
    lang: str = "ru"
    timeout_s: int = 12


class OpenWeatherError(RuntimeError):
    pass


def _cfg_from_env() -> OpenWeatherConfig:
    api_key = os.getenv("OPENWEATHER_API_KEY", "").strip()
    if not api_key:
        raise OpenWeatherError("OPENWEATHER_API_KEY is not set")
    units = os.getenv("OW_UNITS", "metric").strip() or "metric"
    lang = os.getenv("OW_LANG", "ru").strip() or "ru"
    timeout_s = int(os.getenv("OW_TIMEOUT_S", "12") or "12")
    return OpenWeatherConfig(api_key=api_key, units=units, lang=lang, timeout_s=timeout_s)


def _get_json(url: str, params: Dict[str, Any], timeout_s: int) -> Any:
    r = requests.get(url, params=params, timeout=timeout_s)
    if r.status_code >= 400:
        # OpenWeather often returns useful message in JSON
        try:
            detail = r.json()
        except Exception:
            detail = r.text
        raise OpenWeatherError(f"OpenWeather error {r.status_code}: {detail}")
    return r.json()


def geocode_city(city: str, cfg: Optional[OpenWeatherConfig] = None) -> Tuple[float, float, str, str]:
    cfg = cfg or _cfg_from_env()
    q = (city or "").strip()
    if not q:
        raise OpenWeatherError("City is empty")

    geo_url = "https://api.openweathermap.org/geo/1.0/direct"
    data = _get_json(
        geo_url,
        {"q": q, "limit": 1, "appid": cfg.api_key},
        cfg.timeout_s,
    )
    if not data:
        raise OpenWeatherError("City not found")
    item = data[0]
    lat = float(item["lat"])
    lon = float(item["lon"])
    name = item.get("name") or q
    country = item.get("country") or ""
    return lat, lon, name, country


def get_current_weather(lat: float, lon: float, cfg: Optional[OpenWeatherConfig] = None) -> Dict[str, Any]:
    cfg = cfg or _cfg_from_env()
    url = "https://api.openweathermap.org/data/2.5/weather"
    return _get_json(
        url,
        {
            "lat": lat,
            "lon": lon,
            "appid": cfg.api_key,
            "units": cfg.units,
            "lang": cfg.lang,
        },
        cfg.timeout_s,
    )


def get_forecast_5d(lat: float, lon: float, cfg: Optional[OpenWeatherConfig] = None) -> Dict[str, Any]:
    cfg = cfg or _cfg_from_env()
    url = "https://api.openweathermap.org/data/2.5/forecast"
    return _get_json(
        url,
        {
            "lat": lat,
            "lon": lon,
            "appid": cfg.api_key,
            "units": cfg.units,
            "lang": cfg.lang,
        },
        cfg.timeout_s,
    )


def pack_weather(city: str, units: Optional[str] = None, lang: Optional[str] = None) -> Dict[str, Any]:
    """Convenience function used by both web and bot.

    Returns a normalized payload:
    {
      location: {name, country, lat, lon},
      units, lang,
      current: {...},
      forecast: [ {dt, temp, feels_like, icon, desc, wind, humidity, pop?}, ...]
    }
    """
    cfg = _cfg_from_env()
    if units:
        cfg.units = units
    if lang:
        cfg.lang = lang

    lat, lon, name, country = geocode_city(city, cfg)
    current = get_current_weather(lat, lon, cfg)
    forecast_raw = get_forecast_5d(lat, lon, cfg)

    items: List[Dict[str, Any]] = []
    for it in (forecast_raw.get("list") or [])[:16]:  # next ~48h (3h steps)
        main = it.get("main") or {}
        w0 = (it.get("weather") or [{}])[0] or {}
        wind = it.get("wind") or {}
        items.append(
            {
                "dt": it.get("dt"),
                "dt_txt": it.get("dt_txt"),
                "temp": main.get("temp"),
                "feels_like": main.get("feels_like"),
                "humidity": main.get("humidity"),
                "wind_speed": wind.get("speed"),
                "wind_deg": wind.get("deg"),
                "icon": w0.get("icon"),
                "desc": w0.get("description"),
                "pop": it.get("pop"),
            }
        )

    wcur = (current.get("weather") or [{}])[0] or {}
    sys = current.get("sys") or {}
    main = current.get("main") or {}
    wind = current.get("wind") or {}

    payload = {
        "location": {"name": name, "country": country, "lat": lat, "lon": lon},
        "units": cfg.units,
        "lang": cfg.lang,
        "generated_at": int(time.time()),
        "current": {
            "temp": main.get("temp"),
            "feels_like": main.get("feels_like"),
            "temp_min": main.get("temp_min"),
            "temp_max": main.get("temp_max"),
            "humidity": main.get("humidity"),
            "pressure": main.get("pressure"),
            "wind_speed": wind.get("speed"),
            "wind_deg": wind.get("deg"),
            "clouds": (current.get("clouds") or {}).get("all"),
            "visibility": current.get("visibility"),
            "sunrise": sys.get("sunrise"),
            "sunset": sys.get("sunset"),
            "icon": wcur.get("icon"),
            "desc": wcur.get("description"),
        },
        "forecast": items,
    }
    return payload
