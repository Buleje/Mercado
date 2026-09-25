import { describe, it, expect } from "vitest";
import {
  coordsFromLocation,
  parseGpsCoords,
  haversineKm,
  getDeliveryETA,
  isWithinDeliveryZone,
  DEFAULT_STORE_LAT,
  DEFAULT_STORE_LON,
  MAX_DELIVERY_KM,
} from "@/lib/geo-utils";

describe("coordsFromLocation", () => {
  it("extrae lat/lon de un string con GPS", () => {
    const c = coordsFromLocation("Jr. Ucayali 450, GPS: -8.3791, -74.5539");
    expect(c.lat).toBeCloseTo(-8.3791, 4);
    expect(c.lon).toBeCloseTo(-74.5539, 4);
  });

  it("acepta espacios variables alrededor de las coordenadas", () => {
    const c = coordsFromLocation("Casa, GPS:  -8.4, -74.6");
    expect(c.lat).toBeCloseTo(-8.4, 1);
    expect(c.lon).toBeCloseTo(-74.6, 1);
  });

  it("usa los fallback si la ubicación no contiene GPS", () => {
    const c = coordsFromLocation("Jr. Ucayali 450", -9.1, -75.2);
    expect(c.lat).toBeCloseTo(-9.1, 4);
    expect(c.lon).toBeCloseTo(-75.2, 4);
  });

  it("usa las coords del local por defecto si no hay GPS ni fallback", () => {
    const c = coordsFromLocation("Centro Pucallpa");
    expect(c.lat).toBeCloseTo(DEFAULT_STORE_LAT, 4);
    expect(c.lon).toBeCloseTo(DEFAULT_STORE_LON, 4);
  });

  it("acepta coordenadas positivas", () => {
    const c = coordsFromLocation("GPS: 12.0464, -77.0428");
    expect(c.lat).toBeCloseTo(12.0464, 4);
    expect(c.lon).toBeCloseTo(-77.0428, 4);
  });
});

describe("parseGpsCoords (estricto — null si no hay coords reales)", () => {
  it("extrae lat/lon de un string con GPS bien formado", () => {
    const c = parseGpsCoords("Jr. Ucayali 450, GPS: -8.3791, -74.5539");
    expect(c).not.toBeNull();
    expect(c!.lat).toBeCloseTo(-8.3791, 4);
    expect(c!.lon).toBeCloseTo(-74.5539, 4);
  });

  it("devuelve null cuando NO hay marcador GPS (no cae a la bodega)", () => {
    expect(parseGpsCoords("Jr. Ucayali 450")).toBeNull();
    expect(parseGpsCoords("")).toBeNull();
  });

  it("devuelve null cuando el GPS está mal formado (sin números válidos)", () => {
    expect(parseGpsCoords("GPS: foo, bar")).toBeNull();
  });

  it("no finge la ubicación del local ante texto sin coords", () => {
    const c = parseGpsCoords("Centro Pucallpa");
    expect(c).toBeNull();
    // coordsFromLocation SÍ cae a la bodega — contraste intencional.
    expect(coordsFromLocation("Centro Pucallpa").lat).toBeCloseTo(DEFAULT_STORE_LAT, 4);
  });
});

describe("haversineKm", () => {
  it("retorna 0 cuando los dos puntos son iguales", () => {
    const d = haversineKm(-8.3791, -74.5539, -8.3791, -74.5539);
    expect(d).toBeCloseTo(0, 5);
  });

  it("calcula distancia razonable entre dos puntos cercanos (~1 km)", () => {
    // Lima ~ 1 grado de latitud = 111 km. Movemos 0.009 grados ≈ 1 km
    const d = haversineKm(-8.3791, -74.5539, -8.3701, -74.5539);
    expect(d).toBeGreaterThan(0.9);
    expect(d).toBeLessThan(1.1);
  });

  it("calcula distancia razonable Lima → Pucallpa (~474 km en línea recta)", () => {
    const lima = { lat: -12.0464, lon: -77.0428 };
    const pucallpa = { lat: -8.3791, lon: -74.5539 };
    const d = haversineKm(lima.lat, lima.lon, pucallpa.lat, pucallpa.lon);
    expect(d).toBeGreaterThan(450);
    expect(d).toBeLessThan(500);
  });
});

describe("isWithinDeliveryZone", () => {
  it("retorna inZone=true sin distancia cuando no hay GPS", () => {
    const r = isWithinDeliveryZone("Jr. Ucayali 450");
    expect(r.inZone).toBe(true);
    expect(r.distanceKm).toBeNull();
  });

  it("retorna inZone=true para coords muy cercanas al local", () => {
    // 100 metros del local
    const r = isWithinDeliveryZone("Casa, GPS: -8.3792, -74.5540");
    expect(r.inZone).toBe(true);
    expect(r.distanceKm).not.toBeNull();
    expect(r.distanceKm!).toBeLessThan(MAX_DELIVERY_KM);
  });

  it("retorna inZone=false cuando excede el radio máximo", () => {
    // 50 km de distancia → fuera de zona
    const r = isWithinDeliveryZone("Lejos, GPS: -7.9, -74.0");
    expect(r.inZone).toBe(false);
    expect(r.distanceKm).not.toBeNull();
    expect(r.distanceKm!).toBeGreaterThan(MAX_DELIVERY_KM);
  });
});

describe("getDeliveryETA", () => {
  // Helper: construir una fecha en hora Lima específica.
  // Lima es UTC-5 sin DST, así que 10:00 Lima = 15:00 UTC.
  const limaTimeAt = (hourLima: number) => new Date(Date.UTC(2026, 3, 6, hourLima + 5, 0, 0));

  it("lo-antes-posible muestra ~30-45 min en horario laboral", () => {
    const eta = getDeliveryETA("lo-antes-posible", limaTimeAt(10));
    expect(eta).toContain("30-45");
  });

  it("lo-antes-posible muestra mañana fuera de horario", () => {
    const eta = getDeliveryETA("lo-antes-posible", limaTimeAt(22));
    expect(eta.toLowerCase()).toContain("mañana");
  });

  it("retorna string vacío para slot desconocido", () => {
    expect(getDeliveryETA("inexistente")).toBe("");
  });

  it("manana: hoy si es antes de las 12, mañana si es después", () => {
    expect(getDeliveryETA("manana", limaTimeAt(9))).toContain("Hoy");
    expect(getDeliveryETA("manana", limaTimeAt(15))).toContain("Mañana");
  });

  it("tarde: hoy si es antes de 17, mañana si es después", () => {
    expect(getDeliveryETA("tarde", limaTimeAt(13))).toContain("Hoy");
    expect(getDeliveryETA("tarde", limaTimeAt(18))).toContain("Mañana");
  });

  it("noche: hoy si es antes de 20, mañana si es después", () => {
    expect(getDeliveryETA("noche", limaTimeAt(18))).toContain("Hoy");
    expect(getDeliveryETA("noche", limaTimeAt(21))).toContain("Mañana");
  });
});
