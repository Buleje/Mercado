import { describe, expect, it } from "vitest";
import { dineroDeBitacora, leerEntradaDeCaja } from "@/lib/caja/bitacora-cambios";

describe("bitácora de la caja con antes → después (M28)", () => {
  it("cambio de medio: medio y esperado, con y sin motivo", () => {
    const sin = leerEntradaDeCaja("Editar", "Medio corregido · venta de S/22.00 «Arroz 5 kg»: Efectivo → Yape (esperado S/184.90 → S/162.90)");
    expect(sin).toEqual({
      resumen: "venta de S/22.00 «Arroz 5 kg»",
      cambios: [
        { campo: "Medio", antes: "Efectivo", despues: "Yape" },
        { campo: "Esperado", antes: "S/ 184.90", despues: "S/ 162.90" },
      ],
      motivo: null,
    });
    const con = leerEntradaDeCaja("Editar", "Medio corregido · ingreso de S/50.00: Yape → Efectivo (esperado S/100.00 → S/150.00) — motivo: el cliente pagó en billete");
    expect(con.motivo).toBe("el cliente pagó en billete");
    expect(con.cambios[0]).toEqual({ campo: "Medio", antes: "Yape", despues: "Efectivo" });
  });

  it("cierre con conteo: estado, efectivo y faltante en rojo; las notas son el motivo", () => {
    const e = leerEntradaDeCaja("Cerrar", "Cierre con S/180.00 (esperado S/184.90, diferencia S/-4.90) — faltó cambio");
    expect(e.cambios).toEqual([
      { campo: "Estado", antes: "Abierta", despues: "Cerrada" },
      { campo: "Efectivo", antes: "Esperado S/ 184.90", despues: "Contado S/ 180.00" },
      { campo: "Faltante", antes: null, despues: "S/ 4.90", tono: "faltante" },
    ]);
    expect(e.motivo).toBe("faltó cambio");
    expect(leerEntradaDeCaja("Cerrar", "Cierre con S/184.90 (esperado S/184.90, diferencia S/0.00)").cambios).toHaveLength(2);
  });

  it("arqueo con sobrante; cierre sin conteo; apertura con fondo", () => {
    const a = leerEntradaDeCaja("Arquear", "Arqueo con S/165.00 (esperado S/162.90, diferencia S/2.10)");
    expect(a.resumen).toBe("Arqueo");
    expect(a.cambios.at(-1)).toEqual({ campo: "Sobrante", antes: null, despues: "S/ 2.10", tono: "sobrante" });
    expect(leerEntradaDeCaja("Cerrar", "Cierre sin conteo desde Cerrar turno (esperado S/184.90)").cambios[1]).toEqual({
      campo: "Efectivo",
      antes: "Esperado S/ 184.90",
      despues: "Nadie contó",
    });
    expect(leerEntradaDeCaja("Abrir", "Apertura de caja con S/200.00 — turno mañana")).toEqual({
      resumen: "Apertura de caja",
      cambios: [
        { campo: "Estado", antes: "Cerrada", despues: "Abierta" },
        { campo: "Fondo", antes: null, despues: "S/ 200.00" },
      ],
      motivo: "turno mañana",
    });
  });

  it("ingreso y egreso a mano, con medio o sin descripción", () => {
    expect(leerEntradaDeCaja("Crear", "Egreso manual de S/60.00 por Yape — Adelanto a Rosa")).toEqual({
      resumen: "Adelanto a Rosa",
      cambios: [
        { campo: "Egreso", antes: null, despues: "−S/ 60.00" },
        { campo: "Medio", antes: null, despues: "Yape" },
      ],
      motivo: null,
    });
    expect(leerEntradaDeCaja("Crear", "Ingreso manual de S/50.00 — ").resumen).toBe("Ingreso a mano");
  });

  it("un texto que no conoce queda tal cual, sin chips", () => {
    expect(leerEntradaDeCaja("Editar", "Algo distinto")).toEqual({ resumen: "Algo distinto", cambios: [], motivo: null });
    expect(dineroDeBitacora("S/-4.90")).toBe("−S/ 4.90");
    expect(dineroDeBitacora("S/ 1,250.00")).toBe("S/ 1,250.00");
  });
});
