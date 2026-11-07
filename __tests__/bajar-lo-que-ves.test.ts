/**
 * «Bajar lo que ves» (25-10): cada fila filtrada sale a Excel con el rótulo de
 * cada columna con filtro. Las listas (un pedido con dos métodos de pago) van
 * en una celda separadas por «·»; los rangos y fechas, el número o la fecha
 * tal cual; lo que falta, celda vacía (nunca «undefined» ni «null»).
 */
import { describe, expect, it } from "vitest";
import { filaParaExcel } from "@/components/admin/shared/bajar-lo-que-ves";
import type { ColumnaFiltro } from "@/lib/admin/filtros-columna";

type Fila = { cliente: string; pagos: string[]; saldo: number | null; vence: string | null };
const COLUMNAS: readonly ColumnaFiltro<Fila>[] = [
  { id: "cliente", label: "Cliente", tipo: "texto", valor: (f) => f.cliente },
  { id: "pagos", label: "Pago", tipo: "multi", valor: (f) => f.pagos },
  { id: "saldo", label: "Saldo", tipo: "rango", numero: (f) => f.saldo },
  { id: "vence", label: "Vence", tipo: "fecha", numero: (f) => f.vence },
];

describe("filaParaExcel", () => {
  it("una celda por columna con filtro, con su rótulo", () => {
    expect(filaParaExcel({ cliente: "Rosa Pérez", pagos: ["Yape", "Efectivo"], saldo: 120.5, vence: "2026-10-31" }, COLUMNAS)).toEqual({
      Cliente: "Rosa Pérez",
      Pago: "Yape · Efectivo",
      Saldo: 120.5,
      Vence: "2026-10-31",
    });
  });
  it("lo que falta es una celda vacía", () => {
    expect(filaParaExcel({ cliente: "Juan", pagos: [], saldo: null, vence: null }, COLUMNAS)).toEqual({
      Cliente: "Juan",
      Pago: "",
      Saldo: "",
      Vence: "",
    });
  });
});
