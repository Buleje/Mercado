/**
 * ADR-457 · cierre-para-contador: los gastos entran al mes con los MISMOS bordes que la pestaña
 * Gastos (días UTC) y se muestran con su día, sin correrlo; los errores de opciones salen en español.
 */
import { describe, expect, it } from "vitest";
import { consultaDeGastos, filasDeGastos, rangoDelMes } from "@/extensiones/cierre-para-contador/filas";
import { opcionesCierreParaContador } from "@/extensiones/cierre-para-contador/manifest";
import { explicarIssues } from "@/components/superadmin/piezas/errores-de-opciones";

// Lo que hace /api/expenses GET con `from`/`to` sin hora: día UTC completo.
function loQueTrae(consulta: string) {
  const q = new URLSearchParams(consulta);
  const hasta = new Date(q.get("to")!);
  hasta.setUTCHours(23, 59, 59, 999);
  return { desde: new Date(q.get("from")!), hasta };
}
const entra = (d: Date, b: { desde: Date; hasta: Date }) => d >= b.desde && d <= b.hasta;
const consultaDelMes = (mes: string) => {
  const r = rangoDelMes(mes)!;
  return loQueTrae(consultaDeGastos(r.desde, r.hasta));
};

describe("gastos del mes", () => {
  it("un gasto del 01-09 (se guarda 00:00 UTC) entra en setiembre, no en agosto, y sale con su fecha", () => {
    const gasto = new Date("2026-09-01");
    expect(entra(gasto, consultaDelMes("2026-09"))).toBe(true);
    expect(entra(gasto, consultaDelMes("2026-08"))).toBe(false);
    const [f] = filasDeGastos([{ id: 1, date: gasto.toISOString(), amount: 10 }], ["fecha", "monto"]);
    expect(f["Fecha"]).toBe("2026-09-01");
  });

  it("el gasto del 01-10 no entra en el Excel de setiembre", () => {
    expect(entra(new Date("2026-10-01"), consultaDelMes("2026-09"))).toBe(false);
    expect(entra(new Date("2026-09-30"), consultaDelMes("2026-09"))).toBe(true);
  });

  it("el gasto del 19-09 de main (00:00 UTC) sale «2026-09-19»", () => {
    const [f] = filasDeGastos([{ id: 2, date: "2026-09-19T00:00:00.000Z", amount: 5 }], ["fecha"]);
    expect(f["Fecha"]).toBe("2026-09-19");
  });
});

describe("errores de las opciones", () => {
  it("desmarcar todas las columnas dice el nombre del campo y qué hacer, en español", () => {
    const r = opcionesCierreParaContador.safeParse({ columnasVentas: [] });
    expect(r.success).toBe(false);
    const msj = explicarIssues(r.error!.issues, { columnasVentas: "Columnas de ventas" });
    expect(msj).toEqual(["Columnas de ventas: elige al menos una opción"]);
  });

  it("sin rótulo conocido usa la clave en palabras, nunca el texto de Zod", () => {
    const r = opcionesCierreParaContador.safeParse({ contador: "x".repeat(80) });
    expect(explicarIssues(r.error!.issues)).toEqual(["Contador: admite como máximo 60 letras"]);
  });
});
