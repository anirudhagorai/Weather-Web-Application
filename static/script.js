document.addEventListener("DOMContentLoaded", function () {
  const searchForm = document.getElementById("city-form");
  const cityInput = document.querySelector(".city-input");

  const weatherSection = document.querySelector(".weather-info");
  const searchSection = document.querySelector(".search-city.section-message");
  const notFoundSection = document.querySelector(".not-found.section-message");

  const currentDateEl = document.querySelector(".current-date-txt");
  const currentTimeEl = document.querySelector(".current-time-txt");

  const dateOnlyFmt = new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const longDateFmt = new Intl.DateTimeFormat(undefined, {
    weekday: "long",
    month: "short",
    day: "2-digit",
    year: "numeric",
  });
  const timeFmt = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const weekdayFmt = new Intl.DateTimeFormat(undefined, { weekday: "long" });

  function atMidnight(d) {
    const t = new Date(d);
    t.setHours(0, 0, 0, 0);
    return t.getTime();
  }

  function labelDate(targetDate) {
    const now = new Date();
    const today = atMidnight(now);
    const tomorrow = today + 24 * 60 * 60 * 1000;
    const t = atMidnight(targetDate);
    if (t === today)
      return {
        rel: "Today",
        label: `Today (${weekdayFmt.format(targetDate)})`,
      };
    if (t === tomorrow)
      return {
        rel: "Tomorrow",
        label: `Tomorrow (${weekdayFmt.format(targetDate)})`,
      };
    return { rel: null, label: longDateFmt.format(targetDate) };
  }

  let clockTimer = null;
  function startClock(el, baseDate = null) {
    if (clockTimer) clearInterval(clockTimer);
    function tick() {
      el.textContent = timeFmt.format(baseDate ? baseDate : new Date());
      if (baseDate) baseDate = new Date(baseDate.getTime() + 1000);
    }
    tick();
    clockTimer = setInterval(tick, 1000);
  }

  async function startServerClock(el) {
    try {
      const r = await fetch("/api/now");
      const { now_utc } = await r.json();
      let base = new Date(now_utc);
      startClock(el, base);
    } catch {
      startClock(el);
    }
  }

  // Fallback only (server now provides icon)
  const weatherIcons = {
    Thunderstorm: "thunderstorm.svg",
    Drizzle: "drizzle.svg",
    Rain: "rain.svg",
    Snow: "snow.svg",
    Mist: "atmosphere.svg",
    Smoke: "atmosphere.svg",
    Haze: "atmosphere.svg",
    Dust: "atmosphere.svg",
    Fog: "atmosphere.svg",
    Sand: "atmosphere.svg",
    Ash: "atmosphere.svg",
    Clear: "clear.svg",
    Clouds: "clouds.svg"
  };
  function titleCase(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : "";
  }
  function fileForCondition(main) {
    const norm = titleCase(main);
    return weatherIcons[norm] || "unknown.svg";
  }

  function setText(sel, text) {
    const el = document.querySelector(sel);
    if (el) el.textContent = text;
  }
  function setImg(sel, src, alt) {
    const el = document.querySelector(sel);
    if (el) {
      el.src = src;
      el.alt = alt || "";
    }
  }

  searchForm.addEventListener("submit", async function (event) {
    event.preventDefault();
    const city = cityInput.value.trim();
    if (!city) return;

    try {
      const resp = await fetch(`/api/weather?city=${encodeURIComponent(city)}`);
      if (!resp.ok) throw new Error("Not Found");
      const data = await resp.json();

      searchSection.style.display = "none";
      notFoundSection.style.display = "none";
      weatherSection.style.display = "block";

      // Location
      const loc = [data.city, data.country].filter(Boolean).join(", ");
      setText(".location-txt", loc);

      // Local datetime from API shift
      const utcMs =
        (typeof data.date_ts === "number" ? data.date_ts : Date.now() / 1000) *
        1000;
      const shiftMs =
        (Number.isFinite(data.timezone_shift) ? data.timezone_shift : 0) * 1000;
      const localNow = new Date(utcMs + shiftMs);

      const { rel, label } = labelDate(localNow);
      if (rel) {
        const prettyDate = dateOnlyFmt.format(localNow);
        currentDateEl.innerHTML = `${rel} (${weekdayFmt.format(
          localNow
        )}) — ${prettyDate}`;
      } else {
        currentDateEl.textContent = label;
      }

      // Clock
      startServerClock(currentTimeEl);

      const round = (x) => Math.round(Number(x));
      const mainText = titleCase(data.condition_desc || data.condition || "");

      // Now panel
      setText(".temp-text", `${round(data.temp)}°C`);
      setText(".condition-txt", mainText);
      setText(".humidity-value-txt", `${round(data.humidity)}%`);
      setText(".wind-value-txt", `${Number(data.wind).toFixed(1)} m/s`);

      // Use server-provided icon; fallback only if missing
      const nowIcon = data.icon || fileForCondition(data.condition);
      setImg(".now-condition-img", `/static/weather/${nowIcon}`, mainText);

      // Forecast
      const cards = document.querySelectorAll(".forecast-item");
      cards.forEach((card, idx) => {
        const f = data.forecast && data.forecast[idx];
        if (!f) {
          card.style.display = "none";
          return;
        }
        card.style.display = "flex";
        const d = new Date((f.date_ts || 0) * 1000 + shiftMs);

        const container = card.querySelector(".forecast-item-date");
        const wEl = container ? container.querySelector(".fi-weekday") : null;
        const dEl = container ? container.querySelector(".fi-date") : null;
        if (wEl && dEl) {
          wEl.textContent = weekdayFmt.format(d);
          dEl.textContent = dateOnlyFmt.format(d);
        } else if (container) {
          container.textContent = `${weekdayFmt.format(
            d
          )} — ${dateOnlyFmt.format(d)}`;
        }

        const iconFile = f.icon || fileForCondition(f.condition);
        const imgEl = card.querySelector(".forecast-item-img");
        if (imgEl) {
          imgEl.src = `/static/weather/${iconFile}`;
          imgEl.alt = f.condition || "";
        }
        const tempEl = card.querySelector(".forecast-item-temp");
        if (tempEl) tempEl.textContent = `${round(f.temp)}°C`;
      });
    } catch (e) {
      weatherSection.style.display = "none";
      searchSection.style.display = "none";
      notFoundSection.style.display = "block";
      console.error("Weather fetch/render failed:", e);
    }
  });
});
