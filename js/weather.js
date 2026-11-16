// Live weather for the current city (Open-Meteo, no API key), mirrored on the board.
// The weather is never chosen by the player: it always follows the real conditions.
export const COORDS = {
  antwerpen: [51.2194, 4.4025],
  brussel: [50.8503, 4.3517],
  gent: [51.0543, 3.7174],
  oasis: [30.92, -6.89],   // Oasis Bay is made up: it borrows the weather of a sunny desert spot
};

// kind: clear | cloudy | fog | drizzle | rain | snow | storm
export const weather = { kind: 'clear', temp: null, wind: 0, live: true, loaded: false, gloom: 0, sunBlock: 0, intensity: 0, city: null };

const KINDS = {
  clear:   { icon: '☀️', label: 'Clear',        gloom: 0,    sunBlock: 0,    intensity: 0 },
  cloudy:  { icon: '☁️', label: 'Cloudy',       gloom: 0.35, sunBlock: 0.6,  intensity: 0 },
  fog:     { icon: '🌫️', label: 'Fog',          gloom: 0.5,  sunBlock: 0.85, intensity: 0 },
  drizzle: { icon: '🌦️', label: 'Drizzle',      gloom: 0.45, sunBlock: 0.7,  intensity: 0.35 },
  rain:    { icon: '🌧️', label: 'Rain',         gloom: 0.6,  sunBlock: 0.9,  intensity: 1 },
  snow:    { icon: '🌨️', label: 'Snow',         gloom: 0.4,  sunBlock: 0.8,  intensity: 1 },
  storm:   { icon: '⛈️', label: 'Thunderstorm', gloom: 0.8,  sunBlock: 1,    intensity: 1.4 },
};

function fromCode(c, cloud) {
  if (c >= 95) return 'storm';
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow';
  if ((c >= 61 && c <= 67) || (c >= 80 && c <= 82)) return 'rain';
  if (c >= 51 && c <= 57) return 'drizzle';
  if (c === 45 || c === 48) return 'fog';
  if (c === 3 || cloud > 70) return 'cloudy';
  return 'clear';
}
function apply(kind) {
  Object.assign(weather, KINDS[kind], { kind });
  renderBadge();
}

let liveKind = 'clear', timer = null;
export async function loadWeather(cityId, cityName) {
  weather.city = cityName;
  const [lat, lon] = COORDS[cityId] || COORDS.antwerpen;
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m,cloud_cover&timezone=Europe%2FBrussels`;
    const r = await fetch(url);
    const j = await r.json();
    const c = j.current;
    weather.temp = Math.round(c.temperature_2m);
    weather.wind = c.wind_speed_10m || 0;
    liveKind = fromCode(c.weather_code, c.cloud_cover);
    weather.loaded = true;
  } catch { weather.loaded = false; }
  weather.live = true; apply(liveKind);
  clearTimeout(timer);
  timer = setTimeout(() => loadWeather(cityId, cityName), 10 * 60 * 1000);
}

function renderBadge() {
  const el = document.getElementById('weather');
  if (!el) return;
  const k = KINDS[weather.kind];
  const t = weather.temp != null && weather.live ? `${weather.temp}°C` : '';
  el.innerHTML = `<i>${k.icon}</i><div><small>${weather.loaded ? `Live · ${weather.city}` : 'Weather offline'}</small><b>${k.label}${t ? ' · ' + t : ''}</b></div>${weather.live && weather.loaded ? '<span class="live-dot"></span>' : ''}`;
  el.title = weather.loaded ? `Real weather in ${weather.city} right now (wind ${Math.round(weather.wind)} km/h), refreshed every 10 minutes.` : 'Could not reach the weather service.';
}

export function initWeatherBadge() {
  renderBadge();
}
