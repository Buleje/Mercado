import { describe, expect, it } from "vitest";
import { agruparAtrasadas } from "@/components/admin/administracion/aviso/AtrasadasAgrupadas";
import type { OcurrenciaDTO } from "@/lib/agenda/tipos";

/* Sólo los campos que mira el agrupado: la fila completa la arma ListaOcurrencias. */
const o = (actividadId: string, fecha: string): OcurrenciaDTO =>
  ({ actividadId, fecha, nombre: actividadId, estado: "atrasada", href: "/admin" }) as unknown as OcurrenciaDTO;

describe("agruparAtrasadas (ventana de avisos, Brandon 31-10)", () => {
  it("una fila por actividad, con sus días del más viejo al más nuevo", () => {
    const grupos = agruparAtrasadas([
      o("asistencia", "2026-10-30"),
      o("facturas", "2026-10-28"),
      o("asistencia", "2026-10-28"),
      o("asistencia", "2026-10-29"),
    ]);
    expect(grupos.map((g) => g.actividadId)).toEqual(["asistencia", "facturas"]);
    expect(grupos[0].ocurrencias.map((x) => x.fecha)).toEqual(["2026-10-28", "2026-10-29", "2026-10-30"]);
  });

  it("a igual cantidad de días, primero la que empezó antes; no pierde ninguna", () => {
    const entrada = [o("b", "2026-10-29"), o("a", "2026-10-27"), o("b", "2026-10-30"), o("a", "2026-10-28"), o("c", "2026-10-30")];
    const grupos = agruparAtrasadas(entrada);
    expect(grupos.map((g) => g.actividadId)).toEqual(["a", "b", "c"]);
    expect(grupos.reduce((n, g) => n + g.ocurrencias.length, 0)).toBe(entrada.length);
  });

  it("sin atrasadas no arma grupos", () => {
    expect(agruparAtrasadas([])).toEqual([]);
  });
});
