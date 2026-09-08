import { describe, expect, it } from "vitest";
import type { CorridaDelLote, LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { SniffsRefLote } from "@/lib/forestal/sniffs-produccion-parse";
import { lotesQueNoCuadran } from "@/components/admin/forestal/CtpCuadreSniffsModal";
import { corridaAcompletar, detalleGuardado } from "@/components/admin/forestal/CtpDeclararDesdeSniffs";

/**
 * La mesa «qué no cuadra con el SNIFFS» y lo que hace falta para resolverlo
 * (ADR-398): qué lotes entran, en qué orden, y cuál es la corrida que espera su
 * producción.
 */

function corrida(extra: Partial<CorridaDelLote> = {}): CorridaDelLote {
  return {
    id: "c1",
    lineNo: 10,
    entryDate: "2026-08-04T00:00:00.000Z",
    productType: "MADERA ASERRADA",
    quantity: 3,
    volumeInputM3: 10,
    unit: "m3",
    status: "registrado",
    viva: true,
    ...extra,
  };
}

function ref(extra: Partial<SniffsRefLote> = {}): SniffsRefLote {
  return {
    lote: "18-2026",
    fechaInicio: "2026-08-01",
    fechaFin: null,
    especieCientifica: "Cedrelinga cateniformis",
    especieComun: "TORNILLO",
    volumenConsumidoM3: 10,
    productos: [
      { productType: "MADERA ASERRADA (TABLA)", productoCrudo: "MADERA ASERRADA (TABLA)", volumenM3: 3, pctAprovechado: 30 },
    ],
    leidoEn: "2026-09-08T12:00:00.000Z",
    fuente: "captura",
    ...extra,
  };
}

function lote(id: string, extra: Partial<LoteAserrio> = {}): LoteAserrio {
  return {
    id,
    code: `LA-2026-${id}`,
    speciesCommon: "Tornillo",
    speciesScientific: "Cedrelinga cateniformis",
    status: "consumido",
    notes: null,
    fechaApertura: "2026-08-01T00:00:00.000Z",
    fechaConsumo: "2026-08-04T00:00:00.000Z",
    produccionEntryId: "c1",
    piezas: 0,
    volumenM3: 10,
    trozas: [],
    ...extra,
  };
}

describe("lotesQueNoCuadran", () => {
  it("deja fuera los que cuadran y los que nunca vinieron del SNIFFS", () => {
    const filas = lotesQueNoCuadran([
      lote("a", { produccion: corrida({ quantity: 3 }), sniffs: ref() }), // cuadra
      lote("b", { produccion: corrida({ quantity: 3 }) }), // sin referencia
    ]);
    expect(filas).toEqual([]);
  });

  it("ordena por lo que pesa: primero la diferencia más grande", () => {
    const filas = lotesQueNoCuadran([
      lote("chico", { produccion: corrida({ quantity: 2.5 }), sniffs: ref() }), // difiere 0.5
      lote("grande", { produccion: corrida({ quantity: null }), sniffs: ref() }), // pendiente 3
      lote("medio", { produccion: corrida({ quantity: 1 }), sniffs: ref() }), // difiere 2
    ]);
    expect(filas.map((f) => f.lote.id)).toEqual(["grande", "medio", "chico"]);
    expect(filas.map((f) => f.peso)).toEqual([3, 2, 0.5]);
  });

  it("un pendiente pesa lo que el SNIFFS declaró entero, no una fracción", () => {
    const [fila] = lotesQueNoCuadran([lote("a", { produccion: corrida({ quantity: null }), sniffs: ref() })]);
    expect(fila.cuadre.estado).toBe("pendiente");
    expect(fila.peso).toBe(3);
    expect(fila.resoluble).toBe(true);
  });

  it("marca NO resoluble el lote sin corrida viva: ahí no hay nada que declarar", () => {
    const [fila] = lotesQueNoCuadran([
      lote("a", { produccion: corrida({ quantity: 1, viva: false }), corridas: [], sniffs: ref() }),
    ]);
    expect(fila.resoluble).toBe(false);
  });

  it("el descuadre de consumido entra aunque lo producido no se pueda comparar", () => {
    const [fila] = lotesQueNoCuadran([
      lote("a", { produccion: corrida({ quantity: 3 }), sniffs: ref({ productos: [], volumenConsumidoM3: 25 }) }),
    ]);
    expect(fila.cuadre.estado).toBe("difiere");
    expect(fila.peso).toBe(15);
  });
});

describe("corridaAcompletar", () => {
  it("prefiere la que no declaró nada: es la deuda más grande", () => {
    const l = lote("a", {
      corridas: [corrida({ id: "vieja", quantity: 2 }), corrida({ id: "nueva", lineNo: 11, quantity: null })],
    });
    expect(corridaAcompletar(l)?.id).toBe("nueva");
  });

  it("si todas declararon, toma la que tiene producción para ampliar", () => {
    const l = lote("a", { corridas: [corrida({ id: "unica", quantity: 2 })] });
    expect(corridaAcompletar(l)?.id).toBe("unica");
  });

  it("ignora la anulada, la de otra unidad y la que no tiene materia prima", () => {
    expect(corridaAcompletar(lote("a", { corridas: [corrida({ viva: false })], produccion: null }))).toBeNull();
    expect(corridaAcompletar(lote("b", { corridas: [corrida({ unit: "pt" })], produccion: null }))).toBeNull();
    expect(corridaAcompletar(lote("c", { corridas: [corrida({ volumeInputM3: 0 })], produccion: null }))).toBeNull();
  });

  it("sin corridas no hay nada que completar", () => {
    expect(corridaAcompletar(lote("a", { corridas: [], produccion: null }))).toBeNull();
  });
});

describe("detalleGuardado", () => {
  it("devuelve los productos guardados con la forma del formulario", () => {
    const d = detalleGuardado(lote("a", { sniffs: ref() }));
    expect(d?.productos).toHaveLength(1);
    expect(d?.productos[0]).toMatchObject({
      productType: "MADERA ASERRADA (TABLA)",
      volumenM3: 3,
      dudoso: false,
    });
    expect(d?.avisos).toEqual([]);
  });

  it("sin productos no hay nada que precargar (el caso de la lista)", () => {
    expect(detalleGuardado(lote("a", { sniffs: ref({ productos: [] }) }))).toBeNull();
    expect(detalleGuardado(lote("b"))).toBeNull();
  });
});

describe("la producción pendiente entra a la mesa aunque el cuadre «cuadre»", () => {
  const deLista = ref({ productos: [], fuente: "lista" });

  it("un lote traído de la lista y sin declarar es trabajo, no un lote resuelto", () => {
    const [fila] = lotesQueNoCuadran([
      lote("a", { produccion: corrida({ quantity: null }), sniffs: deLista }),
    ]);
    expect(fila.cuadre.estado).toBe("cuadra");
    expect(fila.cuadre.produccionPendiente).toBe(true);
    /* Pesa la materia prima que espera: es lo que hay que convertir en producto. */
    expect(fila.peso).toBe(10);
    expect(fila.resoluble).toBe(true);
  });

  it("el mismo lote, ya declarado, sale de la mesa", () => {
    expect(lotesQueNoCuadran([lote("a", { produccion: corrida({ quantity: 3 }), sniffs: deLista })])).toEqual([]);
  });
});
