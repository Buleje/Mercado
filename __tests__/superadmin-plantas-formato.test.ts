/**
 * Plantas forestales del superadmin (17-10): cómo se escriben las cifras, el
 * período elegido y el orden de las incoherencias. Un null es «—», nunca 0; los
 * pies tablares siempre con «≈»; las fechas del libro, en hora de Lima.
 */
import { describe, expect, it } from "vitest";
import { diaCorto, m3, pies, rangoDePeriodo } from "@/components/superadmin/plantas/formato";
import { ordenarPorM3 } from "@/components/superadmin/plantas/use-incoherencias";
import type { IncoherenciaPlanta } from "@/lib/superadmin/plantas-forestales/tipos";

const inc = (id: string, gravedad: IncoherenciaPlanta["gravedad"], m3EnJuego: number | null): IncoherenciaPlanta => ({
  id,
  tenantId: "t",
  plantaNombre: "Planta",
  origen: "saldo",
  clave: id,
  gravedad,
  titulo: id,
  detalle: "",
  m3EnJuego,
  referencia: null,
  enlaceLibro: "tab=ctp-libro-operaciones",
});

describe("cifras", () => {
  it("null sale «—», nunca 0; los PT llevan «≈»", () => {
    expect(m3(null)).toBe("—");
    expect(pies(undefined)).toBe("—");
    expect(m3(0)).toMatch(/^0[.,]000 m³$/);
    expect(pies(424)).toMatch(/^≈ 424 PT$/);
  });

  it("diaCorto: fecha sola en UTC y fecha con hora en Lima (a las 20:00 de Lima el UTC ya es mañana)", () => {
    expect(diaCorto("2026-09-10")).toBe("jueves 10/09");
    expect(diaCorto("2026-09-11T01:00:00Z")).toBe("jueves 10/09");
    expect(diaCorto(null)).toBe("—");
  });
});

describe("rangoDePeriodo", () => {
  it("mes, mes pasado (cruza el año), 90 días y año", () => {
    expect(rangoDePeriodo("mes", "2026-10-17")).toEqual({ desde: "2026-10-01", hasta: "2026-10-17" });
    expect(rangoDePeriodo("mes-pasado", "2026-01-05")).toEqual({ desde: "2025-12-01", hasta: "2025-12-31" });
    expect(rangoDePeriodo("mes-pasado", "2026-03-31")).toEqual({ desde: "2026-02-01", hasta: "2026-02-28" });
    expect(rangoDePeriodo("90d", "2026-10-17")).toEqual({ desde: "2026-07-20", hasta: "2026-10-17" });
    expect(rangoDePeriodo("anio", "2026-10-17")).toEqual({ desde: "2026-01-01", hasta: "2026-10-17" });
  });
});

describe("ordenarPorM3", () => {
  it("más m³ en juego primero; las que no se miden en m³ al final, error antes que aviso", () => {
    const orden = ordenarPorM3([inc("a", "warning", null), inc("b", "error", 1), inc("c", "warning", 5), inc("d", "error", null)]);
    expect(orden.map((i) => i.id)).toEqual(["c", "b", "d", "a"]);
  });
});
