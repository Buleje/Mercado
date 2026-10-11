import { describe, expect, it } from "vitest";
import { lotesPorSemana, masProducidas, resumenDelMes } from "@/components/admin/recetas/produccion-calculos";
import { disponibilidadDe, margenDe, type LoteProducido, type ProductInfo } from "@/components/admin/recetas/tipos";

const lote = (id: string, recetaId: string, cantidad: number, costoReal: number, producidoEn: string, recetaNombre?: string): LoteProducido => ({ id, recetaId, recetaNombre, cantidad, costoReal, producidoEn });

describe("Recetas · cuentas de la pantalla", () => {
  const ahora = new Date(2026, 9, 11, 12); // domingo 11-10-2026
  const lotes = [
    lote("a", "r1", 10, 50, "2026-10-09T15:00:00", "Pan"),
    lote("b", "r1", 5, 30, "2026-10-02T15:00:00", "Pan"),
    lote("c", "r2", 3, 12, "2026-09-20T15:00:00", "Jugo"),
  ];

  it("resume sólo el mes en curso", () => {
    expect(resumenDelMes(lotes, ahora)).toEqual({ lotes: 2, unidades: 15, costoPromedio: 40 });
    expect(resumenDelMes([], ahora)).toEqual({ lotes: 0, unidades: 0, costoPromedio: 0 });
  });

  it("agrupa en 4 semanas y no pierde lotes recientes", () => {
    const semanas = lotesPorSemana(lotes, ahora);
    expect(semanas).toHaveLength(4);
    expect(semanas.reduce((s, w) => s + w.lotes, 0)).toBe(3);
  });

  it("ordena las más producidas con su nombre real", () => {
    expect(masProducidas(lotes)).toEqual([{ nombre: "Pan", unidades: 15 }, { nombre: "Jugo", unidades: 3 }]);
  });

  it("margen y disponibilidad", () => {
    const productos: Record<number, ProductInfo> = {
      1: { id: 1, name: "Harina", price: 5, stock: 10 },
      2: { id: 2, name: "Pan", price: 10 },
      3: { id: 3, name: "Sal", price: 1, stock: 0 },
    };
    expect(margenDe({ productoId: 2, costoTotal: 6 }, productos)).toBe(40);
    expect(margenDe({ productoId: undefined, costoTotal: 6 }, productos)).toBeNull();
    expect(margenDe({ productoId: 2, costoTotal: 0 }, productos)).toBeNull();
    const ing = (productoId: number, cantidad: number) => ({ id: String(productoId), recetaId: "r", productoId, cantidad, unidad: "kg" });
    expect(disponibilidadDe({ ingredientes: [ing(1, 2), ing(3, 1)] }, productos)).toEqual({ total: 2, disponibles: 1, faltan: 1 });
  });
});
