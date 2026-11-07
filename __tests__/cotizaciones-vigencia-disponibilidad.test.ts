import { describe, expect, it } from "vitest";
import {
  diaDeVigencia,
  diaEnDias,
  diasParaVencer,
  finDelDiaLima,
  textoDia,
  textoQuedan,
  vigenciaDesdeEntrada,
  vigenciaVencida,
} from "@/lib/cotizaciones/vigencia";
import {
  cantidadConUnidad,
  estadoDeLinea,
  faltantesDe,
  idDeProducto,
  type DisponibilidadProducto,
} from "@/lib/cotizaciones/disponibilidad";
import { porSeguir, recordatorioReciente } from "@/lib/cotizaciones/modelos";

/** 20:30 del viernes 17/10 en Pucallpa = 01:30 UTC del sábado 18. */
const NOCHE_LIMA = Date.parse("2026-10-18T01:30:00Z");

describe("vigencia de la cotización", () => {
  it("lo guardado a medianoche UTC (antes) es ese mismo día, no el anterior", () => {
    expect(diaDeVigencia("2026-10-22T00:00:00.000Z")).toBe("2026-10-22");
  });

  it("lo guardado ahora (fin del día en Lima) vuelve al mismo día", () => {
    const guardado = new Date(finDelDiaLima("2026-10-22")).toISOString();
    expect(guardado).toBe("2026-10-23T04:59:59.999Z");
    expect(diaDeVigencia(guardado)).toBe("2026-10-22");
  });

  it("vence al terminar el día en Lima, no a las 19:00 del día anterior", () => {
    expect(vigenciaVencida("2026-10-17T00:00:00.000Z", NOCHE_LIMA)).toBe(false);
    expect(diasParaVencer("2026-10-17", NOCHE_LIMA)).toBe(0);
    expect(vigenciaVencida("2026-10-16", NOCHE_LIMA)).toBe(true);
    expect(textoQuedan("2026-10-16", NOCHE_LIMA)).toBe("venció ayer");
  });

  it("hoy + n días sale del día de Lima, aunque el UTC ya sea mañana", () => {
    expect(diaEnDias(0, NOCHE_LIMA)).toBe("2026-10-17");
    expect(diaEnDias(15, NOCHE_LIMA)).toBe("2026-11-01");
    expect(textoQuedan(diaEnDias(15, NOCHE_LIMA), NOCHE_LIMA)).toBe("quedan 15 días");
  });

  it("el servidor guarda un día como el final de ese día en Lima", () => {
    expect(vigenciaDesdeEntrada("2026-10-22")?.toISOString()).toBe("2026-10-23T04:59:59.999Z");
    expect(vigenciaDesdeEntrada("2026-10-22T15:00:00Z")?.toISOString()).toBe("2026-10-22T15:00:00.000Z");
    expect(vigenciaDesdeEntrada("mañana")).toBeNull();
  });

  it("escribe el día como «jueves 22/10»", () => {
    expect(textoDia("2026-10-22")).toBe("jueves 22/10");
    expect(textoDia(null)).toBe("—");
  });
});

const producto = (p: Partial<DisponibilidadProducto> = {}): DisponibilidadProducto => ({
  id: 7,
  nombre: "Arroz Costeño 5 kg",
  tipo: "product",
  unidad: "unidad",
  stock: 10,
  minimo: 5,
  activo: true,
  ...p,
});

describe("disponibilidad de una línea", () => {
  it("servicio y sin inventario nunca faltan", () => {
    expect(estadoDeLinea(producto({ tipo: "service", stock: 0 }), 3).nivel).toBe("servicio");
    expect(estadoDeLinea(producto({ stock: null }), 300).nivel).toBe("sin-control");
  });

  it("agotado, falta, queda bajo el mínimo y alcanza", () => {
    expect(estadoDeLinea(producto({ stock: 0 }), 1)).toEqual({ nivel: "agotado", texto: "Agotado" });
    expect(estadoDeLinea(producto(), 12)).toEqual({ nivel: "falta", texto: "Faltan 2 (hay 10 unidades)" });
    expect(estadoDeLinea(producto(), 6).nivel).toBe("queda-bajo");
    expect(estadoDeLinea(producto(), 4)).toEqual({ nivel: "hay", texto: "Hay 10 unidades" });
  });

  it("unidades del negocio", () => {
    expect(cantidadConUnidad(1, "unidad")).toBe("1 unidad");
    expect(cantidadConUnidad(3.5, "kg")).toBe("3,5 kg");
  });

  it("productoId: sólo enteros positivos del catálogo", () => {
    expect(idDeProducto("42")).toBe(42);
    expect(idDeProducto("abc")).toBeNull();
    expect(idDeProducto("0")).toBeNull();
    expect(idDeProducto(undefined)).toBeNull();
  });
});

describe("faltantes al convertir", () => {
  const catalogo = new Map<number, DisponibilidadProducto>([
    [7, producto()],
    [8, producto({ id: 8, nombre: "Corte de cabello", tipo: "service", stock: 0 })],
    [9, producto({ id: 9, nombre: "Aceite", stock: null })],
    [10, producto({ id: 10, nombre: "Gaseosa", activo: false, stock: 50 })],
  ]);

  it("suma las líneas del mismo producto", () => {
    const lineas = [
      { productoId: "7", descripcion: "Arroz", cantidad: 6 },
      { productoId: "7", descripcion: "Arroz", cantidad: 6 },
    ];
    expect(faltantesDe(lineas, catalogo)).toEqual([
      { productoId: 7, descripcion: "Arroz Costeño 5 kg", pide: 12, hay: 10, unidad: "unidad" },
    ]);
  });

  it("servicios, sin inventario y líneas a mano no faltan; un desactivado sí", () => {
    const lineas = [
      { productoId: "8", descripcion: "Corte", cantidad: 3 },
      { productoId: "9", descripcion: "Aceite", cantidad: 99 },
      { descripcion: "Flete a Constitución", cantidad: 1 },
      { productoId: "10", descripcion: "Gaseosa", cantidad: 1 },
    ];
    expect(faltantesDe(lineas, catalogo).map((f) => [f.productoId, f.hay])).toEqual([[10, 0]]);
  });
});

describe("seguimiento de cotizaciones (F31)", () => {
  // jueves 15/10/2026, 10:00 en Lima
  const ahora = Date.parse("2026-10-15T15:00:00Z");
  const cot = (id: string, status: string, validoHasta: string, updatedAt: string) => ({ id, status, validoHasta, updatedAt });

  it("vencen pronto (0-3 días) la más urgente primero; vencidas, borradores y cerradas fuera", () => {
    const { vencenPronto, sinRespuesta } = porSeguir(
      [
        cot("a", "ENVIADA", "2026-10-18T23:59:59.999-05:00", "2026-10-14T15:00:00Z"),
        cot("b", "ACEPTADA", "2026-10-15T23:59:59.999-05:00", "2026-10-01T15:00:00Z"),
        cot("vencida", "ENVIADA", "2026-10-14T23:59:59.999-05:00", "2026-10-01T15:00:00Z"),
        cot("borrador", "BORRADOR", "2026-10-16T23:59:59.999-05:00", "2026-10-01T15:00:00Z"),
        cot("convertida", "CONVERTIDA", "2026-10-16T23:59:59.999-05:00", "2026-10-01T15:00:00Z"),
      ],
      ahora,
    );
    expect(vencenPronto.map((x) => [x.c.id, x.dias])).toEqual([["b", 0], ["a", 3]]);
    expect(sinRespuesta).toEqual([]);
  });

  it("sin respuesta = enviada hace más de 3 días que todavía vale; no repite las que vencen pronto", () => {
    const { vencenPronto, sinRespuesta } = porSeguir(
      [
        cot("vieja", "ENVIADA", "2026-10-30T23:59:59.999-05:00", "2026-10-08T15:00:00Z"),
        cot("reciente", "ENVIADA", "2026-10-30T23:59:59.999-05:00", "2026-10-13T15:00:00Z"),
        cot("aceptada", "ACEPTADA", "2026-10-30T23:59:59.999-05:00", "2026-10-01T15:00:00Z"),
        cot("ambas", "ENVIADA", "2026-10-17T23:59:59.999-05:00", "2026-10-01T15:00:00Z"),
      ],
      ahora,
    );
    expect(sinRespuesta.map((x) => [x.c.id, x.dias])).toEqual([["vieja", 7]]);
    expect(vencenPronto.map((x) => x.c.id)).toEqual(["ambas"]);
  });

  it("un recordatorio de hace menos de 24 h pide confirmar; el de ayer temprano no", () => {
    const r = (at: string) => ({ at, por: "ana", canal: "whatsapp" as const });
    expect(recordatorioReciente([], ahora)).toBeNull();
    expect(recordatorioReciente([r("2026-10-14T16:00:00Z")], ahora)?.por).toBe("ana");
    expect(recordatorioReciente([r("2026-10-14T14:00:00Z")], ahora)).toBeNull();
    // Cuenta el ÚLTIMO, no el primero.
    expect(recordatorioReciente([r("2026-10-10T14:00:00Z"), r("2026-10-15T09:00:00Z")], ahora)?.at).toBe("2026-10-15T09:00:00Z");
  });
});
