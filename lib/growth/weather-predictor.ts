import "server-only";
import { logger } from "@/lib/logger";

/**
 * ROADMAP ITEM #82 — Weather aware demand predictor (stub)
 *
 * Consume una API pública de clima (Open-Meteo — gratis, sin API key) y
 * ajusta las sugerencias de auto-reorden con base en el pronóstico:
 *
 *  - Lluvia en los próximos 3 días → promover bebidas calientes, ponchos,
 *    velas, cerillas, pilas, conservas.
 *  - Calor intenso → bebidas frías, helados, hielo, protector solar.
 *  - Frío → café, chocolate, lana, mantas.
 *
 * Este módulo expone las señales — la integración con el auto-reorder
 * queda para una sesión posterior.
 */

const OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast";

export interface WeatherSignal {
  city: string;
  days: { date: string; maxTemp: number; minTemp: number; precipitationMm: number; code: number }[];
  summary: {
    hasRain: boolean;
    hasCold: boolean;
    hasHeat: boolean;
  };
  suggestedCategories: string[];
}

const SUGGESTION_RULES: { when: (s: WeatherSignal["summary"]) => boolean; categories: string[] }[] = [
  { when: (s) => s.hasRain, categories: ["bebidas-calientes", "velas", "pilas", "conservas"] },
  { when: (s) => s.hasHeat, categories: ["bebidas-frias", "helados", "hielo"] },
  { when: (s) => s.hasCold, categories: ["cafe", "chocolate", "sopas-instantaneas"] },
];

export async function getWeatherSignal(
  lat: number,
  lon: number,
  cityLabel = "",
): Promise<WeatherSignal | null> {
  try {
    const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&forecast_days=3&timezone=America/Lima`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      daily?: {
        time?: string[];
        temperature_2m_max?: number[];
        temperature_2m_min?: number[];
        precipitation_sum?: number[];
        weathercode?: number[];
      };
    };
    const d = json.daily;
    if (!d?.time) return null;

    const days = d.time.map((date, i) => ({
      date,
      maxTemp: d.temperature_2m_max?.[i] ?? 0,
      minTemp: d.temperature_2m_min?.[i] ?? 0,
      precipitationMm: d.precipitation_sum?.[i] ?? 0,
      code: d.weathercode?.[i] ?? 0,
    }));

    const summary = {
      hasRain: days.some((day) => day.precipitationMm > 5),
      hasCold: days.some((day) => day.minTemp < 12),
      hasHeat: days.some((day) => day.maxTemp > 30),
    };

    const suggestedCategories = SUGGESTION_RULES.filter((r) => r.when(summary)).flatMap(
      (r) => r.categories,
    );

    return { city: cityLabel, days, summary, suggestedCategories };
  } catch (err) {
    logger.warn("[weather-predictor] fetch failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
