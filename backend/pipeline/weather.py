"""Weather data resolution — DB-first with Open-Meteo fallback (no API key needed)."""

import logging

import httpx

logger = logging.getLogger(__name__)

# WMO weather code → human-readable description
_WMO_CODES = {
    0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Foggy", 48: "Depositing rime fog",
    51: "Light drizzle", 53: "Moderate drizzle", 55: "Dense drizzle",
    61: "Slight rain", 63: "Moderate rain", 65: "Heavy rain",
    66: "Light freezing rain", 67: "Heavy freezing rain",
    71: "Slight snow", 73: "Moderate snow", 75: "Heavy snow",
    77: "Snow grains", 80: "Slight rain showers", 81: "Moderate rain showers",
    82: "Violent rain showers", 85: "Slight snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm with slight hail", 99: "Thunderstorm with heavy hail",
}


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
    directly. Otherwise fetch from Open-Meteo (free, no API key).
    """
    if existing_summary and (existing_temp is not None or existing_conditions):
        return {
            "summary": existing_summary,
            "temp_f": existing_temp,
            "conditions": existing_conditions,
        }

    if lat is not None and lng is not None:
        result = _fetch_open_meteo(lat, lng)
        if result:
            return result

    return {
        "summary": "Weather data unavailable",
        "temp_f": None,
        "conditions": None,
    }


def _fetch_open_meteo(lat: float, lng: float) -> dict | None:
    """Fetch current weather from Open-Meteo (free, no API key)."""
    try:
        resp = httpx.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lng,
                "current": "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m",
                "temperature_unit": "fahrenheit",
                "wind_speed_unit": "mph",
                "timezone": "auto",
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        current = data.get("current", {})

        temp_f = current.get("temperature_2m")
        weather_code = current.get("weather_code", -1)
        wind_mph = current.get("wind_speed_10m")
        humidity = current.get("relative_humidity_2m")

        conditions = _WMO_CODES.get(weather_code, "Unknown conditions")

        parts = [conditions]
        if temp_f is not None:
            parts[0] = f"{conditions}, {temp_f:.0f}°F"
        if wind_mph is not None:
            parts.append(f"wind {wind_mph:.0f} mph")
        if humidity is not None:
            parts.append(f"{humidity:.0f}% humidity")

        summary = ", ".join(parts)

        return {
            "summary": summary,
            "temp_f": round(temp_f, 1) if temp_f is not None else None,
            "conditions": conditions,
        }
    except Exception as exc:
        logger.warning("Open-Meteo fetch failed: %s", exc)
        return None
