/**
 * Guardar cubicación con ficha (comprador, CCNN, permiso, camión) y precio por
 * pieza, y comparar dos guardadas (Brandon 24-10).
 *
 * Lo que se protege: el valor guardado sale de CADA pieza con su precio (no de
 * PT × un solo precio); «Vincular»/«Enviar al Libro», que reenvían sin notas
 * ni ficha, ya no las borran; y el comparador mide B − A por grupo y pieza a
 * pieza cuando una salió de la otra.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/db/platform-settings.db", () => ({ PlatformSettingsDB: {} }));
vi.mock("@/lib/forestal/ctp-audit", () => ({ auditCtp: () => {} }));

import { datosQueSeConservan } from "@/lib/db/forest-cubicaciones.db";
import { construirRegistro, filtrarCubicaciones, normalizarFicha, type CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import { cambiosPorPieza, diferenciasPor, lecturaDiferencias } from "@/lib/forestal/cubicacion-diferencias";
import { piezasParaGuardar } from "@/lib/forestal/cubicacion-para-guardar";
import type { PiezaCubicada } from "@/lib/forestal/cubicacion";

const pz = (id: string, cantidad: number, espesor: number, ancho: number, largo: number, especie: string, extra: Record<string, unknown> = {}) => ({
  id, cantidad, espesor, ancho, largo, uEspesor: "pulg", uAncho: "pulg", uLargo: "pies", especie, ...extra,
});

const registro = (piezas: Record<string, unknown>[], extra: Partial<Parameters<typeof construirRegistro>[0]> = {}): CubicacionRegistro =>
  construirRegistro({ nombre: "Lote", fecha: "2026-10-24", precioPt: 3, piezas, ...extra });

describe("construirRegistro · ficha y precio por pieza", () => {
  it("el valor suma cada pieza con su precio; la que no trae usa el del lote", () => {
    // 2×8×10 = 13,33 PT por pieza; ×3 = 40 PT.
    const c = registro([pz("a", 3, 2, 8, 10, "Tornillo", { precio: 4 }), pz("b", 3, 2, 8, 10, "Cedro")]);
    expect(c.totales.pieTablar).toBe(80);
    expect(c.valor).toBe(40 * 4 + 40 * 3);
    expect(c.piezas[0]?.precio).toBe(4);
    expect(c.piezas[1]?.precio).toBeUndefined();
  });

  it("0 es un precio válido (la pieza no se cobra); un texto no", () => {
    const c = registro([pz("a", 3, 2, 8, 10, "Tornillo", { precio: 0 }), pz("b", 3, 2, 8, 10, "Cedro", { precio: "x" })]);
    expect(c.piezas[0]?.precio).toBe(0);
    expect(c.piezas[1]?.precio).toBeUndefined();
    expect(c.valor).toBe(40 * 3);
  });

  it("la ficha guarda sólo campos conocidos, recortados; vacía no se guarda", () => {
    expect(normalizarFicha({ comunidad: "  CCNN San Luis de Chinchihuani ", placa: "", otro: "x" })).toEqual({ comunidad: "CCNN San Luis de Chinchihuani" });
    expect(normalizarFicha({ placa: "  " })).toBeUndefined();
    const c = registro([pz("a", 1, 2, 8, 10, "Tornillo")], { ficha: { comunidad: "Chivis", placa: "ABC-123", tituloHabilitante: "25-UCA/C-001" } });
    expect(c.ficha).toEqual({ comunidad: "Chivis", placa: "ABC-123", tituloHabilitante: "25-UCA/C-001" });
    expect(filtrarCubicaciones([c], "abc-123")).toHaveLength(1);
    expect(filtrarCubicaciones([c], "chivis")).toHaveLength(1);
  });

  it("piezasParaGuardar manda el precio de cada pieza sólo si se le pasa con qué preciar", () => {
    const rows = [{ ...pz("a", 1, 2, 8, 10, "Tornillo"), pieTablar: 13.33, m3: 0.0314 }] as PiezaCubicada[];
    expect(piezasParaGuardar(rows, "dictado")[0]).not.toHaveProperty("precio");
    expect(piezasParaGuardar(rows, "dictado", () => 5)[0]?.precio).toBe(5);
  });
});

describe("datosQueSeConservan · reenvíos sin notas ni ficha", () => {
  const existente = registro([pz("a", 3, 2, 8, 10, "Tornillo", { precio: 4 })], {
    cliente: "Maderera del Centro", notas: "falta el saldo", gtfNumber: "001-123", ficha: { comunidad: "Chivis" },
  });

  it("ausente conserva; null borra; un valor reemplaza", () => {
    const d = datosQueSeConservan({ nombre: "Lote", piezas: existente.piezas as unknown as Record<string, unknown>[], cliente: null, notas: undefined, ficha: { placa: "X" } }, existente);
    expect(d.cliente).toBeUndefined();
    expect(d.notas).toBe("falta el saldo");
    expect(d.gtfNumber).toBe("001-123");
    expect(d.ficha).toEqual({ placa: "X" });
  });

  it("si el pedido no trae ningún precio, cada pieza conserva el suyo por id", () => {
    const d = datosQueSeConservan({ nombre: "Lote", piezas: [pz("a", 3, 2, 8, 10, "Tornillo")] }, existente);
    expect(d.piezas[0]?.precio).toBe(4);
    const nuevo = construirRegistro({ nombre: "Lote", precioPt: 3, ...d });
    expect(nuevo.valor).toBe(existente.valor);
  });

  it("una pieza que cambió de especie o de dueño no se queda con el precio viejo", () => {
    const otraEspecie = datosQueSeConservan({ nombre: "Lote", piezas: [pz("a", 3, 2, 8, 10, "Moena")] }, existente);
    expect(otraEspecie.piezas[0]?.precio).toBeUndefined();
    const otroDueno = datosQueSeConservan({ nombre: "Lote", piezas: [pz("a", 3, 2, 8, 10, "Tornillo", { duenoParteId: "parte-2" })] }, existente);
    expect(otroDueno.piezas[0]?.precio).toBeUndefined();
  });

  it("si el pedido trae precios, mandan los suyos", () => {
    const d = datosQueSeConservan({ nombre: "Lote", piezas: [pz("a", 3, 2, 8, 10, "Tornillo", { precio: 6 })] }, existente);
    expect(d.piezas[0]?.precio).toBe(6);
  });
});

describe("diferenciasPor · B − A por grupo", () => {
  const a = registro([pz("a1", 10, 2, 8, 10, "Tornillo"), pz("a2", 5, 1, 6, 8, "Cedro")], { nombre: "A" });
  const b = registro([pz("b1", 12, 2, 8, 10, "Tornillo"), pz("b2", 4, 3, 3, 10, "Capirona")], { nombre: "B" });

  it("por especie: piezas, PT, m³ y soles; la que está en una sola sale con 0 del otro lado", () => {
    const d = diferenciasPor(a, b, "especie");
    const tornillo = d.filas.find((f) => f.label === "Tornillo");
    expect(tornillo).toMatchObject({ piezasA: 10, piezasB: 12, deltaPiezas: 2, soloEn: null });
    expect(tornillo?.deltaPt).toBeCloseTo(26.67, 1);
    expect(d.filas.find((f) => f.label === "Cedro")).toMatchObject({ piezasB: 0, soloEn: "A" });
    expect(d.filas.find((f) => f.label === "Capirona")).toMatchObject({ piezasA: 0, soloEn: "B" });
    expect(d.total.deltaPiezas).toBe(16 - 15);
    expect(d.total.deltaPt).toBeCloseTo(d.total.ptB - d.total.ptA, 2);
    expect(d.total.deltaM3).toBeCloseTo(d.total.m3B - d.total.m3A, 3);
  });

  it("la lectura dice cuánto más tiene B y qué lo explica", () => {
    expect(lecturaDiferencias(diferenciasPor(a, b, "especie"), "A", "B")).toMatch(/«B» tiene \d+ PT (más|menos) que «A»/);
    expect(lecturaDiferencias(diferenciasPor(a, a, "especie"), "A", "A")).toMatch(/mismas piezas/);
    expect(lecturaDiferencias(diferenciasPor(b, a, "especie"), "B", "A")).toMatch(/\(−1 piezas\)/);
  });

  it("bajo medio PT de diferencia no dice «0 PT»", () => {
    const c = registro([pz("a1", 1, 1, 1, 1, "Tornillo")]);
    const d = registro([pz("a1", 1, 1, 1, 1.2, "Tornillo")]);
    expect(lecturaDiferencias(diferenciasPor(c, d, "especie"), "C", "D")).not.toMatch(/ 0 PT/);
  });
});

describe("cambiosPorPieza · una duplicada de la otra", () => {
  const a = registro([pz("p1", 2, 2, 8, 10, "Tornillo"), pz("p2", 1, 2, 6, 8, "Tornillo"), pz("p3", 1, 1, 4, 6, "Cedro")]);

  it("dice qué medida cambió, qué se quitó y qué se agregó", () => {
    const b = registro([pz("p1", 2, 2, 8, 9, "Tornillo"), pz("p2", 1, 2, 6, 8, "Tornillo"), pz("p4", 3, 1, 4, 6, "Cedro")]);
    const c = cambiosPorPieza(a, b);
    expect(c?.enComun).toBe(2);
    expect(c?.iguales).toBe(1);
    const p1 = c?.cambios.find((x) => x.id === "p1");
    expect(p1).toMatchObject({ tipo: "cambiada", antes: "2×8×10", despues: "2×8×9", detalle: ["largo 10 → 9"] });
    expect(p1?.deltaPt).toBeLessThan(0);
    expect(c?.cambios.find((x) => x.id === "p3")?.tipo).toBe("quitada");
    expect(c?.cambios.find((x) => x.id === "p4")?.tipo).toBe("agregada");
  });

  it("sin piezas en común no compara pieza a pieza", () => {
    expect(cambiosPorPieza(a, registro([pz("x", 1, 2, 8, 10, "Tornillo")]))).toBeNull();
  });
});

describe("las dos comparaciones dicen lo mismo (Resúmenes y Guardadas)", () => {
  it("mismo par → mismo PT, m³ y piezas por grupo y en el total", async () => {
    const { compararLotes } = await import("@/lib/forestal/cubicacion-comparar");
    const { precioDeCubicacion } = await import("@/lib/forestal/cubicacion-registro");
    const a = registro([pz("a1", 7, 1.5, 7, 9, "Tornillo"), pz("a2", 3, 2, 5, 13, "Cedro"), pz("a3", 11, 1, 4, 7, "Tornillo")]);
    const b = registro([pz("b1", 9, 1.5, 7, 9, "Tornillo"), pz("b2", 2, 2, 5, 13, "Cedro"), pz("b3", 4, 3, 3, 10, "Capirona")]);
    for (const dim of ["especie", "tipo", "medida"] as const) {
      const r = compararLotes(a.piezas, b.piezas, dim, precioDeCubicacion(a), precioDeCubicacion(b));
      const g = diferenciasPor(a, b, dim);
      expect(r.total).toMatchObject({ ptA: g.total.ptA, ptB: g.total.ptB, m3A: g.total.m3A, m3B: g.total.m3B, deltaPiezas: g.total.deltaPiezas });
      for (const f of g.filas) {
        const x = r.filas.find((y) => y.label === f.label);
        expect(x, `${dim} · ${f.label}`).toMatchObject({ ptA: f.ptA, ptB: f.ptB, m3A: f.m3A, m3B: f.m3B, deltaPiezas: f.deltaPiezas });
      }
    }
  });
});

describe("lecturaComparacion · el mismo lote", () => {
  it("no dice «0 PT más»", async () => {
    const { compararLotes, lecturaComparacion } = await import("@/lib/forestal/cubicacion-comparar");
    const a = registro([pz("a1", 7, 1.5, 7, 9, "Tornillo")]);
    expect(lecturaComparacion(compararLotes(a.piezas, a.piezas, "medida"))).toMatch(/mismas piezas/);
  });
});
