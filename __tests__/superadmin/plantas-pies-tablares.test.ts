import { describe, expect, it } from "vitest";
import type { CorridaDisponible, EntradaCapacidad } from "@/lib/forestal/capacidad-de-planta";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { aserradaPlanta, ptDeAserrada, ptDeRolliza, trozasPlanta } from "@/lib/superadmin/plantas-forestales/pies-tablares";
import { periodoPorDefecto, rangoDelPeriodo, resolverPeriodo, diasDesde } from "@/lib/superadmin/plantas-forestales/periodo";

const corrida = (o: Partial<CorridaDisponible>): CorridaDisponible => ({
  id: "c",
  fecha: "2026-10-01",
  lote: null,
  producto: "Tabla",
  especie: "Cumala",
  unidad: "m3",
  disponible: 1,
  titularOrigen: [],
  gtfOrigen: [],
  paquetes: [],
  ...o,
});

describe("pies tablares (siempre derivados)", () => {
  it("la aserrada vale m³ × 424; la rolliza, lo que rendiría al 56 %", () => {
    expect(ptDeAserrada(2)).toBe(848);
    expect(ptDeRolliza(1)).toBeGreaterThan(200);
    expect(ptDeRolliza(1)).toBeLessThan(ptDeAserrada(1));
    expect(ptDeRolliza(0)).toBe(0);
  });
});

describe("aserrada de la planta", () => {
  it("suma SÓLO corridas en m³ con saldo; las de otra unidad van aparte y el libro sólo concilia", () => {
    const a = aserradaPlanta(
      [
        corrida({ id: "1", disponible: 2, paquetes: [{ codigo: "P1", volumenM3: 1 }, { codigo: "P2", volumenM3: 1 }] }),
        corrida({ id: "2", disponible: 1.5, producto: "Viga" }),
        corrida({ id: "3", disponible: 0 }),
        corrida({ id: "4", disponible: 300, unidad: "pt" }),
      ],
      62,
    );
    expect(a.disponibleM3).toBe(3.5);
    expect(a.disponiblePt).toBe(ptDeAserrada(3.5));
    expect(a.corridas).toBe(2);
    expect(a.paquetes).toBe(2);
    expect(a.enOtraUnidad).toEqual([{ unidad: "pt", cantidad: 300, corridas: 1 }]);
    expect(a.libroFirmaM3).toBe(62);
    expect(a.porProducto.map((p) => p.producto)).toEqual(["Tabla", "Viga"]);
  });
});

describe("trozas de la planta", () => {
  const troza = (o: Partial<TrozaConsumible>): TrozaConsumible =>
    ({ id: "t", woodEntryId: "w", codificacion: null, especieComun: "Cumala", volumenM3: 1, ...o }) as TrozaConsumible;

  it("patio = libres en guía recibida; por recepcionar suma también los ingresos sin piezas", () => {
    const entrada: EntradaCapacidad = {
      patio: [
        troza({ id: "a", guiaRecepcionada: true, volumenM3: 1.2 }),
        troza({ id: "b", guiaRecepcionada: true, volumenM3: 0.8, consumidaEnId: "x" }),
        troza({ id: "c", guiaRecepcionada: false, volumenM3: 0.5 }),
      ],
      lotes: [],
      stockLibroM3: 0,
      pendienteSinPiezasM3: 3,
    };
    const t = trozasPlanta(entrada, { piezas: 4, m3: 2.5, dias: 60 });
    expect(t.enPatio.piezas).toBe(1);
    expect(t.enPatio.m3).toBe(1.2);
    expect(t.enPatio.ptAserrable).toBe(ptDeRolliza(1.2));
    expect(t.porRecepcionar.piezas).toBe(1);
    expect(t.porRecepcionar.m3).toBe(3.5);
    expect(t.pendienteSinPiezasM3).toBe(3);
    expect(t.varadas).toEqual({ piezas: 4, m3: 2.5, dias: 60 });
  });
});

describe("período", () => {
  it("por omisión, el trimestre que termina este mes (días de Lima)", () => {
    expect(periodoPorDefecto("2026-10-17")).toEqual({ desde: "2026-08-01", hasta: "2026-10-31" });
    expect(periodoPorDefecto("2026-02-03")).toEqual({ desde: "2025-12-01", hasta: "2026-02-28" });
  });

  it("completa lo que falta y rechaza un rango al revés", () => {
    expect(resolverPeriodo({ desde: "2026-09-01" }, "2026-10-17")).toEqual({
      ok: true,
      periodo: { desde: "2026-09-01", hasta: "2026-10-31" },
    });
    expect(resolverPeriodo({ desde: "2026-10-02", hasta: "2026-10-01" }).ok).toBe(false);
  });

  it("los bordes son medianoche de Lima (-05:00)", () => {
    const r = rangoDelPeriodo({ desde: "2026-10-01", hasta: "2026-10-31" });
    expect(r.fromDate.toISOString()).toBe("2026-10-01T05:00:00.000Z");
    expect(r.toDate.toISOString()).toBe("2026-11-01T04:59:59.999Z");
  });

  it("días sin actividad: null sin fecha, nunca negativos", () => {
    const ahora = new Date("2026-10-17T12:00:00Z");
    expect(diasDesde(null, ahora)).toBeNull();
    expect(diasDesde("2026-10-07T12:00:00Z", ahora)).toBe(10);
    expect(diasDesde("2026-10-18T12:00:00Z", ahora)).toBe(0);
  });
});
