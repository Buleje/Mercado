import { describe, expect, it } from "vitest";
import { resumenDeLlevar } from "@/components/admin/forestal/saldos/resumen-llevar-agrupar";

const c = (especie: string, tipo: "rolliza" | "aserrada", m3: number, piezas = 0) => ({ especie, tipo, m3, piezas });

describe("resumenDeLlevar", () => {
  it("agrupa por especie y tipo, redondea la fila una vez y suma filas redondeadas", () => {
    const sel = [c("Tornillo", "aserrada", 0.0004, 2), c("TORNILLO", "aserrada", 0.0004, 3), c("Tornillo", "rolliza", 1.2345, 1)];
    const r = resumenDeLlevar(sel, sel);
    expect(r.filas).toHaveLength(2);
    const aser = r.filas.find((f) => f.tipo === "aserrada")!;
    expect(aser.m3).toBe(0.001); // 0.0008 → 0.001, no 0.000
    expect(aser.piezas).toBe(5);
    expect(r.totalM3).toBe(1.236); // 1.235 (HALF_UP) + 0.001
    expect(r.totalPiezas).toBe(6);
  });

  it("disponible cuenta todo y el total solo lo tildado", () => {
    const todos = [c("A", "rolliza", 2), c("B", "rolliza", 3)];
    const r = resumenDeLlevar([todos[0]], todos);
    expect(r.totalM3).toBe(2);
    expect(r.disponibleM3).toBe(5);
  });

  it("subtotal por tipo: rolliza y ya aserrada también por separado, y suman el total", () => {
    const sel = [c("Tornillo", "rolliza", 1.2345), c("Tornillo", "aserrada", 0.4444), c("Cumala", "aserrada", 0.1116)];
    const r = resumenDeLlevar(sel, sel);
    expect(r.porTipo.rolliza).toBe(1.235);
    expect(r.porTipo.aserrada).toBe(0.556);
    expect(Math.round((r.porTipo.rolliza + r.porTipo.aserrada) * 1000) / 1000).toBe(r.totalM3);
  });

  it("sin selección no hay filas", () => {
    const r = resumenDeLlevar([], [c("A", "rolliza", 2)]);
    expect(r.filas).toEqual([]);
    expect(r.totalM3).toBe(0);
  });
});
