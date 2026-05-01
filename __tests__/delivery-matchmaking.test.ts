/**
 * __tests__/delivery-matchmaking.test.ts
 *
 * Unit tests para lib/delivery/matchmaking.ts. Sin DB.
 * Lock down comportamiento: filtros, score, ranking, exclusiones.
 */

import { describe, it, expect } from "vitest";
import {
  haversineKm,
  scorePartner,
  findNearestPartners,
  computeOfferFee,
  type PartnerCandidate,
  type RankedPartner,
} from "@/lib/delivery/matchmaking";

const BASE_LAT = -8.379;
const BASE_LNG = -74.553;
const NOW = new Date("2026-04-30T20:00:00Z").getTime();

function mkPartner(overrides: Partial<PartnerCandidate> = {}): PartnerCandidate {
  return {
    id: "p1",
    name: "Test",
    phone: "999",
    lat: BASE_LAT,
    lng: BASE_LNG,
    isOnline: true,
    lastPingAt: new Date(NOW - 60_000), // 1min ago
    currentOrderId: null,
    rating: 5,
    acceptanceRate: 1,
    maxRadiusKm: 5,
    fee: 5,
    vehicleType: "moto",
    ...overrides,
  };
}

describe("haversineKm", () => {
  it("returns 0 for same point", () => {
    expect(haversineKm(0, 0, 0, 0)).toBe(0);
  });

  it("approx 1.11 km per degree lat", () => {
    const km = haversineKm(0, 0, 0.01, 0);
    expect(km).toBeGreaterThan(1.1);
    expect(km).toBeLessThan(1.12);
  });

  it("works for negative coords (Pucallpa)", () => {
    const km = haversineKm(-8.379, -74.553, -8.389, -74.553);
    expect(km).toBeGreaterThan(1.1);
    expect(km).toBeLessThan(1.12);
  });
});

describe("scorePartner", () => {
  it("perfect partner has score near 0", () => {
    const p: RankedPartner = {
      ...mkPartner(),
      distanceKm: 0,
      score: 0,
    };
    expect(scorePartner(p)).toBeLessThan(0.05);
  });

  it("worst partner has score near 1", () => {
    const p: RankedPartner = {
      ...mkPartner({ rating: 0, acceptanceRate: 0, maxRadiusKm: 5 }),
      distanceKm: 5,
      score: 0,
    };
    expect(scorePartner(p)).toBeGreaterThan(0.99);
  });

  it("distance dominates over rating (60% weight)", () => {
    // Far but perfect rating
    const farPerfect: RankedPartner = {
      ...mkPartner(),
      distanceKm: 4,
      score: 0,
    };
    // Close but bad rating
    const closeBad: RankedPartner = {
      ...mkPartner({ rating: 1, acceptanceRate: 0.5 }),
      distanceKm: 0.5,
      score: 0,
    };
    expect(scorePartner(closeBad)).toBeLessThan(scorePartner(farPerfect));
  });
});

describe("findNearestPartners — filtros", () => {
  it("excludes offline partners", () => {
    const partners = [mkPartner({ id: "online" }), mkPartner({ id: "offline", isOnline: false })];
    const result = findNearestPartners(BASE_LAT, BASE_LNG, partners, { now: NOW });
    expect(result.map((p) => p.id)).toEqual(["online"]);
  });

  it("excludes partners with currentOrderId set", () => {
    const partners = [
      mkPartner({ id: "free" }),
      mkPartner({ id: "busy", currentOrderId: "ord-1" }),
    ];
    const result = findNearestPartners(BASE_LAT, BASE_LNG, partners, { now: NOW });
    expect(result.map((p) => p.id)).toEqual(["free"]);
  });

  it("excludes partners with stale lastPingAt (> 5min)", () => {
    const partners = [
      mkPartner({ id: "fresh" }),
      mkPartner({ id: "stale", lastPingAt: new Date(NOW - 10 * 60_000) }),
    ];
    const result = findNearestPartners(BASE_LAT, BASE_LNG, partners, { now: NOW });
    expect(result.map((p) => p.id)).toEqual(["fresh"]);
  });

  it("excludes partners outside maxRadiusKm", () => {
    const partners = [
      mkPartner({ id: "near", lat: BASE_LAT + 0.01, lng: BASE_LNG }),
      mkPartner({ id: "far", lat: BASE_LAT + 0.5, lng: BASE_LNG, maxRadiusKm: 5 }),
    ];
    const result = findNearestPartners(BASE_LAT, BASE_LNG, partners, { now: NOW });
    expect(result.map((p) => p.id)).toEqual(["near"]);
  });

  it("excludes partners without lat/lng", () => {
    const partners = [
      mkPartner({ id: "withGps" }),
      mkPartner({ id: "noGps", lat: null, lng: null }),
    ];
    const result = findNearestPartners(BASE_LAT, BASE_LNG, partners, { now: NOW });
    expect(result.map((p) => p.id)).toEqual(["withGps"]);
  });

  it("excludes partners in excludePartnerIds (anti-loop)", () => {
    const partners = [mkPartner({ id: "a" }), mkPartner({ id: "b" })];
    const result = findNearestPartners(BASE_LAT, BASE_LNG, partners, {
      now: NOW,
      excludePartnerIds: ["a"],
    });
    expect(result.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("findNearestPartners — ranking", () => {
  it("sorts closest+highest-rating first", () => {
    const partners = [
      mkPartner({ id: "far", lat: BASE_LAT + 0.03, rating: 5 }), // ~3.3km
      mkPartner({ id: "close", lat: BASE_LAT + 0.005, rating: 5 }), // ~0.5km
      mkPartner({ id: "mid", lat: BASE_LAT + 0.015, rating: 5 }), // ~1.6km
    ];
    const result = findNearestPartners(BASE_LAT, BASE_LNG, partners, { now: NOW });
    expect(result.map((p) => p.id)).toEqual(["close", "mid", "far"]);
  });

  it("limits to opts.limit", () => {
    const partners = Array.from({ length: 10 }, (_, i) =>
      mkPartner({ id: `p${i}`, lat: BASE_LAT + 0.001 * (i + 1) }),
    );
    const result = findNearestPartners(BASE_LAT, BASE_LNG, partners, { now: NOW, limit: 3 });
    expect(result).toHaveLength(3);
  });

  it("computes distanceKm and score on each result", () => {
    const partners = [mkPartner({ id: "p1", lat: BASE_LAT + 0.005 })];
    const result = findNearestPartners(BASE_LAT, BASE_LNG, partners, { now: NOW });
    expect(result[0].distanceKm).toBeGreaterThan(0.5);
    expect(result[0].distanceKm).toBeLessThan(0.6);
    expect(result[0].score).toBeGreaterThan(0);
    expect(result[0].score).toBeLessThan(1);
  });
});

describe("computeOfferFee", () => {
  it("default formula: 5 + 1.5*km", () => {
    expect(computeOfferFee(0)).toBe(5);
    expect(computeOfferFee(2)).toBe(8);
    expect(computeOfferFee(4)).toBe(11);
  });

  it("rounds to 2 decimals", () => {
    expect(computeOfferFee(1.333)).toBe(7); // 5 + 1.9995 = 6.9995 → 7.0
  });

  it("accepts custom base + perKm", () => {
    expect(computeOfferFee(2, 10, 2)).toBe(14);
  });
});
