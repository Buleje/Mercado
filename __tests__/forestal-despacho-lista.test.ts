import { describe, it, expect } from "vitest";
import {
  excesosDeCorrida,
  payloadDeFila,
  piezasTotales,
  problemasDeLista,
  resumenPorProducto,
  uidDeFila,
  volumenPorCorrida,
  volumenTotal,
  type FilaDespacho,
} from "@/lib/forestal/despacho-lista";

/**
 * La lista de productos de una GTF de salida.
 *
 * Lo que se prueba acá es lo que evita registrar MEDIA guía: una guía lleva N
 * productos y el libro los guarda como N líneas, así que el chequeo de saldo
 * tiene que mirar el conjunto (dos paquetes de la misma corrida comparten un
 * único saldo) ANTES de mandar la primera línea.
 */

const fila = (over: Partial<FilaDespacho> = {}): FilaDespacho => ({
  uid: uidDeFila(over.corridaId ?? "c1", over.paqueteId ?? "p1"),
  corridaId: "c1",
  lineNo: 12,
  paqueteId: "p1",
  especie: "Sapotillo",
  especieCientifica: "Matisia bicolor",
  producto: "MADERA ASERRADA (TABLA DE PULGADA)",
  codigo: "SAP-TAB-1",
  presentacion: "PIEZAS",
  cantidad: 123,
  espesorCm: null,
  anchoCm: null,
  largoM: null,
  volumen: 2.035,
  unidad: "m3",
  disponibleCorrida: 5,
  gtfOrigen: ["3-19-0235806"],
  titularOrigen: ["19-SEC/PER/FMC-2024-008"],
  lote: "4-2025",
  linea: "LP",
  fechaProduccion: "2025-06-17T00:00:00.000Z",
  ...over,
});

describe("totales de la lista", () => {
  it("suma el volumen movilizado con la precisión del libro", () => {
    const filas = [fila(), fila({ uid: "c1:p2", paqueteId: "p2", volumen: 0.676 })];
    expect(volumenTotal(filas)).toBe(2.711);
    expect(piezasTotales(filas)).toBe(246);
  });

  it("no explota con una fila a medio editar (volumen NaN)", () => {
    const filas = [fila({ volumen: Number.NaN })];
    expect(volumenTotal(filas)).toBe(0);
  });
});

describe("resumen por especie y producto", () => {
  it("junta las filas del mismo producto y separa los distintos", () => {
    const filas = [
      fila(),
      fila({ uid: "c1:p2", paqueteId: "p2", volumen: 1 }),
      fila({ uid: "c2:p3", corridaId: "c2", paqueteId: "p3", producto: "MADERA ASERRADA (LARGA ANGOSTA)", cantidad: 56, volumen: 0.42 }),
    ];
    const resumen = resumenPorProducto(filas);
    expect(resumen).toHaveLength(2);
    expect(resumen[0]).toMatchObject({ producto: "MADERA ASERRADA (LARGA ANGOSTA)", cantidad: 56, volumen: 0.42 });
    expect(resumen[1]).toMatchObject({ cantidad: 246, volumen: 3.035 });
  });
});

describe("saldo de la corrida (I5 antes de guardar)", () => {
  it("acepta dos paquetes de una corrida mientras entren en su saldo", () => {
    const filas = [
      fila({ volumen: 2, disponibleCorrida: 5 }),
      fila({ uid: "c1:p2", paqueteId: "p2", volumen: 3, disponibleCorrida: 5 }),
    ];
    expect(volumenPorCorrida(filas).get("c1")).toBe(5);
    expect(excesosDeCorrida(filas)).toEqual([]);
    expect(problemasDeLista(filas)).toEqual([]);
  });

  it("detecta la sobre-atribución que el backend rechazaría a mitad de la carga", () => {
    const filas = [
      fila({ volumen: 3, disponibleCorrida: 5 }),
      fila({ uid: "c1:p2", paqueteId: "p2", volumen: 2.5, disponibleCorrida: 5 }),
    ];
    const excesos = excesosDeCorrida(filas);
    expect(excesos).toHaveLength(1);
    expect(excesos[0]).toMatchObject({ corridaId: "c1", pedido: 5.5, disponible: 5 });
    expect(problemasDeLista(filas)[0]).toContain("5.5000");
  });

  it("un redondeo de 0.00005 m³ NO es sobre-atribución", () => {
    const filas = [fila({ volumen: 5.00005, disponibleCorrida: 5 })];
    expect(excesosDeCorrida(filas)).toEqual([]);
  });
});

describe("problemas de la lista", () => {
  it("una lista vacía pide productos", () => {
    expect(problemasDeLista([])).toEqual(["Agregá al menos un producto a la lista."]);
  });

  it("avisa del producto sin volumen", () => {
    expect(problemasDeLista([fila({ volumen: 0 })])[0]).toContain("no tiene volumen");
  });

  it("avisa cuando se mezclan unidades (el total dejaría de ser sumable)", () => {
    const filas = [fila(), fila({ uid: "c2:p9", corridaId: "c2", paqueteId: "p9", unidad: "pt" })];
    expect(problemasDeLista(filas).some((p) => p.includes("mezcla unidades"))).toBe(true);
  });
});

describe("traducción a la línea del libro", () => {
  it("el volumen va a quantity y las piezas a pieces (no al revés)", () => {
    const p = payloadDeFila(fila(), {
      entryDate: "2026-08-07",
      docType: "GTF",
      gtfNumber: "001-00000025",
      destino: "Maderera del Centro SAC",
      observations: null,
    });
    expect(p.quantity).toBe(2.035);
    expect(p.pieces).toBe(123);
    expect(p.unit).toBe("m3");
    expect(p.origenes).toEqual([{ produccionEntryId: "c1", quantity: 2.035 }]);
    expect(p.codigoProducto).toBe("SAP-TAB-1");
    expect("gtfDatos" in p).toBe(false);
  });

  it("adjunta la guía cuando se le pasa, para que la línea nazca con ella", () => {
    const p = payloadDeFila(fila(), { entryDate: "2026-08-07", docType: "GTF", gtfNumber: "001-1", destino: null, observations: null }, { propietario: {} });
    expect(p.gtfDatos).toEqual({ propietario: {} });
  });
});
