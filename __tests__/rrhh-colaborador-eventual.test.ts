import { describe, expect, it } from "vitest";
import { colaboradorAccionSchema, colaboradorCrearSchema } from "@/lib/rrhh/schemas";

describe("Colaborador.eventual (ADR-506)", () => {
  it("el alta lo toma como false si no viene", () => {
    const r = colaboradorCrearSchema.safeParse({ nombre: "Chofer de paso" });
    expect(r.success && r.data.eventual).toBe(false);
  });

  it("el alta acepta true y rechaza un no-booleano", () => {
    const ok = colaboradorCrearSchema.safeParse({ nombre: "Chofer de paso", eventual: true });
    expect(ok.success && ok.data.eventual).toBe(true);
    expect(colaboradorCrearSchema.safeParse({ nombre: "Chofer de paso", eventual: "si" }).success).toBe(false);
  });

  it("editar acepta eventual solo y rechaza un no-booleano", () => {
    const ok = colaboradorAccionSchema.safeParse({ action: "editar", eventual: true });
    expect(ok.success && ok.data.action === "editar" && ok.data.eventual).toBe(true);
    expect(colaboradorAccionSchema.safeParse({ action: "editar", eventual: 1 }).success).toBe(false);
  });
});
