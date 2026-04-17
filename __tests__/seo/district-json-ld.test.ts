/**
 * Tests unitarios — helpers JSON-LD para distritos.
 *
 * Verifica:
 *  1. `generateDistrictLandingLD` emite `@context: schema.org` + AreaServed Place
 *     con lat/lon del distrito.
 *  2. `generateDistrictCategoryLD` emite ItemList con `areaServed` Place distrital
 *     en cada Offer.
 *  3. `districtBreadcrumbs` encadena Buleje → Zona → Distrito → Categoria (opcional).
 *  4. URLs coherentes con BASE_URL (canonical consistency).
 *
 * ADR: docs/adr/060-programmatic-seo-districts.md
 */

import { describe, it, expect } from "vitest";
import {
  generateDistrictLandingLD,
  generateDistrictCategoryLD,
  districtBreadcrumbs,
} from "@/lib/seo/json-ld";
import { zones } from "@/data/zones";

const sampleDistrict = {
  slug: "yarinacocha",
  name: "Yarinacocha",
  cityslug: "pucallpa",
  geo: { lat: -8.3086, lon: -74.5858 },
  description: "Yarinacocha combina turismo y comercio en Pucallpa.",
};
const sampleZone = zones.find((z) => z.slug === "pucallpa")!;

describe("generateDistrictLandingLD", () => {
  it("incluye @context schema.org y @type WebPage", () => {
    const ld = generateDistrictLandingLD(sampleDistrict, sampleZone);
    expect(ld["@context"]).toBe("https://schema.org");
    expect(ld["@type"]).toBe("WebPage");
  });

  it("URL coincide con el patron /zona/[ciudad]/distrito/[distrito]", () => {
    const ld = generateDistrictLandingLD(sampleDistrict, sampleZone);
    expect(ld.url).toContain("/zona/pucallpa/distrito/yarinacocha");
  });

  it("about.areaServed.geo tiene lat/lon del distrito, no de la ciudad", () => {
    const ld = generateDistrictLandingLD(sampleDistrict, sampleZone);
    const areaServed = (ld.about as { areaServed: { geo: { latitude: number; longitude: number } } })
      .areaServed;
    expect(areaServed.geo.latitude).toBeCloseTo(sampleDistrict.geo.lat, 2);
    expect(areaServed.geo.longitude).toBeCloseTo(sampleDistrict.geo.lon, 2);
  });

  it("containedInPlace encadena Ciudad → Region", () => {
    const ld = generateDistrictLandingLD(sampleDistrict, sampleZone);
    const place = (
      ld.about as {
        areaServed: {
          containedInPlace: {
            name: string;
            containedInPlace: { name: string };
          };
        };
      }
    ).areaServed.containedInPlace;
    expect(place.name).toBe(sampleZone.name);
    expect(place.containedInPlace.name).toBe(sampleZone.region);
  });
});

describe("generateDistrictCategoryLD", () => {
  const sampleProducts = [
    {
      name: "Arroz Extra",
      price: 4.5,
      image: "/img/arroz.jpg",
      url: "https://www.buleje.pe/tienda/arroz-extra",
    },
    {
      name: "Aceite Primor",
      price: 12.9,
      image: "https://cdn.example.com/aceite.jpg",
      url: "https://www.buleje.pe/tienda/aceite-primor",
    },
  ];

  it("emite ItemList con el nombre distrito+categoria", () => {
    const ld = generateDistrictCategoryLD(
      sampleDistrict,
      sampleZone,
      "Abarrotes",
      sampleProducts,
    );
    expect(ld["@type"]).toBe("ItemList");
    expect(ld.name).toContain("Abarrotes");
    expect(ld.name).toContain(sampleDistrict.name);
    expect(ld.name).toContain(sampleZone.name);
  });

  it("cada Offer tiene areaServed Place con lat/lon distrital", () => {
    const ld = generateDistrictCategoryLD(
      sampleDistrict,
      sampleZone,
      "Abarrotes",
      sampleProducts,
    );
    const items = ld.itemListElement as Array<{
      item: { offers: { areaServed: { geo: { latitude: number; longitude: number } } } };
    }>;
    expect(items.length).toBe(2);
    for (const entry of items) {
      const geo = entry.item.offers.areaServed.geo;
      expect(geo.latitude).toBeCloseTo(sampleDistrict.geo.lat, 2);
      expect(geo.longitude).toBeCloseTo(sampleDistrict.geo.lon, 2);
    }
  });

  it("numberOfItems matches products length", () => {
    const ld = generateDistrictCategoryLD(
      sampleDistrict,
      sampleZone,
      "Abarrotes",
      sampleProducts,
    );
    expect(ld.numberOfItems).toBe(2);
  });

  it("slicea en 30 items maximo para evitar payload enorme", () => {
    const many = Array.from({ length: 50 }, (_, i) => ({
      name: `Prod ${i}`,
      price: 1,
      image: "/x.jpg",
      url: "/x",
    }));
    const ld = generateDistrictCategoryLD(
      sampleDistrict,
      sampleZone,
      "Abarrotes",
      many,
    );
    const items = ld.itemListElement as unknown[];
    expect(items.length).toBe(30);
    expect(ld.numberOfItems).toBe(50); // contador refleja total real
  });

  it("imagen relativa se prefija con BASE_URL, absoluta se respeta", () => {
    const ld = generateDistrictCategoryLD(
      sampleDistrict,
      sampleZone,
      "Abarrotes",
      sampleProducts,
    );
    const items = ld.itemListElement as Array<{ item: { image: string } }>;
    // /img/arroz.jpg -> se prefija con BASE_URL
    expect(items[0].item.image).toMatch(/^https?:\/\//);
    expect(items[0].item.image).toContain("/img/arroz.jpg");
    // https://cdn.example.com/... -> respeta tal cual
    expect(items[1].item.image).toBe("https://cdn.example.com/aceite.jpg");
  });
});

describe("districtBreadcrumbs", () => {
  it("sin categoria encadena Buleje → Zona → Distrito (3 niveles)", () => {
    const crumbs = districtBreadcrumbs(sampleDistrict, sampleZone);
    expect(crumbs.length).toBe(3);
    expect(crumbs[0].name).toBe("Buleje");
    expect(crumbs[1].name).toBe(sampleZone.name);
    expect(crumbs[2].name).toBe(sampleDistrict.name);
  });

  it("con categoria añade 4to nivel", () => {
    const crumbs = districtBreadcrumbs(sampleDistrict, sampleZone, {
      id: "abarrotes",
      label: "Abarrotes",
    });
    expect(crumbs.length).toBe(4);
    expect(crumbs[3].name).toBe("Abarrotes");
    expect(crumbs[3].url).toContain("/zona/pucallpa/distrito/yarinacocha/abarrotes");
  });

  it("URLs usan patron consistente /zona/[ciudad]/distrito/[distrito]/...", () => {
    const crumbs = districtBreadcrumbs(sampleDistrict, sampleZone, {
      id: "abarrotes",
      label: "Abarrotes",
    });
    expect(crumbs[2].url).toMatch(
      /\/zona\/pucallpa\/distrito\/yarinacocha$/,
    );
    expect(crumbs[3].url).toMatch(
      /\/zona\/pucallpa\/distrito\/yarinacocha\/abarrotes$/,
    );
  });
});
