/**
 * El viaje de un despacho y el reparto de su precio (`lib/forestal/despacho-viaje`).
 *
 * Con las 7 líneas reales de Blas del 28-10-2026 (GTF 69/70/71, una sola GRE
 * EG07-189, 7 013,33 PT): la suma cierra al céntimo, el residuo va a la
 * última línea, la línea sin volumen recibe `null` (nunca 0) y la misma GRE
 * sólo se acepta en el mismo camión.
 */
import { describe, expect, it } from "vitest";
import {
  diferenciaConLiquidacion,
  leerSoles,
  mismoViaje,
  ptDeDespacho,
  repartirPrecioViaje,
  type LineaConVolumen,
} from "@/lib/forestal/despacho-viaje";

const DESTINO = "PAC & JAL S.A.C. (RUC 20609484391) · Av. Francisco de Zela Mz F Lt 10, Villa El Salvador, Lima";
const nota = (pt: string) => `${pt} PT · Anexo 04 N° 2-19-0491390 · factura E001-318 · GRE remitente EG07-00000189`;

/** Las 7 líneas de despacho de Blas del 28-10 (m³ del libro + PT escrito en la nota). */
const BLAS: LineaConVolumen[] = [
  [1, 2.76, "1170.167"], [2, 3.984, "1689.0"], [3, 2.207, "936.0"], [4, 2.608, "1105.417"],
  [5, 3.35, "1420.5"], [6, 1.578, "669.0"], [7, 0.055, "23.25"],
].map(([lineNo, m3, pt]) => ({ id: `d${lineNo}`, lineNo: Number(lineNo), quantity: Number(m3), unit: "m3", observations: nota(String(pt)) }));

const centimos = (xs: (number | null)[]) => xs.reduce<number>((t, x) => t + Math.round((x ?? 0) * 100), 0);

describe("repartirPrecioViaje — suma exacta y residuo", () => {
  it.each([26_234.67, 1_713.62])("las 7 líneas de Blas con S/ %s suman el total al céntimo, por PT", (total) => {
    const r = repartirPrecioViaje(total, BLAS);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.base).toBe("pt");
    expect(r.ptEstimado).toBe(false);
    expect(r.ptTotal).toBe(7013.334);
    expect(centimos(r.lineas.map((l) => l.monto))).toBe(Math.round(total * 100));
    // Cada línea a ≤ 1 céntimo de su parte exacta, salvo la última, que junta el residuo.
    for (const l of r.lineas.slice(0, -1)) {
      expect(Math.abs((l.monto as number) - (total * (l.volumen as number)) / r.ptTotal)).toBeLessThanOrEqual(0.005 + 1e-9);
    }
    expect(r.precioPorPt).toBeCloseTo(total / 7013.334, 4);
  });
  it("el residuo va a la ÚLTIMA línea por N.º, aunque lleguen desordenadas", () => {
    const tres = [3, 1, 2].map((n) => ({ id: `x${n}`, lineNo: n, quantity: 1, unit: "m3", observations: null }));
    const r = repartirPrecioViaje(100, tres);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.base).toBe("m3");
    expect(r.lineas.map((l) => [l.lineNo, l.monto])).toEqual([[1, 33.33], [2, 33.33], [3, 33.34]]);
  });
  it("con una última línea diminuta el residuo nunca queda negativo", () => {
    const ls = [1, 1, 1, 0.0001].map((m3, i) => ({ id: `y${i}`, lineNo: i + 1, quantity: m3, unit: "m3", observations: null }));
    const r = repartirPrecioViaje(0.02, ls);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.lineas.every((l) => (l.monto as number) >= 0)).toBe(true);
    expect(centimos(r.lineas.map((l) => l.monto))).toBe(2);
  });
  it("si una línea no tiene PT en la nota, el viaje entero se reparte por m³ (no se mezclan)", () => {
    const ls = BLAS.map((l, i) => (i === 2 ? { ...l, observations: "sin nota" } : l));
    const r = repartirPrecioViaje(26_234.67, ls);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.base).toBe("m3");
    expect(r.ptEstimado).toBe(true);
    expect(r.m3Total).toBe(16.542);
    expect(centimos(r.lineas.map((l) => l.monto))).toBe(2_623_467);
  });
});

describe("repartirPrecioViaje — sin volumen: null, nunca 0", () => {
  it("la línea sin volumen no recibe (monto null) y las demás suman el total", () => {
    const ls = [...BLAS.slice(0, 2), { id: "vacia", lineNo: 9, quantity: null, unit: "m3", observations: null }];
    const r = repartirPrecioViaje(1000, ls);
    if (!r.ok) throw new Error(r.motivo);
    const vacia = r.lineas.find((l) => l.id === "vacia");
    expect(vacia).toEqual({ id: "vacia", lineNo: 9, volumen: null, monto: null });
    expect(r.sinVolumen).toEqual([9]);
    expect(r.lineas.some((l) => l.monto === 0)).toBe(false);
    expect(centimos(r.lineas.map((l) => l.monto))).toBe(100_000);
  });
  it("sin ninguna línea con volumen, o con total 0 / negativo, no reparte", () => {
    const sin = [{ id: "a", lineNo: 1, quantity: 0, unit: "m3", observations: null }];
    expect(repartirPrecioViaje(100, sin)).toEqual({ ok: false, motivo: "sin_volumen" });
    expect(repartirPrecioViaje(0, BLAS)).toEqual({ ok: false, motivo: "total_invalido" });
    expect(repartirPrecioViaje(-5, BLAS)).toEqual({ ok: false, motivo: "total_invalido" });
    expect(repartirPrecioViaje(100, [])).toEqual({ ok: false, motivo: "sin_lineas" });
  });
});

describe("ptDeDespacho", () => {
  it("lee el PT del comienzo de la nota, con o sin miles; ignora un «PT» en medio", () => {
    expect(ptDeDespacho({ quantity: 2.76, unit: "m3", observations: nota("1170.167") })).toEqual({ pt: 1170.167, fuente: "nota" });
    expect(ptDeDespacho({ quantity: 2.76, unit: "m3", observations: "1,170.17 PT" })).toEqual({ pt: 1170.17, fuente: "nota" });
    expect(ptDeDespacho({ quantity: 500, unit: "pt", observations: null })).toEqual({ pt: 500, fuente: "cantidad" });
    expect(ptDeDespacho({ quantity: 2.76, unit: "m3", observations: "Anexo 23 PT" })).toBeNull();
  });
});

describe("mismoViaje", () => {
  const l = (o: { dia?: string; placa?: string; destino?: string | null; ruc?: string }) => ({
    entryDate: new Date(`${o.dia ?? "2026-10-28"}T00:00:00Z`),
    destino: o.destino === undefined ? DESTINO : o.destino,
    gtfDatos: o.placa || o.ruc ? { vehiculo: { placa: o.placa ?? "" }, destinatario: { docNumero: o.ruc ?? "", nombre: "" } } : null,
  });
  it("las GTF de Blas del 28-10 (sin placa, mismo destinatario) son el mismo viaje", () => {
    expect(mismoViaje(l({}), l({}))).toEqual({ mismo: true });
  });
  it("otro día, otra placa u otro destinatario NO", () => {
    expect(mismoViaje(l({}), l({ dia: "2026-10-27" }))).toEqual({ mismo: false, motivo: "salió otro día (27-10)" });
    expect(mismoViaje(l({ placa: "W2D-853" }), l({ placa: "V2H-901" }))).toEqual({ mismo: false, motivo: "otro camión (placa V2H901)" });
    expect(mismoViaje(l({}), l({ destino: "Maderas del Sur (RUC 20100070970)" }))).toEqual({ mismo: false, motivo: "va a otro destinatario" });
  });
  it("misma placa sin destinatario sí; el RUC manda sobre el nombre escrito distinto", () => {
    expect(mismoViaje(l({ placa: "W2D-853", destino: null }), l({ placa: "w2d853", destino: null }))).toEqual({ mismo: true });
    expect(mismoViaje(l({ destino: "Pac y Jal SAC (RUC 20609484391)" }), l({}))).toEqual({ mismo: true });
  });
  it("sin placa ni destinatario en ninguna no hay cómo saberlo: no es el mismo", () => {
    expect(mismoViaje(l({ destino: null }), l({ destino: null })).mismo).toBe(false);
  });
});

describe("diferenciaConLiquidacion", () => {
  it("factura E001-318 contra la liquidación de Rivers: faltan S/ 24,521.05", () => {
    expect(diferenciaConLiquidacion(1_713.62, 26_234.67)).toEqual({ diferencia: 24_521.05, estado: "falta" });
    expect(diferenciaConLiquidacion(26_234.67, 26_234.67)).toEqual({ diferencia: 0, estado: "cuadra" });
    expect(diferenciaConLiquidacion(30_000, 26_234.67)).toEqual({ diferencia: -3_765.33, estado: "sobra" });
  });
});

describe("leerSoles", () => {
  it("lee el monto como lo escribe el dueño; vacío o ilegible = null", () => {
    expect(["26234.67", "26,234.67", "26.234,67", "S/ 1 713,62", "1713.6", "26234", "26,234", "1.000.000"].map(leerSoles)).toEqual([
      26_234.67, 26_234.67, 26_234.67, 1_713.62, 1_713.6, 26_234, 26_234, 1_000_000,
    ]);
    expect(["", "abc", "0", "-5", "12,3456", "1.2.3,4.5"].map(leerSoles)).toEqual([null, null, null, null, null, null]);
  });
});
