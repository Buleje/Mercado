/**
 * Lo que la pantalla del lote mixto (ADR-441) decide sola: el rótulo del PT,
 * el mixto en una línea, a qué lote abierto se ofrece sumar cada tarjeta, qué
 * quedó sin subir en la cola del patio y cómo se arma la vinculación del día
 * (lotes «por repartir» de un mixto abierto que se cambian por los reales).
 */
import { describe, expect, it } from "vitest";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteMixto } from "@/lib/forestal/lote-mixto";
import {
  LOTE_POR_REPARTIR,
  SECCION_COLA_MIXTO,
  corridaAlMixto,
  lineaDelMixto,
  lotesParaVincular,
  opcionesDeDestino,
  pedidoConLotesReales,
  pendientesDelMixto,
  ptDeCorrida,
  rotuloDelPt,
} from "@/lib/forestal/lote-mixto-vista";
import { claveDeGrupo } from "@/lib/forestal/lote-por-escaneo";

const troza = (over: Partial<TrozaConsumible> = {}): TrozaConsumible => ({
  id: over.id ?? "t1",
  woodEntryId: "e1",
  codificacion: "106/C",
  especieComun: "Copaiba",
  volumenM3: 1.25,
  permiso: "19-SEC/PER-FMC-2024-008",
  guiaRecepcionada: true,
  ...over,
});

describe("rotuloDelPt — el PT dice de dónde sale", () => {
  it("ninguna cubicada → ≈ aserrable; todas → Oxapampa; mezcla → cuántas", () => {
    expect(rotuloDelPt({ cubicadas: 0, piezas: 4 })).toBe("≈ PT aserrable");
    expect(rotuloDelPt({ cubicadas: 4, piezas: 4 })).toBe("PT Oxapampa");
    expect(rotuloDelPt({ cubicadas: 1, piezas: 4 })).toBe("PT (1 de 4 Oxapampa, el resto ≈ aserrable)");
  });
});

describe("lineaDelMixto", () => {
  it("«LM-2026-003 · abierto · 12 trozas · 4 especies», singular bien dicho", () => {
    expect(lineaDelMixto({ code: "LM-2026-003", status: "abierto", piezas: 12, especies: 4 })).toBe(
      "LM-2026-003 · abierto · 12 trozas · 4 especies",
    );
    expect(lineaDelMixto({ code: "LM-2026-001", status: "repartido", piezas: 1, especies: 1 })).toBe(
      "LM-2026-001 · repartido · 1 troza · 1 especie",
    );
    expect(lineaDelMixto({ code: "LM-2026-002", status: "abierto", piezas: 0, especies: 0 })).toBe(
      "LM-2026-002 · abierto · 0 trozas",
    );
  });
});

describe("opcionesDeDestino — un lote abierto es destino de UNA tarjeta", () => {
  const copaibaA = { clave: "copaiba|A", especie: "Copaiba", especieCientifica: null, permiso: "A" };
  const copaibaB = { clave: "copaiba|B", especie: "Copaiba", especieCientifica: null, permiso: "B" };
  const lotes = [
    { id: "L1", code: "LA-001", speciesCommon: "Copaiba", permiso: null, status: "abierto", trozas: [] },
    { id: "L2", code: "LA-002", speciesCommon: "Copaiba", permiso: "A", status: "abierto", trozas: [] },
    { id: "L3", code: "LA-003", speciesCommon: "Tornillo", permiso: null, status: "abierto", trozas: [] },
  ];
  it("cada tarjeta ve los de su especie (y su permiso si el lote lo fija)", () => {
    const o = opcionesDeDestino([copaibaA, copaibaB], lotes, {});
    expect(o.get("copaiba|A")!.map((l) => l.id)).toEqual(["L1", "L2"]);
    expect(o.get("copaiba|B")!.map((l) => l.id)).toEqual(["L1"]);
  });
  it("el lote vacío sin permiso elegido por A ya no se ofrece a B", () => {
    const o = opcionesDeDestino([copaibaA, copaibaB], lotes, { "copaiba|A": "L1" });
    expect(o.get("copaiba|A")!.map((l) => l.id)).toEqual(["L1", "L2"]);
    expect(o.get("copaiba|B")!.map((l) => l.id)).toEqual([]);
  });
});

describe("pendientesDelMixto — lo anotado sin señal, leído de la cola", () => {
  const a = (accion: string, trozaIds: string[], extra: Partial<{ estado: "pendiente" | "rechazado"; motivo: string; mixto: string }> = {}) => ({
    section: SECCION_COLA_MIXTO,
    estado: extra.estado ?? ("pendiente" as const),
    motivo: extra.motivo,
    payload: { accion, loteMixtoId: extra.mixto ?? "M1", trozaIds },
  });
  it("apartar y después sacar la misma troza = fuera; sólo las de ESTE mixto", () => {
    const p = pendientesDelMixto(
      [a("agregar", ["t1", "t2"]), a("quitar", ["t2"]), a("agregar", ["t9"], { mixto: "M2" })],
      "M1",
    );
    expect([...p.agregar]).toEqual(["t1"]);
    expect([...p.quitar]).toEqual(["t2"]);
  });
  it("lo rechazado al subir trae su motivo; otra sección no cuenta", () => {
    const p = pendientesDelMixto(
      [
        a("agregar", ["t3"], { estado: "rechazado", motivo: "Su guía no se recibió" }),
        { section: "consumo", estado: "pendiente" as const, payload: { loteMixtoId: "M1", accion: "agregar", trozaIds: ["t4"] } },
      ],
      "M1",
    );
    expect(p.rechazadas).toEqual([{ id: "t3", motivo: "Su guía no se recibió" }]);
    expect(p.agregar.size).toBe(0);
  });
  it("sin mixto elegido no hay nada pendiente", () => {
    expect(pendientesDelMixto([a("agregar", ["t1"])], null).agregar.size).toBe(0);
  });
});

describe("vincular el día con el mixto", () => {
  const corridaDelDia = {
    id: "c1",
    lineNo: 12,
    especie: "Tornillo",
    m3: 2.9,
    dia: "2026-09-25",
    volumenConsumidoM3: null,
    paquetes: [
      { largoM: 3.05, pieTablar: 600 },
      { largoM: 4.27, pieTablar: 629.4 },
    ],
  };

  it("corridaAlMixto: largo máximo en metros, sin materia prima si no consumió nada", () => {
    expect(corridaAlMixto(corridaDelDia)).toEqual({
      id: "c1",
      lineNo: 12,
      especie: "Tornillo",
      volumenM3: 2.9,
      fecha: "2026-09-25",
      largoMaxPiezaM: 4.27,
      tieneMateriaPrima: false,
      permiso: null,
    });
    expect(corridaAlMixto({ ...corridaDelDia, volumenConsumidoM3: 1.2, paquetes: [] })).toMatchObject({
      largoMaxPiezaM: null,
      tieneMateriaPrima: true,
    });
    /* ADR-447: el permiso del asiento viaja a la propuesta; con dos, ninguno (no se elige uno). */
    expect(corridaAlMixto({ ...corridaDelDia, permisos: ["10-HUA-PUE/PER-FMP-2026-007"] }).permiso).toBe("10-HUA-PUE/PER-FMP-2026-007");
    expect(corridaAlMixto({ ...corridaDelDia, permisos: ["A", "B"] }).permiso).toBeNull();
  });

  it("ptDeCorrida: el medido de los paquetes; si falta uno, m³ × 424", () => {
    expect(ptDeCorrida(corridaDelDia)).toBe(1229);
    expect(ptDeCorrida({ m3: 2.9, paquetes: [{ pieTablar: 600 }, { pieTablar: null }] })).toBe(1230);
  });

  const t1 = troza({ id: "t1", especieComun: "Tornillo", permiso: "A" });
  const t2 = troza({ id: "t2", especieComun: "Copaiba", permiso: "A" });
  const t3 = troza({ id: "t3", especieComun: "Copaiba", permiso: "B" });

  it("mixto ABIERTO: un lote «por repartir» por especie + permiso, con sus trozas", () => {
    const mixto = { status: "abierto", trozas: [t1, t2, t3], lotes: [] } as unknown as LoteMixto;
    const lotes = lotesParaVincular(mixto, []);
    expect(lotes.map((l) => l.id)).toEqual([
      `${LOTE_POR_REPARTIR}${claveDeGrupo(t1)}`,
      `${LOTE_POR_REPARTIR}${claveDeGrupo(t2)}`,
      `${LOTE_POR_REPARTIR}${claveDeGrupo(t3)}`,
    ]);
    expect(lotes[1]).toMatchObject({ especie: "Copaiba", permiso: "A", code: null });
    expect(lotes[1]!.trozas.map((t) => t.id)).toEqual(["t2"]);
  });

  it("mixto REPARTIDO: sus lotes hijos con las trozas que el patio dice que tienen", () => {
    const mixto = {
      status: "repartido",
      trozas: [],
      lotes: [{ id: "L1", code: "LA-070", speciesCommon: "Tornillo", permiso: "A", status: "abierto", piezas: 1, volumenM3: 1.25 }],
    } as unknown as LoteMixto;
    const lotes = lotesParaVincular(mixto, [{ ...t1, loteAserrioId: "L1" }, { ...t2, loteAserrioId: "L9" }]);
    expect(lotes).toHaveLength(1);
    expect(lotes[0]).toMatchObject({ id: "L1", code: "LA-070", especie: "Tornillo" });
    expect(lotes[0]!.trozas.map((t) => t.id)).toEqual(["t1"]);
  });

  it("pedidoConLotesReales: cambia «por repartir» por el lote que salió y saca lo excluido", () => {
    const pedido = {
      corridaId: "c1",
      partes: [
        { loteId: `${LOTE_POR_REPARTIR}copaiba|A`, trozaIds: ["t2", "t5"] },
        { loteId: "L7", trozaIds: ["t6"] },
      ],
    };
    const r = pedidoConLotesReales(pedido, new Map([["copaiba|A", "L20"]]), new Set(["t5", "t6"]));
    expect(r).toEqual({ corridaId: "c1", partes: [{ loteId: "L20", trozaIds: ["t2"] }] });
  });

  it("pedidoConLotesReales: sin lote real o sin trozas que queden → null", () => {
    const pedido = { corridaId: "c1", partes: [{ loteId: `${LOTE_POR_REPARTIR}x|`, trozaIds: ["t1"] }] };
    expect(pedidoConLotesReales(pedido, new Map())).toBeNull();
  });
});
