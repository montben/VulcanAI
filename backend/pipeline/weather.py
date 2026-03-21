"""Weather data resolution — DB-first with optional external API fallback."""

import logging
import os

import httpx

logger = logging.getLogger(__name__)

WEATHER_API_KEY = os.getenv("WEATHER_API_KEY")


def get_weather(
    lat: float | None,
    lng: float | None,
    date_str: str,
    existing_summary: str | None = None,
    existing_temp: float | None = None,
    existing_conditions: str | None = None,
) -> dict:
    """Resolve weather data for a report date and location.

    DB-first: if existing weather fields are already populated, return them
    directly. Otherwise attempt an external lookup and fall back to a
    placeholder when no data source is available.
    """
    if existing_summary and (existing_temp is not None or existing_conditions):
        return {
            "summary": existing_summary,
            "temp_f": existing_temp,
            "conditions": existing_conditions,
        }

    if lat is not None and lng is not None:
        result = _fetch_external(lat, lng, date_str)
        if result:
            return result

    return {
        "summary": "Weather data unavailable",
        "temp_f": None,
        "conditions": None,
    }


def _fetch_external(lat: float, lng: float, date_str: str) -> dict | None:
    """Try external weather APIs. Returns None on failure."""
    if WEATHER_API_KEY:
        result = _fetch_openweathermap(lat, lng)
        if result:
            return result

    return _fetch_wttr(lat, lng)


def _fetch_openweathermap(lat: float, lng: float) -> dict | None:
    """Fetch current weather from OpenWeatherMap API."""
    try:
        resp = httpx.get(
            "https://api.openweathermap.org/data/2.5/weather",
            params={
                "lat": lat,
                "lon": lng,
                "appid": WEATHER_API_KEY,
                "units": "imperial",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        main = data.get("main", {})
        weather_list = data.get("weather", [{}])
        description = weather_list[0].get("description", "") if weather_list else ""
        temp_f = main.get("temp")
        return {
            "summary": f"{description.capitalize()}, {temp_f:.0f}°F" if temp_f else description.capitalize(),
            "temp_f": round(temp_f, 1) if temp_f is not None else None,
            "conditions": description.capitalize(),
        }
    except Exception as exc:
        logger.warning("OpenWeatherMap fetch failed: %s", exc)
        return None


def _fetch_wttr(lat: float, lng: float) -> dict | None:
    """Fallback: fetch weather from wttr.in (no API key required)."""
    try:
        resp = httpx.get(
            f"https://wttr.in/{lat},{lng}",
            params={"format": "j1"},
            timeout=10,
            headers={"User-Agent": "SiteScribe/1.0"},
        )
        resp.raise_for_status()
        data = resp.json()
        current = data.get("current_condition", [{}])[0]
        temp_f = current.get("temp_F")
        desc = current.get("weatherDesc", [{}])[0].get("value", "")
        temp_val = float(temp_f) if temp_f else None
        return {
            "summary": f"{desc}, {temp_f}°F" if temp_f else desc,
            "temp_f": temp_val,
            "conditions": desc,
        }
    except Exception as exc:
        logger.warning("wttr.in fetch failed: %s", exc)
        return None
