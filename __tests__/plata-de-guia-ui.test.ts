/**
 * ADR-437 — las piezas puras de la UI de «Plata de la guía»: el aviso de la
 * tira por proveedor, el filtro «Pago» de la cabecera y el rótulo del
 * duplicado de una liquidación en Mi Plata.
 */
import { describe, expect, it } from "vitest";
import { pendientesDelLibro, type DatosPendientes } from "@/lib/forestal/ctp-pendientes";
import { aplicarFiltrosColumna, textosDeFiltrosColumna } from "@/lib/forestal/ingresos-filtros-columna";
import { textoDuplicado } from "@/components/admin/compras/historial/shared";

const BASE: DatosPendientes = {
  ingresosPendientes: 0, fueraDePlazo: 0, guiasSinIngresar: 0, despachosSinGtf: 0,
  despachosSinAnexo: 0, corridasSinOrigen: 0, saldosNegativos: 0,
};

describe("tira: guías sin pagar (ADR-437 §10)", () => {
  it("una línea por proveedor, con plata y salto a Ingresos filtrado", () => {
    const lista = pendientesDelLibro({
      ...BASE,
      guiasSinPagar: [
        { parteId: "p1", parteNombre: "Nelly", guias: 3, pendiente: 12400, gtfNumbers: ["a", "b", "c"], desde: "2026-09-10", nivel: "pendiente" },
        { parteId: "p2", parteNombre: "Santa Rosa", guias: 1, pendiente: 900, gtfNumbers: ["d"], desde: "2026-08-01", nivel: "atrasado" },
      ],
    });
    const nelly = lista.find((p) => p.clave === "guias-sin-pagar:p1");
    expect(nelly?.titulo).toMatch(/^3 guías sin pagar a Nelly · S\/\s?12,400\.00$/);
    expect(nelly).toMatchObject({ urgencia: "pendiente", vista: "ingresos", filtro: "sin-pagar", cantidad: 3 });
    expect(lista.find((p) => p.clave === "guias-sin-pagar:p2")?.urgencia).toBe("atrasado");
    // Nunca traba el cierre.
    expect(lista.some((p) => p.clave.startsWith("guias-sin-pagar") && p.urgencia === "bloquea")).toBe(false);
  });

  it("sin nada pendiente no aparece", () => {
    const lista = pendientesDelLibro({
      ...BASE,
      guiasSinPagar: [{ parteId: "p1", parteNombre: "Nelly", guias: 1, pendiente: 0, gtfNumbers: ["a"], desde: "2026-09-10", nivel: "pendiente" }],
    });
    expect(lista.some((p) => p.clave.startsWith("guias-sin-pagar"))).toBe(false);
  });
});

describe("filtro «Pago» de la cabecera", () => {
  it("viaja al servidor y se nombra", () => {
    const p = aplicarFiltrosColumna(new URLSearchParams(), { pago: "sin-pagar" });
    expect(p.get("pago")).toBe("sin-pagar");
    expect(textosDeFiltrosColumna({ pago: "servicio" })).toEqual(["de servicio"]);
  });
});

describe("Mi Plata: duplicado de una liquidación", () => {
  it("un LIQ dice que ya está contado en Madera", () => {
    expect(textoDuplicado("LIQ-2026-0002").corto).toBe("Ya contada en Madera · LIQ-2026-0002");
  });
  it("lo demás sigue diciendo «Ya listado como»", () => {
    expect(textoDuplicado("ADL-2026-0001").corto).toBe("Ya listado como ADL-2026-0001");
  });
});
