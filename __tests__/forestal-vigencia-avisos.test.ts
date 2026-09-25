/**
 * Avisar antes de que venza un permiso o un plan.
 *
 * Lo que se prueba acá no es la resta de fechas —ésa ya la prueba
 * `loth-plan-vigencia.test.ts`— sino las decisiones propias de este aviso:
 * qué NO enciende un aviso, que el texto traiga el número y la consecuencia, y
 * que el «hoy» sea el día de Lima y no el UTC del turno de la tarde.
 */

import { describe, it, expect } from "vitest";
import {
  DIAS_AVISO_VENCIMIENTO,
  avisoDeVigencia,
  avisosDeVigencia,
  hoyDelLibro,
  porVencer,
  vencidos,
  type PapelConVigencia,
} from "@/lib/forestal/vigencia-avisos";

const HOY = new Date("2026-09-21T00:00:00.000Z");

const permiso = (v: Partial<PapelConVigencia> = {}): PapelConVigencia => ({
  id: "c1",
  codigo: "19-SEC/PER-FMC-2024-008",
  vigenciaHasta: "2026-11-30",
  estado: "vigente",
  clase: "permiso",
  ...v,
});

describe("qué NO enciende un aviso", () => {
  it("la vigencia sin cargar no es un aviso rojo: es un dato que falta y lo reclama otro panel", () => {
    expect(avisoDeVigencia(permiso({ vigenciaHasta: null }), HOY)).toBeNull();
    expect(avisoDeVigencia(permiso({ vigenciaHasta: "" }), HOY)).toBeNull();
  });

  it("un papel cerrado o suspendido no vence: esas son decisiones administrativas", () => {
    expect(avisoDeVigencia(permiso({ estado: "cerrado", vigenciaHasta: "2020-01-01" }), HOY)).toBeNull();
    expect(avisoDeVigencia(permiso({ estado: "suspendido", vigenciaHasta: "2020-01-01" }), HOY)).toBeNull();
  });

  it("con más del umbral por delante no molesta", () => {
    const lejos = new Date(HOY.getTime() + (DIAS_AVISO_VENCIMIENTO + 1) * 86_400_000);
    expect(avisoDeVigencia(permiso({ vigenciaHasta: lejos }), HOY)).toBeNull();
    // Justo en el borde sí avisa: el umbral es el declarado, no uno suelto acá.
    const borde = new Date(HOY.getTime() + DIAS_AVISO_VENCIMIENTO * 86_400_000);
    expect(avisoDeVigencia(permiso({ vigenciaHasta: borde }), HOY)?.nivel).toBe("por_vencer");
  });

  it("una fecha ilegible no inventa un vencimiento", () => {
    expect(avisoDeVigencia(permiso({ vigenciaHasta: "el año que viene" }), HOY)).toBeNull();
  });
});

describe("el texto dice el número y la consecuencia", () => {
  it("permiso vencido: hace cuántos días, y que la guía queda observada", () => {
    const a = avisoDeVigencia(permiso({ vigenciaHasta: "2026-09-09" }), HOY)!;
    expect(a.nivel).toBe("vencido");
    expect(a.dias).toBe(-12);
    expect(a.gravedad).toBe("urgente");
    expect(a.titulo).toBe("Permiso 19-SEC/PER-FMC-2024-008 venció hace 12 días");
    expect(a.detalle).toContain("La guía que emitas con este papel queda observada");
    expect(a.detalle).toContain("ARFFS");
  });

  it("permiso por vencer: cuántos días faltan, sin plural de más", () => {
    expect(avisoDeVigencia(permiso({ vigenciaHasta: "2026-09-22" }), HOY)!.titulo)
      .toBe("Permiso 19-SEC/PER-FMC-2024-008 vence en 1 día");
    expect(avisoDeVigencia(permiso({ vigenciaHasta: "2026-09-21" }), HOY)!.titulo)
      .toBe("Permiso 19-SEC/PER-FMC-2024-008 vence hoy");
  });

  it("el plan habla de su saldo, que es lo que se pierde: no repite el texto del permiso", () => {
    const a = avisoDeVigencia({ id: "p1", codigo: "PO-2026-001", vigenciaHasta: "2026-11-01", estado: "vigente", clase: "plan" }, HOY)!;
    expect(a.titulo).toBe("Plan de manejo PO-2026-001 vence en 41 días");
    expect(a.detalle).toContain("el saldo autorizado no pasa al período siguiente");
  });

  it("sin código cargado nombra el papel, no inventa un código", () => {
    const a = avisoDeVigencia({ id: "p2", codigo: null, vigenciaHasta: "2026-09-09", estado: "vigente", clase: "plan" }, HOY)!;
    expect(a.titulo).toBe("Plan de manejo venció hace 12 días");
  });

  it("dentro de la semana es rojo; más lejos, azul", () => {
    expect(avisoDeVigencia(permiso({ vigenciaHasta: "2026-09-28" }), HOY)!.gravedad).toBe("urgente");
    expect(avisoDeVigencia(permiso({ vigenciaHasta: "2026-09-29" }), HOY)!.gravedad).toBe("proximo");
  });
});

describe("la lista", () => {
  const papeles: PapelConVigencia[] = [
    permiso({ id: "a", codigo: "A", vigenciaHasta: "2026-10-30" }),
    permiso({ id: "b", codigo: "B", vigenciaHasta: "2026-08-01" }),
    permiso({ id: "c", codigo: "C", vigenciaHasta: "2030-01-01" }),
    permiso({ id: "d", codigo: "D", vigenciaHasta: null }),
  ];

  it("ordena lo vencido primero y separa lo que ya pasó de lo que se viene", () => {
    const avisos = avisosDeVigencia(papeles, HOY);
    expect(avisos.map((a) => a.codigo)).toEqual(["B", "A"]);
    expect(vencidos(avisos).map((a) => a.codigo)).toEqual(["B"]);
    expect(porVencer(avisos).map((a) => a.codigo)).toEqual(["A"]);
  });

  it("la clave es estable por papel: sirve de key y no se duplica entre clases", () => {
    const a = avisoDeVigencia(permiso({ id: "x" }), HOY)!;
    const b = avisoDeVigencia({ id: "x", codigo: "X", vigenciaHasta: "2026-11-30", estado: "vigente", clase: "plan" }, HOY)!;
    expect(a.clave).not.toBe(b.clave);
    expect(a.clave).toBe(avisoDeVigencia(permiso({ id: "x" }), HOY)!.clave);
  });
});

describe("el hoy es el día de Lima, no el UTC", () => {
  it("a las 20:00 de Pucallpa el UTC ya es mañana y el plazo no se acorta un día", () => {
    // 2026-09-21 20:00 en Lima (UTC-5) = 2026-09-22T01:00Z.
    const tarde = new Date("2026-09-22T01:00:00.000Z");
    expect(hoyDelLibro(tarde).toISOString()).toBe("2026-09-21T00:00:00.000Z");

    const conLima = avisoDeVigencia(permiso({ vigenciaHasta: "2026-09-30" }), hoyDelLibro(tarde))!;
    const conUtcCrudo = avisoDeVigencia(permiso({ vigenciaHasta: "2026-09-30" }), tarde)!;
    expect(conLima.titulo).toContain("9 días");
    // Sin el ajuste, el mismo permiso diría un día menos.
    expect(conUtcCrudo.titulo).toContain("8 días");
  });
});
