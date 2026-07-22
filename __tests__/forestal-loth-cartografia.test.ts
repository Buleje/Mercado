/**
 * loth-cartografia — referencias y cuadro de acceso del plano forestal.
 *
 * Lo que se blinda: la forma que entra por la API es la que dibuja el mapa y la
 * que se imprime en la lámina. Una referencia sin coordenada válida o un tramo
 * sin nombre ensucian un documento que va a fiscalización.
 */
import { describe, expect, it } from "vitest";
import {
  emptyCartografia,
  hasCartografia,
  normalizeCartografia,
  referenciaMeta,
  REFERENCIA_TIPOS,
} from "@/lib/forestal/loth-cartografia";

describe("normalizeCartografia", () => {
  it("acepta una referencia completa y le pone id estable", () => {
    const c = normalizeCartografia({
      referencias: [{ nombre: "C.P. Unión Siria", tipo: "centro_poblado", lat: -8.93, lng: -74.58, nota: "vía afirmada" }],
    });
    expect(c.referencias).toHaveLength(1);
    expect(c.referencias[0].id).toBe("ref-1-c-p-union-siria");
    expect(c.referencias[0].tipo).toBe("centro_poblado");
  });

  it("descarta coordenadas inválidas y el 0,0 del GPS no capturado", () => {
    const c = normalizeCartografia({
      referencias: [
        { nombre: "ok", tipo: "hito", lat: -8.9, lng: -74.5 },
        { nombre: "sin gps", tipo: "hito", lat: 0, lng: 0 },
        { nombre: "fuera del planeta", tipo: "hito", lat: 120, lng: -74.5 },
        { nombre: "texto", tipo: "hito", lat: "abc", lng: -74.5 },
      ],
    });
    expect(c.referencias.map((r) => r.nombre)).toEqual(["ok"]);
  });

  it("cae a 'hito' si el tipo no existe y nombra las referencias sin nombre", () => {
    const c = normalizeCartografia({ referencias: [{ nombre: "", tipo: "aeropuerto", lat: -8.9, lng: -74.5 }] });
    expect(c.referencias[0].tipo).toBe("hito");
    expect(c.referencias[0].nombre).toBe("Referencia 1");
  });

  it("descarta tramos de acceso sin lugar (una fila vacía no dice nada)", () => {
    const c = normalizeCartografia({
      accesos: [
        { lugar: "Puerto Bermúdez — UMF", tiempo: "30 min", movilidad: "auto-camioneta" },
        { lugar: "   ", tiempo: "10 min", movilidad: "a pie" },
      ],
    });
    expect(c.accesos).toHaveLength(1);
    expect(c.accesos[0].id).toBe("acc-1-puerto-bermudez-umf");
  });

  it("recorta el volumen: 120 referencias y 20 accesos como techo", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ nombre: `R${i}`, tipo: "hito", lat: -8.9, lng: -74.5 }));
    const acc = Array.from({ length: 50 }, (_, i) => ({ lugar: `Tramo ${i}` }));
    const c = normalizeCartografia({ referencias: many, accesos: acc });
    expect(c.referencias).toHaveLength(120);
    expect(c.accesos).toHaveLength(20);
  });

  it("tolera basura sin romperse", () => {
    expect(normalizeCartografia(null)).toEqual(emptyCartografia());
    expect(normalizeCartografia({ referencias: "x", accesos: 7 }).referencias).toHaveLength(0);
    expect(hasCartografia(emptyCartografia())).toBe(false);
    expect(hasCartografia(normalizeCartografia({ accesos: [{ lugar: "A — B" }] }))).toBe(true);
  });

  it("cada tipo de referencia tiene etiqueta y color", () => {
    for (const t of REFERENCIA_TIPOS) {
      const m = referenciaMeta(t.tipo);
      expect(m.label.length).toBeGreaterThan(2);
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(referenciaMeta("inexistente").tipo).toBe("hito");
  });
});
