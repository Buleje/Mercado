/**
 * Las cuentas que encabezan Producción y Despacho, ahora que se corren sobre
 * DOS ventanas (el período y el anterior) para poder comparar.
 *
 * Cada caso es una regla que ya estaba escrita en el código y que al mover la
 * función fuera del `useMemo` había que poder demostrar que sigue viva.
 */

import { describe, it, expect } from "vitest";
import { calcularKpisSeccion } from "@/lib/forestal/ctp-kpis-seccion";
import type { CtpEntry } from "@/components/admin/forestal/ctp-section-shared";

const linea = (p: Partial<CtpEntry>): CtpEntry =>
  ({
    id: Math.random().toString(36).slice(2),
    section: "produccion",
    lineNo: 1,
    entryDate: "2026-07-01",
    gtfIngreso: null,
    materiaPrimaRef: null,
    speciesCommon: "Tornillo",
    productType: "Madera aserrada",
    gtfNumber: null,
    destino: null,
    observations: null,
    status: "registrado",
    annulledReason: null,
    quantity: null,
    unit: "m3",
    pieces: null,
    volumeInputM3: null,
    rendimientoPct: null,
    ...p,
  }) as CtpEntry;

describe("calcularKpisSeccion", () => {
  it("lo anulado no cuenta: en el libro no existe", () => {
    const k = calcularKpisSeccion(
      [
        linea({ quantity: "10", volumeInputM3: "20" }),
        linea({ quantity: "999", volumeInputM3: "999", status: "anulado" }),
      ],
      "produccion",
    );
    expect(k.count).toBe(1);
    expect(k.totalQty).toBe(10);
    expect(k.consumido).toBe(20);
  });

  it("el rendimiento es PONDERADO por volumen, no promedio simple", () => {
    const k = calcularKpisSeccion(
      [
        linea({ quantity: "0.25", volumeInputM3: "0.5", rendimientoPct: "50" }),
        linea({ quantity: "30", volumeInputM3: "50", rendimientoPct: "60" }),
      ],
      "produccion",
    );
    // La media simple daría 55; ponderada por 0.5 y 50 m³ da ~59.9.
    expect(k.avgRend).toBeGreaterThan(59);
    expect(k.avgRend).toBeLessThan(60);
  });

  it("una corrida abierta es deuda y su consumo ya pesa en el período", () => {
    const k = calcularKpisSeccion(
      [linea({ quantity: null, volumeInputM3: "12" })],
      "produccion",
    );
    expect(k.abiertas).toBe(1);
    expect(k.consumidoAbierto).toBe(12);
    // Y NO da merma del 100 %: la madera sigue en la sierra.
    expect(k.merma).toBe(0);
    expect(k.mermaSobre).toBe(0);
  });

  it("la merma ignora lo declarado en otra unidad: restar pt a m³ es sumar peras con manzanas", () => {
    const k = calcularKpisSeccion(
      [
        linea({ quantity: "8", volumeInputM3: "10", unit: "m3" }),
        linea({ quantity: "4000", volumeInputM3: "10", unit: "pt" }),
      ],
      "produccion",
    );
    expect(k.mermaSobre).toBe(1);
    expect(k.merma).toBeCloseTo(2, 5);
  });

  it("declarar producto sin materia prima es deuda, no merma cero", () => {
    const k = calcularKpisSeccion([linea({ quantity: "5", volumeInputM3: null })], "produccion");
    expect(k.sinMateriaPrima).toBe(1);
    expect(k.mermaSobre).toBe(0);
  });

  it("despacho cuenta guías y destinos DISTINTOS, no filas", () => {
    const k = calcularKpisSeccion(
      [
        linea({ section: "despacho", quantity: "2", gtfNumber: "G-1", destino: "Callao" }),
        linea({ section: "despacho", quantity: "3", gtfNumber: "G-1", destino: "Callao" }),
        linea({ section: "despacho", quantity: "1", gtfNumber: "G-2", destino: "Lima" }),
      ],
      "despacho",
    );
    expect(k.count).toBe(3);
    expect(k.guias).toBe(2);
    expect(k.destinos).toBe(2);
    expect(k.totalQty).toBe(6);
  });

  it("el mismo conjunto vacío da ceros y no rompe: es el período anterior de un libro nuevo", () => {
    const k = calcularKpisSeccion([], "produccion");
    expect(k.count).toBe(0);
    expect(k.avgRend).toBe(0);
    expect(k.mermaPct).toBe(0);
  });
});
