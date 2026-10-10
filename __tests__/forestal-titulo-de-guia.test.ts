import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parsearConsultaGtf } from "@/lib/forestal/serfor-gtf";
import { bloqueoRolTitulo, planearTitulo, tituloDesdeFicha, type IngresoParaTitulo } from "@/lib/forestal/titulo-de-guia";

const ingreso = (o: Partial<IngresoParaTitulo> = {}): IngresoParaTitulo => ({
  id: o.id ?? "e1",
  especie: "Ana Caspi",
  status: "validado",
  anulado: false,
  originCode: null,
  originSourceNumber: null,
  contratoId: null,
  periodoCerrado: null,
  ...o,
});
const pedido = { originCode: "CONC-25-001", originSourceNumber: "R.D. 123-2025", contratoId: "ctr1" };

describe("planearTitulo — llenar el hueco del título, nunca pisar", () => {
  it("un ingreso validado sin título recibe código, resolución y permiso", () => {
    const [p] = planearTitulo([ingreso()], pedido);
    expect(p.escribir).toEqual({ originCode: "CONC-25-001", originSourceNumber: "R.D. 123-2025", contratoId: "ctr1" });
    expect(p.motivo).toBeNull();
  });
  it("un código en blanco (espacios) cuenta como vacío", () => {
    expect(planearTitulo([ingreso({ originCode: "   " })], pedido)[0].escribir?.originCode).toBe("CONC-25-001");
  });
  it("otro título ya declarado no se pisa y se dice cuál", () => {
    const [p] = planearTitulo([ingreso({ originCode: "PMFI-9" })], pedido);
    expect(p.escribir).toBeNull();
    expect(p.motivo).toBe("ya declara PMFI-9: no se pisa");
  });
  it("el mismo título (otra grafía) sólo completa lo que falta", () => {
    const [p] = planearTitulo([ingreso({ originCode: "conc-25-001", originSourceNumber: "R.D. 9" })], pedido);
    expect(p.escribir).toEqual({ contratoId: "ctr1" });
  });
  it("mes cerrado y anulado no se tocan", () => {
    const r = planearTitulo(
      [ingreso({ id: "a", periodoCerrado: "setiembre 2026" }), ingreso({ id: "b", status: "anulado" }), ingreso({ id: "c", anulado: true })],
      pedido,
    );
    expect(r.map((p) => p.motivo)).toEqual(["mes cerrado (setiembre 2026)", "está anulado", "está anulado"]);
    expect(r.every((p) => p.escribir == null)).toBe(true);
  });
  it("nada que escribir = «ya tenía ese título»", () => {
    const [p] = planearTitulo([ingreso({ originCode: "CONC-25-001", originSourceNumber: "x", contratoId: "ctr1" })], pedido);
    expect(p.escribir).toBeNull();
    expect(p.motivo).toBe("ya tenía ese título");
  });
  it("una guía con dos especies: cada ingreso por su cuenta", () => {
    const r = planearTitulo([ingreso({ id: "a" }), ingreso({ id: "b", especie: "Cumala", originCode: "OTRO" })], pedido);
    expect(r[0].escribir).not.toBeNull();
    expect(r[1].escribir).toBeNull();
  });
});

/* ── El título que trae la ficha SERFOR (05-10, «Completar Blas con el QR») ── */

/* La ficha real 1-19-0313629: casillero 6 = 19-SEC/PER-FMC-2024-008, 8 = R.A N° D000485-2024-… */
const fichaReal = parsearConsultaGtf(readFileSync(join(__dirname, "fixtures", "serfor-gtf-encontrada.html"), "utf8"), "1-19-0313629").gtf!;

describe("tituloDesdeFicha — el título de la ficha frente a los ingresos de la guía", () => {
  it("la ficha real trae código, resolución y titular", () => {
    const t = tituloDesdeFicha([ingreso()], fichaReal, null, "admin");
    expect(t.codigo).toBe("19-SEC/PER-FMC-2024-008");
    expect(t.resolucion).toMatch(/^R\.A N° D000485-2024/);
    expect(t.titular).toBe("COMUNIDAD NATIVA SAN LUIS DE CHINCHIHUANI");
  });
  it("ingreso sin título (Blas, inventario de apertura) → se declara el código, con vínculo si es de la lista", () => {
    const t = tituloDesdeFicha([ingreso(), ingreso({ id: "e2", especie: "Cumala" })], fichaReal, "ctr9", "owner");
    expect(t).toMatchObject({ estado: "declarar", ingresos: 2, declaraCodigo: true, vinculaPermiso: true, bloqueoRol: null, omitidos: [] });
  });
  it("almacenero: el plan es declarar, pero el rol lo deja afuera (las medidas sí)", () => {
    const t = tituloDesdeFicha([ingreso()], fichaReal, null, "almacenero");
    expect(t.estado).toBe("declarar");
    expect(t.bloqueoRol).toMatch(/administrador o el dueño/);
    expect(bloqueoRolTitulo("manager")).not.toBeNull();
    expect(bloqueoRolTitulo("admin")).toBeNull();
  });
  it("el libro declara OTRO título → «distinto», no se pisa y se dice cuál", () => {
    const t = tituloDesdeFicha([ingreso({ originCode: "PMFI-9" })], fichaReal, null, "admin");
    expect(t.estado).toBe("distinto");
    expect(t.omitidos).toEqual([{ especie: "Ana Caspi", motivo: "ya declara PMFI-9: no se pisa" }]);
  });
  it("mismo código sin resolución → sólo completa la resolución (no declara el código)", () => {
    const t = tituloDesdeFicha([ingreso({ originCode: "19-sec/per-fmc-2024-008" })], fichaReal, null, "admin");
    expect(t).toMatchObject({ estado: "declarar", declaraCodigo: false, ingresos: 1 });
  });
  it("ya declarado entero → «ya_tiene»; mes cerrado → «bloqueado»; ficha sin casillero 6 → «sin_codigo»", () => {
    const completo = ingreso({ originCode: fichaReal.numeroTitulo, originSourceNumber: "x" });
    expect(tituloDesdeFicha([completo], fichaReal, null, "admin").estado).toBe("ya_tiene");
    expect(tituloDesdeFicha([ingreso({ periodoCerrado: "setiembre 2026" })], fichaReal, null, "admin").estado).toBe("bloqueado");
    const sin = tituloDesdeFicha([ingreso()], { ...fichaReal, numeroTitulo: "  " }, "ctr1", "admin");
    expect(sin).toMatchObject({ estado: "sin_codigo", codigo: null, ingresos: 0, vinculaPermiso: false });
  });
  it("dos especies, una cerrada: se declara en la abierta y la otra va a omitidos", () => {
    const t = tituloDesdeFicha([ingreso(), ingreso({ id: "e2", especie: "Cumala", periodoCerrado: "agosto 2026" })], fichaReal, null, "admin");
    expect(t).toMatchObject({ estado: "declarar", ingresos: 1, omitidos: [{ especie: "Cumala", motivo: "mes cerrado (agosto 2026)" }] });
  });
});
