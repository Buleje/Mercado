/**
 * ADR-463 — el Variado se vuelve real antes de salir del cubicador:
 *  - «Aplicar el desglose al lote» cambia cada fila Variado por sus piezas
 *    (las iguales juntas, sin cruzar apartados) y conserva piezas y PT;
 *  - la especie heredada de arriba cuenta como la explícita;
 *  - una cubicación guardada con Variado se reconoce;
 *  - declarar una producción con Variado se rechaza (pantalla y esquema).
 */
import { describe, expect, it } from "vitest";
import { cubicarPieza, type PiezaCubicada } from "@/lib/forestal/cubicacion";
import type { BloqueRolliza } from "@/lib/forestal/cubicacion-reparto";
import { VARIADO_DEFAULT, desglosarVariado, esVariado, toleranciaCuadrePt } from "@/lib/forestal/variado-desglose";
import {
  MOTIVO_ABRIR_VARIADO,
  aplicarDesgloseAlLote,
  conVariadoHeredado,
  cubicacionTraeVariado,
  motivoAbrirVariado,
} from "@/lib/forestal/variado-aplicar";
import {
  armarPedido,
  corridasPorEspecie,
  motivoNoDeclarable,
  paquetesDeLoCubicado,
  piezasVariado,
  produccionSinLoteSchema,
} from "@/lib/forestal/declarar-produccion";
import { faltaParaRegistrar } from "@/components/admin/forestal/hooks/declarar-produccion-pantalla";

const pieza = (id: string, cantidad: number, espesor: number, ancho: number, especie?: string, largo = 10): PiezaCubicada => {
  const base = { cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies" } as const;
  return { id, ...base, ...(especie ? { especie } : {}), ...cubicarPieza(base) };
};
const bloque = (id: string, especie: string, m3: number): BloqueRolliza => ({
  id, etiqueta: id, especie, m3, origen: "manual", tipo: "rolliza", costoM3: null, aprovechablePct: null,
});
const bloques = [bloque("b1", "Tornillo", 3), bloque("b2", "Cumala", 2)];
const sumar = (filas: readonly PiezaCubicada[], k: "cantidad" | "pieTablar") => filas.reduce((a, p) => a + p[k], 0);

describe("aplicarDesgloseAlLote", () => {
  /* 15 paquetes como se dictan: una fila por paquete, todas de 10′. */
  const variado = Array.from({ length: 15 }, (_, i) => pieza(`v${i}`, 1, 6, 6, "Variado"));
  const lote = [pieza("a", 3, 2, 4, "Tornillo"), ...variado, pieza("z", 2, 1, 6, "Cumala")];
  const des = desglosarVariado(lote, bloques, VARIADO_DEFAULT);

  it("saca las filas Variado y mete sus piezas juntas, sin tocar las demás", () => {
    const r = aplicarDesgloseAlLote(lote, des);
    expect(r.salen).toBe(15);
    expect(r.paquetes).toBe(15);
    expect(r.filas.some((p) => esVariado(p.especie))).toBe(false);
    expect(r.filas[0].id).toBe("a");
    expect(r.filas[r.filas.length - 1].id).toBe("z");
    expect(r.filas.length).toBe(2 + r.entran);
    // Juntas: muchas menos filas que piezas abiertas sueltas.
    const sueltas = des.piezas.filter((p) => p.id.includes("-v-")).length;
    expect(r.entran).toBeLessThan(sueltas);
    // Ids únicos (el cubicador edita y borra por id).
    expect(new Set(r.filas.map((p) => p.id)).size).toBe(r.filas.length);
  });

  it("conserva las piezas abiertas y el PT dentro del redondeo de las filas", () => {
    const r = aplicarDesgloseAlLote(lote, des);
    const nuevas = r.filas.slice(1, -1);
    const hijos = des.piezas.filter((p) => p.id.includes("-v-"));
    expect(sumar(nuevas, "cantidad")).toBe(sumar(hijos, "cantidad"));
    const ptOrigen = sumar(variado, "pieTablar");
    expect(Math.abs(sumar(nuevas, "pieTablar") - ptOrigen)).toBeLessThanOrEqual(des.cuadre.toleranciaPt + toleranciaCuadrePt(hijos.length) + 1e-9);
    // Las dos especies del permiso reciben piezas.
    expect(new Set(nuevas.map((p) => p.especie))).toEqual(new Set(["Tornillo", "Cumala"]));
  });

  it("lo que no se pudo abrir se queda como estaba", () => {
    const conMala = [...lote, pieza("x", 2, 2, 4, "Variado")];
    const r = aplicarDesgloseAlLote(conMala, desglosarVariado(conMala, bloques, VARIADO_DEFAULT));
    expect(r.filas.filter((p) => esVariado(p.especie)).map((p) => p.id)).toEqual(["x"]);
  });

  it("sin bloques no abre nada y devuelve el lote igual", () => {
    const r = aplicarDesgloseAlLote(lote, desglosarVariado(lote, [], VARIADO_DEFAULT));
    expect(r.salen).toBe(0);
    expect(r.filas.map((p) => p.id)).toEqual(lote.map((p) => p.id));
  });

  it("no junta entre apartados y las piezas nuevas quedan en el de su fila", () => {
    const asignados = { v0: 1, v1: 1, v2: 2, a: 2 };
    const r = aplicarDesgloseAlLote(lote, des, asignados);
    expect(r.asignados.a).toBe(2);
    expect(r.asignados.v0).toBeUndefined();
    const enUno = r.filas.filter((p) => r.asignados[p.id] === 1);
    const enDos = r.filas.filter((p) => r.asignados[p.id] === 2 && p.id !== "a");
    expect(enUno.length).toBeGreaterThan(0);
    expect(enDos.length).toBeGreaterThan(0);
    // Apartado 1 = 2 paquetes, apartado 2 = 1 paquete: su PT es el de esos paquetes.
    const pt1 = variado[0].pieTablar * 2;
    expect(Math.abs(sumar(enUno, "pieTablar") - pt1)).toBeLessThanOrEqual(0.005 * 40);
  });
});

describe("la especie heredada cuenta como la explícita", () => {
  const filas = [pieza("a", 1, 6, 6), pieza("b", 1, 2, 4, "Tornillo")];
  it("con otra especie arriba devuelve el mismo array", () => {
    expect(conVariadoHeredado(filas, "Tornillo")).toBe(filas);
    expect(conVariadoHeredado(filas, "")).toBe(filas);
  });
  it("con «Variado» arriba, la fila sin especie pasa a decirlo y la otra no cambia", () => {
    const r = conVariadoHeredado(filas, "variado");
    expect(r[0].especie).toBe("Variado");
    expect(r[1]).toBe(filas[1]);
  });
  it("el motivo pide ponerla en la tabla antes de abrir", () => {
    expect(motivoAbrirVariado(0)).toBe(MOTIVO_ABRIR_VARIADO);
    expect(motivoAbrirVariado(3)).toMatch(/^3 filas sin especie toman «Variado» de arriba/);
  });
});

describe("cubicación guardada con Variado", () => {
  it("propia o heredada de su especie general", () => {
    expect(cubicacionTraeVariado([{ especie: "Variado" }], undefined)).toBe(true);
    expect(cubicacionTraeVariado([{ especie: undefined }], "Variado")).toBe(true);
    expect(cubicacionTraeVariado([{ especie: "Tornillo" }], "Variado")).toBe(false);
    expect(cubicacionTraeVariado([{ especie: undefined }], "Tornillo")).toBe(false);
  });
});

describe("«Variado» no se declara (Producir sin lote)", () => {
  const piezas = [pieza("a", 4, 2, 4, "Tornillo"), pieza("v", 3, 6, 6, "Variado")];
  const paquetes = paquetesDeLoCubicado(piezas, { hoy: new Date("2026-10-02T12:00:00Z") });

  it("cuenta las piezas Variado y da el camino", () => {
    expect(piezasVariado(paquetes)).toBe(3);
    expect(motivoNoDeclarable(paquetes)).toMatch(/^3 piezas son «Variado»\. Abre el Variado primero/);
    expect(motivoNoDeclarable(paquetes.filter((p) => !esVariado(p.especie)))).toBeNull();
  });

  it("la pantalla de registrar lo frena antes que cualquier otra falta", () => {
    expect(faltaParaRegistrar({ corridas: corridasPorEspecie(paquetes), servicio: "propia", parteId: null, fechaValida: true, lineas: [] }))
      .toMatch(/«Variado»/);
  });

  it("y si igual llega, el esquema del servidor lo rechaza", () => {
    const pedido = armarPedido({ paquetes, fecha: "2026-10-02", servicio: { tipo: "propia", precios: {} } });
    const r = produccionSinLoteSchema.safeParse(pedido);
    expect(r.success).toBe(false);
    const sinVariado = armarPedido({ paquetes: paquetes.filter((p) => !esVariado(p.especie)), fecha: "2026-10-02", servicio: { tipo: "propia", precios: {} } });
    expect(produccionSinLoteSchema.safeParse(sinVariado).success).toBe(true);
  });
});
