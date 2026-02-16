(() => {
  const $ = (id) => document.getElementById(id);

  const els = {
    form: $("searchForm"),
    input: $("cityInput"),
    place: $("place"),
    desc: $("desc"),
    iconWrap: $("iconWrap"),
    temp: $("temp"),
    feels: $("feels"),
    updated: $("updated"),
    humidity: $("humidity"),
    wind: $("wind"),
    pressure: $("pressure"),
    clouds: $("clouds"),
    sunrise: $("sunrise"),
    sunset: $("sunset"),
    unitsChip: $("unitsChip"),
    forecast: $("forecast"),
    forecastEmpty: $("forecastEmpty"),
    error: $("error"),
    year: $("year"),
    mapLink: $("mapLink"),
    mapMeta: $("mapMeta"),
  };


  // Map (Leaflet / OpenStreetMap)
  let map = null;
  let marker = null;
  let tiles = null;

  const ensureMap = () => {
    if (map) return;
    const el = document.getElementById("map");
    if (!el) return;
    if (!window.L) return;

    map = L.map(el, { zoomControl: true });
    tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    });
    tiles.addTo(map);

    // world view until we load a city
    map.setView([20, 0], 2);
  };

  const fmtUTC = (unix) => {
    if (!unix) return "—";
    const d = new Date(unix * 1000);
    return new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }).format(d) + " UTC";
  };

  const fmtLocalShort = (unix) => {
    if (!unix) return "—";
    const d = new Date(unix * 1000);
    return new Intl.DateTimeFormat("ru-RU", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }).format(d) + " UTC";
  };

  const unitSymbols = (units) => {
    if (units === "imperial") return { t: "°F", wind: "mph" };
    if (units === "standard") return { t: "K", wind: "м/с" };
    return { t: "°C", wind: "м/с" };
  };

  const setError = (msg) => {
    if (!msg) {
      els.error.hidden = true;
      els.error.textContent = "";
      return;
    }
    els.error.hidden = false;
    els.error.textContent = msg;
  };

  const setLoading = (loading) => {
    const btn = els.form.querySelector("button[type=submit]");
    btn.disabled = loading;
    btn.textContent = loading ? "Загрузка…" : "Показать";
  };

  const iconUrl = (code) => {
    if (!code) return "";
    return `https://openweathermap.org/img/wn/${code}@2x.png`;
  };

  const render = (data) => {
    const loc = data.location || {};
    const cur = data.current || {};
    const sym = unitSymbols(data.units);

    els.place.textContent = loc.country ? `${loc.name}, ${loc.country}` : (loc.name || "—");
    els.desc.textContent = cur.desc || "—";

    els.iconWrap.innerHTML = cur.icon
      ? `<img alt="" src="${iconUrl(cur.icon)}" />`
      : "";


    // Map update
    const lat = Number(loc.lat);
    const lon = Number(loc.lon);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      ensureMap();
      if (map) {
        const label = loc.country ? `${loc.name}, ${loc.country}` : (loc.name || "");
        if (!marker) {
          marker = L.marker([lat, lon], { title: label }).addTo(map);
        } else {
          marker.setLatLng([lat, lon]);
        }
        map.setView([lat, lon], 9, { animate: true });
      }
      if (els.mapMeta) els.mapMeta.textContent = `Координаты: ${lat.toFixed(4)}, ${lon.toFixed(4)}`;
      if (els.mapLink) els.mapLink.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=10/${lat}/${lon}`;
    }

    els.temp.textContent = cur.temp == null ? "—" : `${Math.round(cur.temp)}${sym.t}`;
    els.feels.textContent = cur.feels_like == null ? "—" : `Ощущается как ${Math.round(cur.feels_like)}${sym.t}`;

    els.humidity.textContent = cur.humidity == null ? "—" : `${cur.humidity}%`;
    els.wind.textContent = cur.wind_speed == null ? "—" : `${cur.wind_speed} ${sym.wind}`;
    els.pressure.textContent = cur.pressure == null ? "—" : `${cur.pressure} hPa`;
    els.clouds.textContent = cur.clouds == null ? "—" : `${cur.clouds}%`;

    els.sunrise.textContent = fmtUTC(cur.sunrise);
    els.sunset.textContent = fmtUTC(cur.sunset);

    const gen = data.generated_at ? new Date(data.generated_at * 1000) : new Date();
    els.updated.textContent = `Обновлено: ${new Intl.DateTimeFormat("ru-RU", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      hour12: false,
    }).format(gen)} UTC`;

    els.unitsChip.textContent = data.units === "metric" ? "Metric (°C)" : (data.units === "imperial" ? "Imperial (°F)" : "Standard (K)");

    // Forecast
    els.forecast.innerHTML = "";
    const items = Array.isArray(data.forecast) ? data.forecast : [];
    if (!items.length) {
      els.forecast.appendChild(els.forecastEmpty);
      els.forecastEmpty.hidden = false;
      return;
    }
    els.forecastEmpty.hidden = true;

    const frag = document.createDocumentFragment();
    for (const it of items) {
      const div = document.createElement("div");
      div.className = "fitem";
      const t = it.dt ? fmtLocalShort(it.dt) : (it.dt_txt || "—");
      const temp = it.temp == null ? "—" : `${Math.round(it.temp)}${sym.t}`;
      const pop = (typeof it.pop === "number") ? `${Math.round(it.pop * 100)}%` : null;
      const wind = it.wind_speed == null ? null : `${it.wind_speed} ${sym.wind}`;

      div.innerHTML = `
        <div class="fitem__top">
          <div class="fitem__time">${t}</div>
          <div class="fitem__icon">${it.icon ? `<img alt="" src="${iconUrl(it.icon)}" />` : ""}</div>
        </div>
        <div class="fitem__temp">${temp}</div>
        <div class="fitem__desc">${it.desc || ""}</div>
        <div class="fitem__meta">
          ${wind ? `<span>💨 ${wind}</span>` : ""}
          ${pop ? `<span>☔ ${pop}</span>` : ""}
        </div>
      `;
      frag.appendChild(div);
    }
    els.forecast.appendChild(frag);
  };

  async function loadConfig() {
    try {
      const r = await fetch("/static/config.json", { cache: "no-store" });
      if (!r.ok) return null;
      return await r.json();
    } catch {
      return null;
    }
  }

  async function fetchWeather(city, opts = {}) {
    setError(null);
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (city) params.set("city", city);
      if (opts.units) params.set("units", opts.units);
      if (opts.lang) params.set("lang", opts.lang);

      const r = await fetch(`/api/weather?${params.toString()}`);
      const data = await r.json();
      if (!r.ok) {
        throw new Error(data?.error || "Не удалось получить погоду");
      }
      render(data);
    } catch (e) {
      setError(e?.message || "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function bindPills() {
    document.querySelectorAll(".pill[data-city]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const c = btn.getAttribute("data-city") || "";
        els.input.value = c;
        fetchWeather(c);
      });
    });
  }

  async function init() {
    els.year.textContent = String(new Date().getFullYear());
    bindPills();

    const cfg = await loadConfig();
    const defaultCity = cfg?.default_city || "Москва";

    els.form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      const city = (els.input.value || "").trim();
      fetchWeather(city || defaultCity);
    });

    // initial load
    fetchWeather(defaultCity);
  }

  init();
})();
