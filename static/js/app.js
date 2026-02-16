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
    adviceBadge: $("adviceBadge"),
    adviceList: $("adviceList"),
    adviceChips: $("adviceChips"),
    tipsAdvice: $("tipsAdvice"),
  };


  // Prevent Telegram/iOS webview from scrolling the whole page when the user scrolls inside forecast block
  const trapInnerScroll = (el) => {
    if (!el) return;
    let startY = 0;
    el.addEventListener("touchstart", (e) => {
      if (!e.touches || !e.touches[0]) return;
      startY = e.touches[0].clientY;
    }, { passive: true });

    el.addEventListener("touchmove", (e) => {
      if (!e.touches || !e.touches[0]) return;
      // only if the element is scrollable
      if (el.scrollHeight <= el.clientHeight) return;

      const y = e.touches[0].clientY;
      const dy = y - startY;
      const atTop = el.scrollTop <= 0;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;

      // Stop the body from taking over when user hits the bounds
      if ((atTop && dy > 0) || (atBottom && dy < 0)) {
        e.preventDefault();
      }
    }, { passive: false });
  };

  trapInnerScroll(els.forecast);




  const serverPrefs = (window.__USER_PREFS__ || null);
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

    // keep Leaflet rendering correct on resize / orientation changes
    const invalidate = () => {
      if (!map) return;
      try { map.invalidateSize(); } catch {}
    };
    window.addEventListener("resize", () => invalidate());
    window.addEventListener("orientationchange", () => setTimeout(() => invalidate(), 200));
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
    if (!els.form) return;
    const btn = els.form.querySelector("button[type=submit]");
    if (!btn) return;
    btn.disabled = loading;
    btn.textContent = loading ? "Загрузка…" : "Показать";
  };

  const iconUrl = (code) => {
    if (!code) return "";
    return `https://openweathermap.org/img/wn/${code}@2x.png`;
  };

  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));

  const computeAdvice = (cur, forecast, units) => {
    const sym = unitSymbols(units);
    const t = Number(cur?.feels_like ?? cur?.temp);
    const wind = Number(cur?.wind_speed);
    const desc = String(cur?.desc || "").toLowerCase();

    const next = Array.isArray(forecast) ? forecast.slice(0, 4) : []; // ~12h
    let maxPop = 0;
    let nextDesc = "";
    for (const it of next) {
      if (typeof it?.pop === "number") maxPop = Math.max(maxPop, it.pop);
      if (!nextDesc && it?.desc) nextDesc = String(it.desc).toLowerCase();
    }
    const wetDesc = (desc + " " + nextDesc);
    const isRain = wetDesc.includes("дожд") || wetDesc.includes("лив");
    const isSnow = wetDesc.includes("снег") || wetDesc.includes("метел") || wetDesc.includes("снеж");
    const precipLikely = maxPop >= 0.4;

    const items = [];
    const chips = [];

    // Clothing
    if (Number.isFinite(t)) {
      if (t <= -15) {
        items.push({ icon: "🧥", title: "Очень холодно", desc: `Пуховик, шапка, шарф, перчатки. Лучше закрытая обувь.` });
        chips.push("Пуховик", "Шапка", "Перчатки");
      } else if (t <= -5) {
        items.push({ icon: "🧣", title: "Холодно", desc: `Тёплая куртка, шапка и перчатки будут кстати.` });
        chips.push("Тёплая куртка", "Шапка");
      } else if (t <= 5) {
        items.push({ icon: "🧤", title: "Прохладно", desc: `Куртка/пальто и закрытая обувь. Можно лёгкие перчатки.` });
        chips.push("Куртка", "Закрытая обувь");
      } else if (t <= 15) {
        items.push({ icon: "🧢", title: "Комфортно", desc: `Лёгкая куртка/ветровка или толстовка.` });
        chips.push("Ветровка");
      } else if (t <= 25) {
        items.push({ icon: "👕", title: "Тепло", desc: `Лёгкая одежда. На вечер можно взять тонкую кофту.` });
        chips.push("Лёгкая одежда");
      } else {
        items.push({ icon: "🕶️", title: "Жарко", desc: `Лёгкая одежда, вода и головной убор.` });
        chips.push("Вода", "Кепка");
      }
    }

    // Wind
    if (Number.isFinite(wind)) {
      const windy = (units === "imperial") ? wind >= 20 : wind >= 8;
      if (windy) {
        items.push({ icon: "💨", title: "Ветрено", desc: `Ветер ${wind} ${sym.wind}. Лучше капюшон/ветровка.` });
        chips.push("Капюшон");
      }
    }

    // Precipitation
    if (precipLikely) {
      const kind = isSnow ? "снег" : (isRain ? "дождь" : "осадки");
      items.push({ icon: "☔", title: "Возможны осадки", desc: `Вероятность до ${Math.round(maxPop * 100)}%. Возьмите зонт (${kind}).` });
      chips.push("Зонт");
    }

    // Slippery / caution
    if (Number.isFinite(t) && t >= -1 && t <= 2 && (precipLikely || isRain || isSnow)) {
      items.push({ icon: "🧊", title: "Осторожно", desc: "Температура около нуля — возможна гололедица. Выбирайте обувь с хорошей подошвой." });
      chips.push("Обувь с протектором");
    }

    // Badge
    let badge = "—";
    if (Number.isFinite(t)) badge = `${Math.round(t)}${sym.t}`;

    return { badge, items: items.slice(0, 4), chips: Array.from(new Set(chips)).slice(0, 6) };
  };

  const renderAdvice = (data) => {
    if (!els.adviceList) return;
    const cur = data.current || {};
    const advice = computeAdvice(cur, data.forecast || [], data.units);
    if (els.adviceBadge) els.adviceBadge.textContent = advice.badge;

    // Main recommendations card
    if (!advice.items.length) {
      els.adviceList.innerHTML = `<div class="forecast__empty">Нет данных для рекомендаций</div>`;
    } else {
      els.adviceList.innerHTML = advice.items.map((x) => (
        `<div class="advice__item">
          <div class="advice__icon">${x.icon}</div>
          <div class="advice__text">
            <p class="advice__title">${x.title}</p>
            <p class="advice__desc">${x.desc}</p>
          </div>
        </div>`
      )).join("");
    }

    if (els.adviceChips) {
      if (!advice.chips.length) {
        els.adviceChips.hidden = true;
        els.adviceChips.innerHTML = "";
      } else {
        els.adviceChips.hidden = false;
        els.adviceChips.innerHTML = advice.chips.map((c) => `<span class="advice-chip">${c}</span>`).join("");
      }
    }

    // Inline recommendations inside Quick Tips
    if (els.tipsAdvice) {
      if (!advice.items.length) {
        els.tipsAdvice.innerHTML = "";
      } else {
        els.tipsAdvice.innerHTML = `<div class="kicker">Рекомендации</div>` + advice.items.slice(0, 2).map((x) => (
          `<div class="advice__item">
            <div class="advice__icon">${x.icon}</div>
            <div class="advice__text">
              <p class="advice__title">${x.title}</p>
              <p class="advice__desc">${x.desc}</p>
            </div>
          </div>`
        )).join("");
      }
    }
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
      renderAdvice(data);
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

    // Recommendations (fills the empty space under forecast on desktop)
    renderAdvice(data);
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
      const finalUnits = (opts.units || (serverPrefs && serverPrefs.units) || "");
      const finalLang = (opts.lang || (serverPrefs && serverPrefs.lang) || "");
      if (city) params.set("city", city);
      if (finalUnits) params.set("units", finalUnits);
      if (finalLang) params.set("lang", finalLang);

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
        if (els.input) els.input.value = c;
        fetchWeather(c);
      });
    });
  }

  async function init() {
    if (els.year) els.year.textContent = String(new Date().getFullYear());
    bindPills();

    const cfg = await loadConfig();
    const defaultCity = (serverPrefs && serverPrefs.default_city) || cfg?.default_city || "Москва";

    if (els.form) {
      els.form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const city = ((els.input && els.input.value) || "").trim();
        fetchWeather(city || defaultCity);
      });
    }

    // initial load
    if (els.input && !els.input.value) els.input.value = defaultCity;
    fetchWeather(defaultCity);
  }

  init();
})();
