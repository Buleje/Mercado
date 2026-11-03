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
      "Todavía no se despachan con guía: 27-2026, 28-2026, 32-2026 y 1 más (sin producción declarada) · 9-2026 (marcado como usado: desmárcalo primero).",
    );
  });

  it("en consumo y sin producción: dice que primero se reparte en la distribución (Brandon 03-11)", () => {
    expect(
      avisoDeBloqueados([
        { code: "28-2026", motivo: "por_repartir" },
        { code: "32-2026", motivo: "por_repartir" },
        { code: "33-2026", motivo: "por_repartir" },
      ]),
    ).toBe("Todavía no se despachan con guía: 28-2026, 32-2026, 33-2026 (primero repártelos en la distribución y declara lo que salió).");
    expect(avisoDeBloqueados([{ code: "28-2026", motivo: "por_repartir" }])).toMatch(/primero repártelo en la distribución/);
  });

  it("sin bloqueados no hay aviso", () => {
    expect(avisoDeBloqueados([])).toBeNull();
  });
});
