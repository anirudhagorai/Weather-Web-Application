from flask import Flask, jsonify, request, render_template
from datetime import datetime, timezone
import requests

# Local SVG map for OpenWeather "main"
ICON_MAP = {
    'Thunderstorm': 'thunderstorm.svg',
    'Drizzle': 'drizzle.svg',
    'Rain': 'rain.svg',
    'Snow': 'snow.svg',
    'Mist': 'atmosphere.svg',
    'Smoke': 'atmosphere.svg',
    'Haze': 'atmosphere.svg',
    'Dust': 'atmosphere.svg',
    'Fog': 'atmosphere.svg',
    'Sand': 'atmosphere.svg',
    'Ash': 'atmosphere.svg',
    'Clear': 'clear.svg',
    'Clouds': 'clouds.svg',

}


def tcase(s: str) -> str:
    return str(s).strip().lower().capitalize() if s else "Unknown"


def icon_for(main: str) -> str:
    return ICON_MAP.get(tcase(main), 'unknown.svg')


app = Flask(__name__)
app.config["APP_NAME"] = "Weather Report"

API_KEY = '9ee5811d4561a09c1ebe85582dcf833c'

@app.route("/")
def index():
    return render_template("index.html", weather={"temp_c": 0, "main": "Clear"}, weather_icon="clear.svg")


@app.get("/api/now")
def api_now():
    return jsonify({"now_utc": datetime.now(timezone.utc).isoformat()})


@app.get("/api/weather")
def get_weather():
    city = request.args.get("city", "").strip()
    if not city:
        return jsonify({"error": "No city provided"}), 400

    try:
        # Current conditions
        cur_url = ("https://api.openweathermap.org/data/2.5/weather"f"?q={city}&units=metric&appid={API_KEY}")
        cur = requests.get(cur_url, timeout=12)
        if cur.status_code != 200:
            return jsonify({"error": "Not Found"}), 404
        cj = cur.json()

        w0 = (cj.get("weather") or [{}])[0]
        main = tcase(w0.get("main"))
        desc = tcase(w0.get("description") or main)
        tz_shift = int(cj.get("timezone", 0))  # seconds offset from UTC

        now = {
            "city": cj.get("name", city),
            "country": (cj.get("sys") or {}).get("country", ""),
            "date_ts": int(cj.get("dt", 0)),
            "timezone_shift": tz_shift,
            "temp": float((cj.get("main") or {}).get("temp", 0.0)),
            "humidity": int((cj.get("main") or {}).get("humidity", 0)),
            "wind": float((cj.get("wind") or {}).get("speed", 0.0)),
            "condition": main,
            "condition_desc": desc,
            "icon": icon_for(main)
        }

        # Forecast (pick one slot near 12:00 local for each upcoming day)
        fc_url = f"https://api.openweathermap.org/data/2.5/forecast?q={city}&units=metric&appid={API_KEY}"
        fc = requests.get(fc_url, timeout=12)
        forecast = []
        if fc.status_code == 200:
            fj = fc.json()
            items = fj.get("list", [])

            def pick_noon(entries):
                by_day = {}
                for it in entries:
                    ts = int(it.get("dt", 0))
                    txt = it.get("dt_txt") or ""
                    hour = int(txt[11:13]) if len(
                        txt) >= 13 else datetime.utcfromtimestamp(ts).hour
                    day_key = (txt[:10] if txt else datetime.utcfromtimestamp(
                        ts).strftime("%Y-%m-%d"))
                    score = abs(hour - 12)
                    prev = by_day.get(day_key)
                    if not prev or score < prev["score"]:
                        by_day[day_key] = {"score": score, "item": it}
                # Compare using local day of "now"
                today_key = datetime.utcfromtimestamp(
                    now["date_ts"] + tz_shift).strftime("%Y-%m-%d")
                out = []
                for k in sorted(by_day.keys()):
                    if k <= today_key:
                        continue
                    out.append(by_day[k]["item"])
                return out[:5]

            chosen = pick_noon(items)
            for it in chosen:
                wi = (it.get("weather") or [{}])[0]
                m = tcase(wi.get("main"))
                forecast.append({
                    "date_ts": int(it.get("dt", 0)),
                    "temp": float((it.get("main") or {}).get("temp", 0.0)),
                    "condition": m,
                    "icon": icon_for(m)
                })

        return jsonify({**now, "forecast": forecast})

    except Exception as e:
        return jsonify({"error": "Parsing failed", "details": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)
