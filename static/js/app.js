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
    forecastInsights: $("forecastInsights"),
    tipsInsights: $("tipsInsights"),
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

  // --- iOS-like states + animated SVG icons ---
  const wxFromIcon = (icon, desc = "") => {
    const c = String(icon || "");
    const base = c.slice(0, 2);
    const night = c.endsWith("n");
    let cond = "clear";
    if (base === "01") cond = "clear";
    else if (base === "02") cond = "partly";
    else if (base === "03" || base === "04") cond = "cloudy";
    else if (base === "09" || base === "10") cond = "rain";
    else if (base === "11") cond = "thunder";
    else if (base === "13") cond = "snow";
    else if (base === "50") cond = "mist";

    // Extra hint from text (some locales can map oddly)
    const d = String(desc || "").toLowerCase();
    if (d.includes("гроза")) cond = "thunder";
    else if (d.includes("снег") || d.includes("метел")) cond = "snow";
    else if (d.includes("дожд") || d.includes("лив")) cond = "rain";
    else if (d.includes("туман") || d.includes("дым") || d.includes("мгла")) cond = "mist";

    return { cond, night };
  };

  const applyWxTheme = (wx) => {
    const body = document.body;
    if (!body) return;
    const all = [
      "wx-clear-day", "wx-clear-night",
      "wx-partly-day", "wx-partly-night",
      "wx-cloudy", "wx-rain", "wx-snow", "wx-thunder", "wx-mist",
    ];
    all.forEach((c) => body.classList.remove(c));

    const cls = (wx.cond === "clear" || wx.cond === "partly")
      ? `wx-${wx.cond}-${wx.night ? "night" : "day"}`
      : `wx-${wx.cond}`;

    body.classList.add(cls);

    // Update browser address-bar tint (nice in iOS/Android)
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      const map = {
        "wx-clear-day": "#3BA7FF",
        "wx-clear-night": "#2C8CFF",
        "wx-partly-day": "#3BA7FF",
        "wx-partly-night": "#2C8CFF",
        "wx-cloudy": "#449BFF",
        "wx-rain": "#2F87FF",
        "wx-snow": "#5AB8FF",
        "wx-thunder": "#2F7FFF",
        "wx-mist": "#5AB8FF",
      };
      meta.setAttribute("content", map[cls] || "#3BA7FF");
    }
  };

  const iosIconSVG = (icon, opts = {}) => {
    const size = Number(opts.size || 64);
    const animated = opts.animated !== false;
    const small = size <= 34;
    const wx = wxFromIcon(icon);
    const cls = [
      "ios-icon",
      small ? "ios-icon--small" : "",
      animated ? "" : "ios-icon--static",
      opts.className || "",
    ].filter(Boolean).join(" ");

    const svgOpen = `<svg class="${cls}" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">`;
    const svgClose = `</svg>`;

    const sun = `
      <g>
        <g class="ios-sun__rays" stroke="var(--sun2)" stroke-width="2.6" stroke-linecap="round">
          <line x1="32" y1="6" x2="32" y2="14" />
          <line x1="32" y1="50" x2="32" y2="58" />
          <line x1="6" y1="32" x2="14" y2="32" />
          <line x1="50" y1="32" x2="58" y2="32" />
          <line x1="12.5" y1="12.5" x2="18" y2="18" />
          <line x1="46" y1="46" x2="51.5" y2="51.5" />
          <line x1="12.5" y1="51.5" x2="18" y2="46" />
          <line x1="46" y1="18" x2="51.5" y2="12.5" />
        </g>
        <circle cx="32" cy="32" r="11" fill="var(--sun)" />
      </g>
    `;

    const moon = `
      <g>
        <path d="M42 14c-7 2-12 8-12 16 0 9 7 16 16 16 4 0 7-1 10-3-3 6-9 10-16 10-10 0-18-8-18-18 0-9 6-17 14-21 2-1 4-1 6 0z" fill="var(--moon)" opacity=".95"/>
        <circle class="ios-star" cx="18" cy="20" r="1.4" fill="rgba(255,255,255,.95)"/>
        <circle class="ios-star" cx="24" cy="14" r="1.0" fill="rgba(255,255,255,.9)"/>
        <circle class="ios-star" cx="16" cy="30" r="1.1" fill="rgba(255,255,255,.85)"/>
      </g>
    `;

    const cloud = (back = false) => `
      <g class="ios-cloud ${back ? "ios-cloud--back" : ""}" transform="${back ? "translate(2 3)" : "translate(0 0)"}">
        <circle cx="24" cy="36" r="9" fill="${back ? "var(--cloud2)" : "var(--cloud)"}"/>
        <circle cx="36" cy="32" r="11" fill="${back ? "var(--cloud2)" : "var(--cloud)"}"/>
        <circle cx="46" cy="38" r="8" fill="${back ? "var(--cloud2)" : "var(--cloud)"}"/>
        <rect x="18" y="36" width="36" height="14" rx="7" fill="${back ? "var(--cloud2)" : "var(--cloud)"}"/>
      </g>
    `;

    const rain = `
      <g stroke="var(--rain)" stroke-width="2.8" stroke-linecap="round" opacity=".95">
        <line class="ios-drop" x1="26" y1="48" x2="23" y2="56" />
        <line class="ios-drop" x1="36" y1="48" x2="33" y2="56" />
        <line class="ios-drop" x1="46" y1="48" x2="43" y2="56" />
      </g>
    `;

    const snow = `
      <g stroke="var(--snow)" stroke-width="2.4" stroke-linecap="round" opacity=".95">
        <g class="ios-snow" transform="translate(0 0)">
          <line x1="26" y1="50" x2="26" y2="56" />
          <line x1="23" y1="53" x2="29" y2="53" />
          <line x1="24" y1="52" x2="28" y2="54" />
          <line x1="28" y1="52" x2="24" y2="54" />
        </g>
        <g class="ios-snow" transform="translate(10 0)">
          <line x1="26" y1="50" x2="26" y2="56" />
          <line x1="23" y1="53" x2="29" y2="53" />
          <line x1="24" y1="52" x2="28" y2="54" />
          <line x1="28" y1="52" x2="24" y2="54" />
        </g>
        <g class="ios-snow" transform="translate(20 0)">
          <line x1="26" y1="50" x2="26" y2="56" />
          <line x1="23" y1="53" x2="29" y2="53" />
          <line x1="24" y1="52" x2="28" y2="54" />
          <line x1="28" y1="52" x2="24" y2="54" />
        </g>
      </g>
    `;

    const bolt = `
      <path class="ios-bolt" d="M38 44 30 58h7l-3 10 14-18h-7l3-6z" fill="var(--bolt)"/>
    `;

    const fog = `
      <g stroke="var(--fog)" stroke-width="2.6" stroke-linecap="round" opacity=".95">
        <line x1="16" y1="34" x2="52" y2="34" />
        <line x1="12" y1="42" x2="48" y2="42" />
        <line x1="18" y1="50" x2="54" y2="50" />
      </g>
    `;

    let inner = "";
    if (wx.cond === "clear") {
      inner = wx.night ? moon : sun;
    } else if (wx.cond === "partly") {
      inner = wx.night
        ? `<g transform="translate(-2 -2)">${moon}</g>${cloud(true)}${cloud(false)}`
        : `<g transform="translate(-2 -2)">${sun}</g>${cloud(true)}${cloud(false)}`;
    } else if (wx.cond === "cloudy") {
      inner = `${cloud(true)}${cloud(false)}`;
    } else if (wx.cond === "rain") {
      inner = `${cloud(true)}${cloud(false)}${rain}`;
    } else if (wx.cond === "snow") {
      inner = `${cloud(true)}${cloud(false)}${snow}`;
    } else if (wx.cond === "thunder") {
      inner = `${cloud(true)}${cloud(false)}${bolt}`;
    } else if (wx.cond === "mist") {
      inner = `${cloud(true)}${fog}`;
    } else {
      inner = `${cloud(false)}`;
    }

    return `${svgOpen}${inner}${svgClose}`;
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

  };

  const computeInsights = (cur, forecast, units) => {
    const sym = unitSymbols(units);
    const t = Number(cur?.temp);
    const feels = Number(cur?.feels_like ?? cur?.temp);
    const wind = Number(cur?.wind_speed);
    const humidity = Number(cur?.humidity);
    const clouds = Number(cur?.clouds);
    const desc = String(cur?.desc || "").toLowerCase();

    const next = Array.isArray(forecast) ? forecast.slice(0, 8) : []; // ~24h
    let maxPop = 0;
    let hasRainSnow = false;
    for (const it of next) {
      if (typeof it?.pop === "number") maxPop = Math.max(maxPop, it.pop);
      const d = String(it?.desc || "").toLowerCase();
      if (d.includes("дожд") || d.includes("лив") || d.includes("снег") || d.includes("метел")) hasRainSnow = true;
    }

    // Best slot for a walk (temp high, pop low, wind moderate)
    let best = null;
    for (const it of next) {
      const tt = Number(it?.temp);
      const pp = typeof it?.pop === "number" ? it.pop : 0;
      const ww = Number(it?.wind_speed);
      if (!Number.isFinite(tt)) continue;
      const windPenalty = Number.isFinite(ww) ? Math.max(0, ww - (units === "imperial" ? 18 : 7)) * 0.9 : 0;
      const score = tt - (pp * 14) - windPenalty;
      if (!best || score > best.score) best = { it, score, tt, pp, ww };
    }

    const formatTime = (unix) => {
      if (!unix) return "—";
      const d = new Date(unix * 1000);
      return new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "UTC", hour12: false }).format(d) + " UTC";
    };

    const forecastCards = [];
    if (best && best.it?.dt) {
      const when = formatTime(best.it.dt);
      const tStr = `${Math.round(best.tt)}${sym.t}`;
      const popStr = `${Math.round((best.pp || 0) * 100)}%`;
      const windStr = Number.isFinite(best.ww) ? `${best.ww} ${sym.wind}` : "—";
      forecastCards.push({
        icon: "🚶",
        title: "Лучшее время выйти",
        desc: `Окно на ближайшие часы: ${when}. Ожидается около ${tStr} (осадки ${popStr}).`,
        chips: ["💨 " + windStr, "☔ " + popStr],
      });
    }

    if (next.length) {
      const popStr = `${Math.round(maxPop * 100)}%`;
      const kind = (desc.includes("снег") || desc.includes("метел") || hasRainSnow && next.some(x => String(x?.desc||"").toLowerCase().includes("снег"))) ? "снег" : (desc.includes("дожд") || desc.includes("лив") ? "дождь" : "осадки");
      forecastCards.push({
        icon: maxPop >= 0.4 ? "☔" : "🌤️",
        title: "Осадки",
        desc: maxPop >= 0.4 ? `В ближайшие 24 часа возможны ${kind}. Вероятность до ${popStr}.` : `Существенных осадков не ожидается (до ${popStr}).`,
        chips: ["☁ " + (Number.isFinite(clouds) ? `${clouds}%` : "—")],
      });
    }

    const tipsCards = [];
    // Comfort
    if (Number.isFinite(feels)) {
      let level = "Комфортно";
      let icon = "🙂";
      if (feels <= -15) { level = "Очень холодно"; icon = "🥶"; }
      else if (feels <= -5) { level = "Холодно"; icon = "🧣"; }
      else if (feels <= 5) { level = "Прохладно"; icon = "🧥"; }
      else if (feels >= 30) { level = "Жарко"; icon = "🥵"; }
      tipsCards.push({
        icon,
        title: "Комфорт",
        desc: `${level}. Ощущается как ${Math.round(feels)}${sym.t}.`,
        chips: [Number.isFinite(humidity) ? `💧 ${humidity}%` : null, Number.isFinite(wind) ? `💨 ${wind} ${sym.wind}` : null].filter(Boolean),
      });
    }

    // Road / safety
    const nearZero = Number.isFinite(t) && t >= -1 && t <= 2;
    const windy = Number.isFinite(wind) ? ((units === "imperial") ? wind >= 20 : wind >= 8) : false;
    if (nearZero && (maxPop >= 0.3 || hasRainSnow || desc.includes("дожд") || desc.includes("снег"))) {
      tipsCards.push({
        icon: "🧊",
        title: "Осторожно на улице",
        desc: "Температура около нуля и возможны осадки — вероятность гололёда. Выбирайте обувь с хорошей подошвой.",
        chips: ["⚠️ Гололёд"],
      });
    } else if (windy) {
      tipsCards.push({
        icon: "💨",
        title: "Порывы ветра",
        desc: "Ветрено: на открытых местах может быть ощутимо холоднее. Капюшон/ветровка помогут.",
        chips: [Number.isFinite(wind) ? `💨 ${wind} ${sym.wind}` : null].filter(Boolean),
      });
    } else {
      tipsCards.push({
        icon: "✅",
        title: "План на день",
        desc: maxPop >= 0.4 ? "Лучше иметь запасной вариант (зонт/капюшон)." : "Можно планировать прогулку/дела без сюрпризов.",
        chips: [maxPop >= 0.4 ? "☔ Зонт" : "🌤️ Ок"],
      });
    }

    return { forecastCards: forecastCards.slice(0, 2), tipsCards: tipsCards.slice(0, 3) };
  };

  const renderInsights = (data) => {
    const cur = data.current || {};
    const insights = computeInsights(cur, data.forecast || [], data.units);

    const renderBlock = (el, kicker, cards) => {
      if (!el) return;
      if (!cards || !cards.length) {
        el.innerHTML = "";
        return;
      }
      el.innerHTML = `
        <div class="kicker">${kicker}</div>
        <div class="insights__grid">
          ${cards.map((c) => `
            <div class="insight">
              <div class="insight__top">
                <p class="insight__title">${c.title}</p>
                <div class="insight__icon">${c.icon}</div>
              </div>
              <p class="insight__desc">${c.desc}</p>
              ${c.chips && c.chips.length ? `<div class="insight__meta">${c.chips.map((x) => `<span class="mini-chip">${x}</span>`).join("")}</div>` : ""}
            </div>
          `).join("")}
        </div>
      `;
    };

    renderBlock(els.forecastInsights, "Инсайты", insights.forecastCards);
    renderBlock(els.tipsInsights, "Сегодня", insights.tipsCards);
  };

  const render = (data) => {
    const loc = data.location || {};
    const cur = data.current || {};
    const sym = unitSymbols(data.units);

    els.place.textContent = loc.country ? `${loc.name}, ${loc.country}` : (loc.name || "—");
    els.desc.textContent = cur.desc || "—";

    const wx = wxFromIcon(cur.icon, cur.desc);
    applyWxTheme(wx);
    els.iconWrap.innerHTML = cur.icon
      ? iosIconSVG(cur.icon, { size: 64, animated: true })
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
      renderInsights(data);
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
          <div class="fitem__icon">${it.icon ? iosIconSVG(it.icon, { size: 30, animated: false }) : ""}</div>
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
    // Non-clothing insights (fills empty areas under forecast & quick tips)
    renderInsights(data);
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
