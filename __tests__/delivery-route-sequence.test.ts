import { describe, it, expect } from "vitest";
import { sequenceStops, type RouteStop } from "@/lib/delivery/route";

/**
 * sequenceStops — heurística de apilado de pedidos (vecino-más-cercano).
 * Coordenadas sintéticas en una grilla simple para razonar la cercanía sin
 * depender de la geografía real.
 */
describe("sequenceStops", () => {
  const start = { lat: 0, lng: 0 };

  it("devuelve ruta vacía cuando no hay paradas", () => {
    const r = sequenceStops(start, []);
    expect(r.ordered).toEqual([]);
    expect(r.totalDistanceKm).toBe(0);
    expect(r.totalDurationMin).toBe(0);
  });

  it("una sola parada: tramo y acumulado son la distancia inicio→parada", () => {
    const stops: RouteStop<string>[] = [{ point: { lat: 0, lng: 0.1 }, data: "A" }];
    const r = sequenceStops(start, stops);
    expect(r.ordered).toHaveLength(1);
    expect(r.ordered[0].sequence).toBe(1);
    expect(r.ordered[0].legDistanceKm).toBeGreaterThan(0);
    expect(r.ordered[0].cumulativeDistanceKm).toBeCloseTo(r.ordered[0].legDistanceKm, 6);
    expect(r.totalDistanceKm).toBeCloseTo(r.ordered[0].legDistanceKm, 6);
  });

  it("reordena por cercanía aunque el input venga desordenado", () => {
    // Lejos primero en el input, pero el más cercano al inicio es "cerca".
    const stops: RouteStop<string>[] = [
      { point: { lat: 0, lng: 0.9 }, data: "lejos" },
      { point: { lat: 0, lng: 0.1 }, data: "cerca" },
      { point: { lat: 0, lng: 0.5 }, data: "medio" },
    ];
    const r = sequenceStops(start, stops);
    expect(r.ordered.map((s) => s.data)).toEqual(["cerca", "medio", "lejos"]);
    expect(r.ordered.map((s) => s.sequence)).toEqual([1, 2, 3]);
  });

  it("acumula distancia y ETA monótonamente crecientes", () => {
    const stops: RouteStop<string>[] = [
      { point: { lat: 0, lng: 0.1 }, data: "A" },
      { point: { lat: 0, lng: 0.3 }, data: "B" },
      { point: { lat: 0, lng: 0.6 }, data: "C" },
    ];
    const r = sequenceStops(start, stops);
    const cum = r.ordered.map((s) => s.cumulativeDistanceKm);
    expect(cum[0]).toBeLessThan(cum[1]);
    expect(cum[1]).toBeLessThan(cum[2]);
    expect(r.totalDistanceKm).toBeCloseTo(cum[2], 6);
    expect(r.totalDurationMin).toBe(r.ordered[r.ordered.length - 1].cumulativeDurationMin);
  });

  it("las paradas sin GPS van al final, en orden original y sin tramo", () => {
    const stops: RouteStop<string>[] = [
      { point: null, data: "sinGps1" },
      { point: { lat: 0, lng: 0.2 }, data: "conGps" },
      { point: null, data: "sinGps2" },
    ];
    const r = sequenceStops(start, stops);
    expect(r.ordered.map((s) => s.data)).toEqual(["conGps", "sinGps1", "sinGps2"]);
    expect(r.ordered[1].legDistanceKm).toBe(0);
    expect(r.ordered[2].legDistanceKm).toBe(0);
    // El acumulado de las paradas sin GPS no crece más allá del último tramo real.
    expect(r.ordered[2].cumulativeDistanceKm).toBeCloseTo(r.ordered[0].cumulativeDistanceKm, 6);
  });

  it("es determinística: misma entrada → misma salida", () => {
    const stops: RouteStop<string>[] = [
      { point: { lat: 0.2, lng: 0.2 }, data: "X" },
      { point: { lat: 0.1, lng: 0.1 }, data: "Y" },
      { point: { lat: 0.3, lng: 0.3 }, data: "Z" },
    ];
    const a = sequenceStops(start, stops).ordered.map((s) => s.data);
    const b = sequenceStops(start, stops).ordered.map((s) => s.data);
    expect(a).toEqual(b);
  });
});
