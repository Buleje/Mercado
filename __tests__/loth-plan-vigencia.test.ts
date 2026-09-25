/**
 * Vigencia del plan de manejo: cuánto queda, no sólo entre qué fechas va.
 */

import { describe, it, expect } from "vitest";
import { estadoVigencia, avanceDelPeriodo, DIAS_AVISO_VENCIMIENTO } from "@/lib/forestal/loth-plan-vigencia";

const HOY = new Date("2026-09-21T00:00:00.000Z");

describe("estadoVigencia", () => {
  it("con dos años por delante está vigente y cuenta en DÍAS, como el panel de Zafra", () => {
    const e = estadoVigencia("2028-03-20", "vigente", HOY);
    expect(e.nivel).toBe("vigente");
    expect(e.tono).toBe("ok");
    // La misma unidad que «quedan 546 días» de Zafra: dos cifras contiguas de
    // la misma pantalla no pueden contar lo mismo con distinta precisión.
    expect(e.texto).toBe("Vigente · quedan 546 días");
  });

  it("a menos de 90 días avisa, con los días exactos", () => {
    const e = estadoVigencia("2026-11-01", "vigente", HOY);
    expect(e.nivel).toBe("por_vencer");
    expect(e.tono).toBe("warn");
    expect(e.diasRestantes).toBe(41);
    expect(e.texto).toBe("Vence en 41 días");
  });

  it("el umbral es el declarado, no un número suelto en el código", () => {
    const limite = new Date(HOY.getTime() + DIAS_AVISO_VENCIMIENTO * 86_400_000);
    expect(estadoVigencia(limite, "vigente", HOY).nivel).toBe("por_vencer");
    const unDiaMas = new Date(HOY.getTime() + (DIAS_AVISO_VENCIMIENTO + 1) * 86_400_000);
    expect(estadoVigencia(unDiaMas, "vigente", HOY).nivel).toBe("vigente");
  });

  it("vence hoy: no es «queda 1 día», es hoy", () => {
    const e = estadoVigencia("2026-09-21", "vigente", HOY);
    expect(e.texto).toBe("Vence hoy");
    expect(e.tono).toBe("danger");
  });

  it("vencido dice hace cuánto, aunque la base siga diciendo vigente", () => {
    const e = estadoVigencia("2026-09-01", "vigente", HOY);
    expect(e.nivel).toBe("vencido");
    expect(e.texto).toBe("Vencido hace 20 días");
    expect(e.tono).toBe("danger");
  });

  it("cerrado y suspendido son decisiones administrativas: no se discuten con el calendario", () => {
    expect(estadoVigencia("2028-03-20", "cerrado", HOY).nivel).toBe("cerrado");
    expect(estadoVigencia("2028-03-20", "suspendido", HOY).nivel).toBe("suspendido");
    expect(estadoVigencia("2028-03-20", "suspendido", HOY).tono).toBe("danger");
  });

  it("sin fecha de fin NO dice «vigente»: dice que falta el dato", () => {
    const e = estadoVigencia(null, "vigente", HOY);
    expect(e.nivel).toBe("sin_fecha");
    expect(e.texto).toContain("Sin fecha");
    expect(e.tono).toBe("warn");
  });

  it("una fecha ilegible se reporta, no se traga", () => {
    expect(estadoVigencia("no-es-fecha", "vigente", HOY).nivel).toBe("sin_fecha");
  });

  it("no corre un día por el huso de Pucallpa: compara por día calendario en UTC", () => {
    // 20:00 en Lima/Pucallpa (UTC-5) del 21 = 01:00 UTC del 22.
    const nocheEnPucallpa = new Date("2026-09-22T01:00:00.000Z");
    const e = estadoVigencia("2026-09-22", "vigente", nocheEnPucallpa);
    expect(e.texto).toBe("Vence hoy");
    expect(e.nivel).toBe("por_vencer");
  });
});

describe("avanceDelPeriodo", () => {
  it("a mitad del período da ~50%", () => {
    expect(avanceDelPeriodo("2026-01-01", "2026-12-31", new Date("2026-07-02T00:00:00.000Z"))).toBe(50);
  });

  it("antes de empezar es 0 y después de terminar es 100 — nunca se pasa", () => {
    expect(avanceDelPeriodo("2026-01-01", "2026-12-31", new Date("2025-06-01T00:00:00.000Z"))).toBe(0);
    expect(avanceDelPeriodo("2026-01-01", "2026-12-31", new Date("2027-06-01T00:00:00.000Z"))).toBe(100);
  });

  it("sin fechas no inventa un porcentaje", () => {
    expect(avanceDelPeriodo(null, "2026-12-31", HOY)).toBeNull();
    expect(avanceDelPeriodo("2026-01-01", null, HOY)).toBeNull();
  });

  it("un período invertido o de un día no da un porcentaje absurdo", () => {
    expect(avanceDelPeriodo("2026-12-31", "2026-01-01", HOY)).toBeNull();
  });
});
