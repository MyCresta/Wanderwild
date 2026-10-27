import type { Element } from '../creatures/species';
import { isNight } from './gear';

/**
 * The real sky over the Wayfarer: local weather from Open-Meteo (free, no key) and the
 * hour of the day. Each kind of weather draws out one element of Wildling, and night
 * wakes Lumen ones and lets Blotspawn run deeper. Nothing breaks without it: offline,
 * only day and night count.
 */

export type Weather = 'clear' | 'clouds' | 'fog' | 'rain' | 'snow' | 'storm';

export interface Sky {
  /** Null until the forecast has loaded, or when it cannot be reached. */
  weather: Weather | null;
  night: boolean;
}

export const WEATHER: Record<Weather, { name: string; element: Element; line: string }> = {
  clear: { name: 'Clear skies', element: 'ember', line: 'Ember Wildlings bask in the open.' },
  clouds: { name: 'Overcast', element: 'grove', line: 'Grove Wildlings stir under grey skies.' },
  fog: { name: 'Mist', element: 'lumen', line: 'Lumen Wildlings drift through the mist.' },
  rain: { name: 'Rain', element: 'tide', line: 'Tide Wildlings come out in the rain.' },
  snow: { name: 'Snow', element: 'stone', line: 'Stone Wildlings brave the snow.' },
  storm: { name: 'Storm', element: 'gale', line: 'Gale Wildlings ride the storm.' },
};
export const NIGHT_ELEMENT: Element = 'lumen';
export const NIGHT_LINE = 'Night: Lumen Wildlings wake and Blotspawn run deeper.';

/** WMO weather code, as Open-Meteo reports it, to the game's kinds of weather. */
export function weatherFromCode(code: number): Weather {
  if (code >= 95) return 'storm';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 2) return 'clouds';
  return 'clear';
}

/** The elements the sky favours right now. */
export function skyElements(sky: Sky | undefined): Element[] {
  if (!sky) return [];
  const out: Element[] = [];
  if (sky.weather) out.push(WEATHER[sky.weather].element);
  if (sky.night) out.push(NIGHT_ELEMENT);
  return out;
}

/** One short line for the top bar's sky button. */
export function skyLine(sky: Sky): string {
  const weather = sky.weather ? `${WEATHER[sky.weather].name}: ${WEATHER[sky.weather].line}` : '';
  if (!sky.night) return weather || 'Day. The sky is quiet.';
  return weather ? `${weather} ${NIGHT_LINE}` : NIGHT_LINE;
}

const CACHE_KEY = 'wanderwild.weather';
/** The forecast is good for this long, and for this far. */
const FRESH_MS = 30 * 60 * 1000;
const NEAR_DEG = 0.05;

interface Cached {
  weather: Weather;
  lat: number;
  lng: number;
  at: number;
}

function readCache(): Cached | null {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null') as Cached | null;
    return c && c.weather in WEATHER ? c : null;
  } catch {
    return null;
  }
}

/** Keeps the sky up to date: call `update` with each position; `onChange` fires when it changes. */
export class SkyWatch {
  private weather: Weather | null = readCache()?.weather ?? null;
  private night = isNight();
  private asking = false;
  private lastTry = 0;

  constructor(private readonly onChange: (sky: Sky) => void) {
    setInterval(() => this.tick(), 60_000);
  }

  get sky(): Sky {
    return { weather: this.weather, night: this.night };
  }

  /** Looks up the weather when there is none for this place yet, or it has gone stale. */
  update(lat: number, lng: number, now = Date.now()): void {
    this.tick(now);
    const c = readCache();
    const fresh = c && now - c.at < FRESH_MS && Math.abs(c.lat - lat) < NEAR_DEG && Math.abs(c.lng - lng) < NEAR_DEG;
    // A failed lookup waits a few minutes before trying again.
    if (fresh || this.asking || now - this.lastTry < 5 * 60 * 1000) return;
    this.asking = true;
    this.lastTry = now;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&current=weather_code`;
    fetch(url)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { current?: { weather_code?: number } } | null) => {
        const code = data?.current?.weather_code;
        if (typeof code !== 'number') return;
        const weather = weatherFromCode(code);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ weather, lat, lng, at: now } satisfies Cached));
        } catch {
          // Without storage the forecast is just asked for again next time.
        }
        if (weather !== this.weather) {
          this.weather = weather;
          this.onChange(this.sky);
        }
      })
      .catch(() => undefined)
      .finally(() => (this.asking = false));
  }

  private tick(now = Date.now()): void {
    const night = isNight(now);
    if (night === this.night) return;
    this.night = night;
    this.onChange(this.sky);
  }
}
