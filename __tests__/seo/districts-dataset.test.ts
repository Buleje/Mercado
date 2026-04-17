/**
 * Tests unitarios — dataset `data/districts.ts` (Programmatic SEO hiperlocal).
 *
 * Verifica:
 *  1. Integridad estructural: todo distrito apunta a una zona existente.
 *  2. Unicidad de slugs dentro de la misma ciudad (no colisiones de URL).
 *  3. Cobertura: toda zona con `districts[]` declarados en `zones.ts` tiene
 *     al menos 1 entrada distrital.
 *  4. FAQs per-distrito devuelven >= 3 items y ninguno vacio.
 *  5. Geo coherente (lat/lon dentro de Peru).
 *
 * ADR: docs/adr/060-programmatic-seo-districts.md
 */

import { describe, it, expect } from "vitest";
import {
  districts,
  findDistrict,
  getDistrictsForCity,
  getZoneForDistrict,
  getDistrictFAQs,
  type District,
} from "@/data/districts";
import { zones } from "@/data/zones";

describe("data/districts — structural integrity", () => {
  it("tiene >= 50 distritos declarados", () => {
    expect(districts.length).toBeGreaterThanOrEqual(50);
  });

  it("todo distrito tiene slug kebab-case sin acentos", () => {
    for (const d of districts) {
      expect(d.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("todo distrito apunta a una zona existente en zones.ts", () => {
    const citySlugs = new Set(zones.map((z) => z.slug));
    for (const d of districts) {
      expect(citySlugs.has(d.cityslug)).toBe(true);
    }
  });

  it("no hay colisiones de slug dentro de la misma ciudad", () => {
    const seen = new Map<string, Set<string>>();
    for (const d of districts) {
      if (!seen.has(d.cityslug)) seen.set(d.cityslug, new Set());
      const slugsInCity = seen.get(d.cityslug)!;
      expect(slugsInCity.has(d.slug)).toBe(false);
      slugsInCity.add(d.slug);
    }
  });

  it("lat/lon dentro de bounding box de Peru (aproximado)", () => {
    for (const d of districts) {
      // Peru: lat ~ [-18.5, 0], lon ~ [-81, -68]
      expect(d.geo.lat).toBeGreaterThanOrEqual(-18.5);
      expect(d.geo.lat).toBeLessThanOrEqual(0);
      expect(d.geo.lon).toBeGreaterThanOrEqual(-81);
      expect(d.geo.lon).toBeLessThanOrEqual(-68);
    }
  });

  it("cada distrito tiene descripcion >= 80 chars (signal SEO textual)", () => {
    for (const d of districts) {
      expect(d.description.length).toBeGreaterThanOrEqual(80);
    }
  });
});

describe("data/districts — coverage per city", () => {
  it("Pucallpa tiene los 4 distritos declarados en zones.ts", () => {
    const pucallpaDistricts = getDistrictsForCity("pucallpa");
    expect(pucallpaDistricts.length).toBeGreaterThanOrEqual(4);
  });

  it("Lima tiene al menos 6 distritos (SJL, Comas, VES, SMP, Los Olivos, Ate/Callao)", () => {
    const limaDistricts = getDistrictsForCity("lima");
    expect(limaDistricts.length).toBeGreaterThanOrEqual(6);
  });

  it("Arequipa tiene los 5 distritos declarados en zones.ts", () => {
    const arequipaDistricts = getDistrictsForCity("arequipa");
    expect(arequipaDistricts.length).toBeGreaterThanOrEqual(5);
  });
});

describe("data/districts — helpers", () => {
  it("findDistrict retorna el distrito correcto por (citySlug, districtSlug)", () => {
    const yarinacocha = findDistrict("pucallpa", "yarinacocha");
    expect(yarinacocha).toBeDefined();
    expect(yarinacocha?.name).toBe("Yarinacocha");
  });

  it("findDistrict retorna undefined para combo inexistente", () => {
    expect(findDistrict("pucallpa", "inexistente")).toBeUndefined();
    expect(findDistrict("ciudad-fantasma", "yarinacocha")).toBeUndefined();
  });

  it("getZoneForDistrict retorna la zona padre", () => {
    const yarinacocha = findDistrict("pucallpa", "yarinacocha")!;
    const zone = getZoneForDistrict(yarinacocha);
    expect(zone?.slug).toBe("pucallpa");
    expect(zone?.region).toBe("Ucayali");
  });

  it("getDistrictsForCity retorna array vacio para ciudad sin distritos", () => {
    expect(getDistrictsForCity("ciudad-inexistente")).toEqual([]);
  });
});

describe("data/districts — FAQ generator", () => {
  const sampleDistrict: District = {
    slug: "yarinacocha",
    name: "Yarinacocha",
    cityslug: "pucallpa",
    geo: { lat: -8.3086, lon: -74.5858 },
    description:
      "Yarinacocha combina turismo y comercio. Las bodegas del Puerto Callao usan Buleje para vender abarrotes con delivery.",
  };
  const sampleZone = zones.find((z) => z.slug === "pucallpa")!;

  it("getDistrictFAQs devuelve al menos 4 items", () => {
    const faqs = getDistrictFAQs(sampleDistrict, sampleZone);
    expect(faqs.length).toBeGreaterThanOrEqual(4);
  });

  it("cada FAQ tiene question y answer no vacios", () => {
    const faqs = getDistrictFAQs(sampleDistrict, sampleZone);
    for (const f of faqs) {
      expect(f.question.length).toBeGreaterThan(10);
      expect(f.answer.length).toBeGreaterThan(30);
    }
  });

  it("al menos 1 FAQ menciona el nombre del distrito (hyperlocal signal)", () => {
    const faqs = getDistrictFAQs(sampleDistrict, sampleZone);
    const mentionsDistrict = faqs.some(
      (f) =>
        f.question.includes(sampleDistrict.name) ||
        f.answer.includes(sampleDistrict.name),
    );
    expect(mentionsDistrict).toBe(true);
  });

  it("al menos 1 FAQ menciona Yape/Plin (local-PE payment signal)", () => {
    const faqs = getDistrictFAQs(sampleDistrict, sampleZone);
    const mentionsYape = faqs.some(
      (f) => f.answer.includes("Yape") || f.question.includes("Yape"),
    );
    expect(mentionsYape).toBe(true);
  });
});
