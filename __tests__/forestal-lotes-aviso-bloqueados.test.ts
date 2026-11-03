import { describe, expect, it } from "vitest";
import { avisoDeBloqueados } from "@/components/admin/forestal/ctp-lotes-seleccion";

describe("aviso de los lotes que no van a la guía (03-11)", () => {
  it("agrupa por motivo: el motivo una vez, los códigos juntos y con tope", () => {
    const aviso = avisoDeBloqueados([
      { code: "27-2026", motivo: "sin_produccion" },
      { code: "28-2026", motivo: "sin_produccion" },
      { code: "9-2026", motivo: "usada" },
      { code: "32-2026", motivo: "sin_produccion" },
      { code: "33-2026", motivo: "sin_produccion" },
    ]);
    expect(aviso).toBe(
      "No van a la guía: 27-2026, 28-2026, 32-2026 y 1 más (sin producción declarada) · 9-2026 (marcado como usado: desmárcalo primero).",
    );
  });

  it("sin bloqueados no hay aviso", () => {
    expect(avisoDeBloqueados([])).toBeNull();
  });
});
