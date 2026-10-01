/**
 * Dónde está parada cada pila (zona + coordenada propia).
 *
 * Lo que se blinda: (1) que lo guardado con el formato viejo —un string con el
 * id de la zona— siga cargando, porque una ubicación que se descarta en
 * silencio es una troza que desaparece del mapa; y (2) que al MOVER una pila de
 * zona se borre la coordenada vieja: un punto del patio de trozas dentro de la
 * zona de despacho pondría el icono fuera de su polígono.
 */
import { describe, expect, it } from "vitest";
import {
  aplicarUbicacion,
  parsearUbicaciones,
  redondearCoord,
  soloZonas,
  type Ubicacion,
} from "@/lib/forestal/planta-ubicacion";

describe("leer lo guardado", () => {
  it("⭐ el formato viejo (string) sigue cargando", () => {
    expect(parsearUbicaciones({ a: "zona-1", b: "zona-2" })).toEqual({
      a: { zonaId: "zona-1" },
      b: { zonaId: "zona-2" },
    });
  });

  it("el formato nuevo trae la coordenada", () => {
    const r = parsearUbicaciones({ a: { zonaId: "z1", lat: -9.855, lng: -75.021 } });
    expect(r.a).toEqual({ zonaId: "z1", lat: -9.855, lng: -75.021 });
  });

  it("los dos formatos conviven en el mismo mapa", () => {
    const r = parsearUbicaciones({ a: "z1", b: { zonaId: "z2", lat: -9.8, lng: -75 } });
    expect(r.a).toEqual({ zonaId: "z1" });
    expect(r.b.lat).toBe(-9.8);
  });

  it("⚠️ media coordenada no viaja: sin las dos, se ignoran ambas", () => {
    expect(parsearUbicaciones({ a: { zonaId: "z", lat: -9.8 } }).a).toEqual({ zonaId: "z" });
    expect(parsearUbicaciones({ a: { zonaId: "z", lng: -75 } }).a).toEqual({ zonaId: "z" });
  });

  it("descarta coordenadas imposibles pero conserva la zona", () => {
    expect(parsearUbicaciones({ a: { zonaId: "z", lat: 999, lng: -75 } }).a).toEqual({ zonaId: "z" });
    expect(parsearUbicaciones({ a: { zonaId: "z", lat: Number.NaN, lng: -75 } }).a).toEqual({ zonaId: "z" });
  });

  it("una entrada corrupta no tira las demás", () => {
    const r = parsearUbicaciones({ a: "z1", "": "z2", b: null, c: 42, d: { sinZona: 1 }, e: { zonaId: "z5" } });
    expect(Object.keys(r).sort()).toEqual(["a", "e"]);
  });

  it("basura devuelve un mapa vacío, no revienta", () => {
    expect(parsearUbicaciones(null)).toEqual({});
    expect(parsearUbicaciones("texto")).toEqual({});
    expect(parsearUbicaciones(undefined)).toEqual({});
  });

  it("la vista por zona es la que consume el resto del módulo", () => {
    const ubis: Record<string, Ubicacion> = { a: { zonaId: "z1", lat: -9, lng: -75 }, b: { zonaId: "z2" } };
    expect(soloZonas(ubis)).toEqual({ a: "z1", b: "z2" });
  });

  it("redondea a ~1 cm", () => {
    expect(redondearCoord(-9.85512345678)).toBe(-9.8551235);
  });
});

describe("mover una pila", () => {
  const base: Record<string, Ubicacion> = { a: { zonaId: "z1", lat: -9.855, lng: -75.021 } };

  it("mover DENTRO de la misma zona actualiza el punto", () => {
    const r = aplicarUbicacion(base, "a", "z1", { lat: -9.8551, lng: -75.0211 });
    expect(r.a).toEqual({ zonaId: "z1", lat: -9.8551, lng: -75.0211 });
  });

  it("⭐ cambiar de zona BORRA la coordenada vieja", () => {
    const r = aplicarUbicacion(base, "a", "z2");
    expect(r.a).toEqual({ zonaId: "z2" });
  });

  it("re-ubicar en la misma zona sin punto CONSERVA el que tenía", () => {
    const r = aplicarUbicacion(base, "a", "z1");
    expect(r.a).toEqual({ zonaId: "z1", lat: -9.855, lng: -75.021 });
  });

  it("desubicar borra la entrada entera", () => {
    expect(aplicarUbicacion(base, "a", null)).toEqual({});
  });

  it("una coordenada imposible no se guarda, pero la zona sí", () => {
    const r = aplicarUbicacion({}, "a", "z1", { lat: 500, lng: -75 });
    expect(r.a).toEqual({ zonaId: "z1" });
  });

  it("no muta el mapa que recibe", () => {
    const original = { ...base };
    aplicarUbicacion(base, "a", "z9");
    expect(base).toEqual(original);
  });

  it("un entryId o zonaId vacíos no cambian nada", () => {
    expect(aplicarUbicacion(base, "  ", "z2")).toEqual(base);
    expect(aplicarUbicacion(base, "a", "   ")).toEqual(base);
  });
});
