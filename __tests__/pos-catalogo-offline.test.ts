import { describe, expect, it } from "vitest";
import { edadCatalogo, guardarCatalogo, leerCatalogo, TOPE_CATALOGO_BYTES } from "@/components/admin/pos/pos-catalogo-offline";

function almacenFalso(lleno = false) {
  const datos = new Map<string, string>();
  return {
    datos,
    getItem: (k: string) => datos.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (lleno) throw new Error("QuotaExceededError");
      datos.set(k, v);
    },
  };
}

describe("catálogo del POS sin conexión", () => {
  it("guarda y devuelve la misma lista con la hora", () => {
    const a = almacenFalso();
    const ahora = new Date("2026-10-08T15:32:00.000Z");
    expect(guardarCatalogo("buleje-main-pos-catalogo", [{ id: 1, name: "Leche" }], ahora, a)).toBe(true);
    expect(leerCatalogo("buleje-main-pos-catalogo", a)).toEqual({ items: [{ id: 1, name: "Leche" }], guardadoEn: ahora.toISOString() });
  });

  it("cada negocio tiene su clave: no se cruzan", () => {
    const a = almacenFalso();
    guardarCatalogo("buleje-main-pos-catalogo", [{ id: 1 }], new Date(), a);
    expect(leerCatalogo("buleje-otro-pos-catalogo", a)).toBeNull();
  });

  it("no pisa el respaldo con una lista vacía", () => {
    const a = almacenFalso();
    guardarCatalogo("k", [{ id: 1 }], new Date(), a);
    expect(guardarCatalogo("k", [], new Date(), a)).toBe(false);
    expect(leerCatalogo<{ id: number }>("k", a)?.items).toHaveLength(1);
  });

  it("si no entra (cuota llena o muy grande) devuelve false sin romper", () => {
    expect(guardarCatalogo("k", [{ id: 1 }], new Date(), almacenFalso(true))).toBe(false);
    const enorme = [{ texto: "x".repeat(TOPE_CATALOGO_BYTES) }];
    expect(guardarCatalogo("k", enorme, new Date(), almacenFalso())).toBe(false);
  });

  it("lo dañado o ajeno se ignora", () => {
    const a = almacenFalso();
    a.datos.set("k", "{no es json");
    expect(leerCatalogo("k", a)).toBeNull();
    a.datos.set("k", JSON.stringify({ items: "x", guardadoEn: 1 }));
    expect(leerCatalogo("k", a)).toBeNull();
    expect(leerCatalogo("k", null)).toBeNull();
  });
});

describe("edad de la lista guardada (hora de Lima)", () => {
  const ahora = new Date("2026-10-08T20:00:00.000Z"); // jueves 08/10, 15:00 en Lima

  it("de hoy: sólo la hora, sin aviso fuerte", () => {
    expect(edadCatalogo("2026-10-08T15:32:00.000Z", ahora)).toMatchObject({ deHoy: true, viejo: false, etiqueta: "de las 10:32" });
  });

  it("de ayer en la noche (menos de 24 h): muestra el día para que no parezca de hoy", () => {
    // 22:00 del miércoles en Lima = 03:00 UTC del jueves: el día se cuenta en Lima, no en UTC.
    expect(edadCatalogo("2026-10-08T03:00:00.000Z", ahora)).toMatchObject({ deHoy: false, viejo: false, etiqueta: "del miércoles 07/10 · 22:00" });
  });

  it("de hace una semana: aviso fuerte", () => {
    const e = edadCatalogo("2026-10-01T14:00:00.000Z", ahora);
    expect(e).toMatchObject({ deHoy: false, viejo: true, etiqueta: "del jueves 01/10 · 09:00", dia: "jueves 01/10" });
    expect(Math.round(e.horas)).toBe(174);
  });
});
