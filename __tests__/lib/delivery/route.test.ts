import { describe, it, expect } from "vitest";
import {
  estimateDurationMin,
  formatEta,
  formatDistance,
  straightRoute,
} from "@/lib/delivery/route";

describe("estimateDurationMin", () => {
  it("estima minutos a 18 km/h por defecto", () => {
    // 3 km / 18 km/h = 0.1666 h = 10 min
    expect(estimateDurationMin(3)).toBe(10);
  });

  it("respeta una velocidad custom", () => {
    // 10 km / 30 km/h = 0.333 h = 20 min
    expect(estimateDurationMin(10, 30)).toBe(20);
  });

  it("garantiza mínimo 1 min para distancia positiva pequeña", () => {
    expect(estimateDurationMin(0.05)).toBe(1);
  });

  it("devuelve 0 para distancia <= 0 o no finita", () => {
    expect(estimateDurationMin(0)).toBe(0);
    expect(estimateDurationMin(-5)).toBe(0);
    expect(estimateDurationMin(NaN)).toBe(0);
    expect(estimateDurationMin(Infinity)).toBe(0);
  });

  it("devuelve 0 si la velocidad es <= 0", () => {
    expect(estimateDurationMin(5, 0)).toBe(0);
  });
});

describe("formatEta", () => {
  it("formatea minutos bajo una hora", () => {
    expect(formatEta(8)).toBe("8 min");
    expect(formatEta(59)).toBe("59 min");
  });

  it("formatea horas exactas", () => {
    expect(formatEta(60)).toBe("1 h");
    expect(formatEta(120)).toBe("2 h");
  });

  it("formatea horas con minutos", () => {
    expect(formatEta(65)).toBe("1 h 5 min");
    expect(formatEta(135)).toBe("2 h 15 min");
  });

  it("devuelve guion para valores no positivos / no finitos", () => {
    expect(formatEta(0)).toBe("—");
    expect(formatEta(-3)).toBe("—");
    expect(formatEta(NaN)).toBe("—");
  });
});

describe("formatDistance", () => {
  it("usa metros bajo 1 km", () => {
    expect(formatDistance(0.45)).toBe("450 m");
    expect(formatDistance(0.999)).toBe("999 m");
  });

  it("usa km con un decimal desde 1 km", () => {
    expect(formatDistance(1)).toBe("1.0 km");
    expect(formatDistance(2.34)).toBe("2.3 km");
  });

  it("devuelve guion para valores no positivos / no finitos", () => {
    expect(formatDistance(0)).toBe("—");
    expect(formatDistance(-1)).toBe("—");
    expect(formatDistance(NaN)).toBe("—");
  });
});

describe("straightRoute", () => {
  it("devuelve los dos extremos como coords [lat,lng] y source straight", () => {
    const from = { lat: -8.3791, lng: -74.5539 };
    const to = { lat: -8.39, lng: -74.56 };
    const r = straightRoute(from, to);
    expect(r.source).toBe("straight");
    expect(r.coords).toEqual([
      [from.lat, from.lng],
      [to.lat, to.lng],
    ]);
    expect(r.distanceKm).toBeGreaterThan(0);
    expect(r.durationMin).toBeGreaterThanOrEqual(1);
  });

  it("distancia 0 cuando los puntos coinciden → duración 0", () => {
    const p = { lat: -8.3791, lng: -74.5539 };
    const r = straightRoute(p, p);
    expect(r.distanceKm).toBe(0);
    expect(r.durationMin).toBe(0);
  });
});
