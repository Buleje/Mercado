import { describe, expect, it } from "vitest";
import type { Excepcion } from "@/lib/forestal/ctp-saldos-excepciones";
import type { RendimientoCorrida } from "@/lib/forestal/ctp-radar-rendimiento";
import {
  contarIncoherencias,
  enlaceLibro,
  incoherenciasDeCuadre,
  incoherenciasDePendientes,
  incoherenciasDeRendimiento,
  incoherenciasDeSaldo,
  ordenarIncoherencias,
  vistaDePendiente,
} from "@/lib/superadmin/plantas-forestales/incoherencias";

const P = { tenantId: "planta-1", nombre: "Aserradero Uno" };

const excepcion = (o: Partial<Excepcion>): Excepcion => ({
  clave: "existencia-negativa",
  tono: "error",
  titulo: "t",
  detalle: "d",
  items: [],
  magnitud: 4,
  ir: null,
  ...o,
}) as Excepcion;

describe("incoherencias de saldo", () => {
  it("toman el tono del libro y los m³ de su magnitud", () => {
    const [i] = incoherenciasDeSaldo(P, [excepcion({ items: ["Cumala", "Tornillo"] })]);
    expect(i.gravedad).toBe("error");
    expect(i.m3EnJuego).toBe(4);
    expect(i.detalle).toContain("Cumala");
    expect(i.enlaceLibro).toBe(enlaceLibro("saldos"));
  });

  it("stock de productos, lotes vencidos y el valle no son madera en juego hoy: null, nunca 0", () => {
    const r = incoherenciasDeSaldo(P, [
      excepcion({ clave: "stock-negativo", magnitud: 12 } as Partial<Excepcion>),
      excepcion({ clave: "lotes-vencidos", magnitud: 3 } as Partial<Excepcion>),
      excepcion({ clave: "valle-negativo", tono: "warning", magnitud: 78.671 } as Partial<Excepcion>),
    ]);
    expect(r.map((x) => x.m3EnJuego)).toEqual([null, null, null]);
  });

  it("un aviso con filtro abre la bandeja «por recepcionar»", () => {
    const [i] = incoherenciasDeSaldo(P, [excepcion({ ir: "ingresos", filtro: "pendiente" } as Partial<Excepcion>)]);
    expect(new URLSearchParams(i.enlaceLibro).get("sub")).toBe("por-recepcionar");
  });
});

describe("incoherencias de cuadre por guía", () => {
  const ingreso = (id: string, declarado: number, piezas: number, count = 3) => ({
    id,
    gtfNumber: `G-${id}`,
    volumeM3: declarado,
    trozasM3: piezas,
    trozasCount: count,
  });

  it("sólo las que descuadran, la peor primero, con |brecha| como m³ en juego", () => {
    const r = incoherenciasDeCuadre(
      P,
      [ingreso("a", 10, 9.5), ingreso("b", 5, 5), ingreso("c", 4, 6), ingreso("d", 8, 0, 0)],
      null,
    );
    expect(r.map((x) => x.m3EnJuego)).toEqual([2, 0.5]);
    expect(r.every((x) => x.gravedad === "warning")).toBe(true);
    expect(r[0].referencia).toEqual({ tipo: "guia", valor: "G-c" });
    expect(new URLSearchParams(r[0].enlaceLibro).get("ingreso")).toBe("c");
  });

  it("si el barrido no llegó a todas, lo dice (info, sin m³)", () => {
    const r = incoherenciasDeCuadre(P, [], { leidos: 1000, total: 1200 });
    expect(r).toHaveLength(1);
    expect(r[0].gravedad).toBe("info");
    expect(r[0].m3EnJuego).toBeNull();
  });
});

describe("incoherencias de rendimiento", () => {
  const corrida = (flag: RendimientoCorrida["flag"], entradaM3: number): RendimientoCorrida => ({
    id: `c-${flag}`,
    lineNo: 1,
    etiqueta: `Corrida ${flag}`,
    entradaM3,
    salida: 1,
    unidad: "m3",
    ratio: null,
    grupo: "g",
    medianaGrupo: null,
    desvioPct: null,
    flag,
    motivo: null,
  });

  it("imposible = error; bajo/alto = aviso; sin entrada no hay m³", () => {
    const r = incoherenciasDeRendimiento(P, [corrida("imposible", 3), corrida("bajo", 0)]);
    expect(r.map((x) => x.gravedad)).toEqual(["error", "warning"]);
    expect(r.map((x) => x.m3EnJuego)).toEqual([3, null]);
  });
});

describe("incoherencias de pendientes del libro", () => {
  it("fuera: lo «pendiente», los que repiten un aviso de saldo y las deudas", () => {
    const r = incoherenciasDePendientes(P, [
      { titulo: "Saldos en negativo", urgencia: "bloquea", cantidad: 2 },
      { titulo: "Corridas sin materia prima atribuida", urgencia: "bloquea", cantidad: 1 },
      { titulo: "3 guías sin pagar a Juan · S/ 1.200", urgencia: "atrasado", cantidad: 3 },
      { titulo: "Trozas paradas hace 60 días o más", urgencia: "pendiente", cantidad: 9 },
      { titulo: "Despachos sin GTF de salida", urgencia: "atrasado", cantidad: 4 },
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].titulo).toBe("Despachos sin GTF de salida (4)");
    expect(r[0].gravedad).toBe("warning");
    expect(r[0].m3EnJuego).toBeNull();
  });

  it("cada título abre su vista del libro («fuera de plazo» antes que «ingresos»)", () => {
    expect(vistaDePendiente("Ingresos registrados fuera de plazo")).toBe("cumplimiento");
    expect(vistaDePendiente("Permiso(s) con la vigencia vencida")).toBe("contratos");
    expect(vistaDePendiente("Guías del monte sin ingresar al CTP")).toBe("ingresos");
    expect(vistaDePendiente("Despachos sin GTF de salida")).toBe("despacho");
    expect(vistaDePendiente("Algo nuevo")).toBe("tablero");
  });
});

describe("conteo y orden", () => {
  it("los m³ en juego no suman lo informativo; lo grave va primero", () => {
    const cuadre = incoherenciasDeCuadre(P, [{ id: "a", gtfNumber: "1", volumeM3: 10, trozasM3: 9, trozasCount: 2 }], {
      leidos: 1,
      total: 2,
    });
    const rend = incoherenciasDeRendimiento(P, [
      {
        id: "x",
        lineNo: 1,
        etiqueta: "C1",
        entradaM3: 0.5,
        salida: 1,
        unidad: "m3",
        ratio: 2,
        grupo: "g",
        medianaGrupo: null,
        desvioPct: null,
        flag: "imposible",
        motivo: null,
      },
    ]);
    const todas = ordenarIncoherencias([...cuadre, ...rend]);
    expect(todas.map((x) => x.gravedad)).toEqual(["error", "warning", "info"]);
    expect(contarIncoherencias(todas)).toEqual({ error: 1, warning: 1, info: 1, m3EnJuego: 1.5 });
  });
});
