/**
 * Inicio › Inventario (2026-10-09): qué entra en cada bloque y cómo se rotula.
 * Sólo presentación: las cifras llegan de InventarioDashboard; acá se prueba
 * que «no se vende» (sentinela 999) no se muestre como «se agota en 60 días».
 */
import { describe, expect, it } from "vitest";
import {
  diasTexto,
  filasConCobertura,
  filasPorAgotarse,
  resumenSalidas,
  solesEnteros,
} from "@/components/admin/inicio/InventarioCharts";

const proy = (nombre: string, diasRestantes: number, diario: number) => ({
  nombre,
  stock: 10,
  diasRestantes,
  diario,
  status: (diasRestantes < 7 ? "critico" : diasRestantes < 14 ? "alerta" : "ok") as "critico" | "alerta" | "ok",
});

describe("filasPorAgotarse", () => {
  it("saca los que no se vendieron en 30 días (999 = no se agota al ritmo actual)", () => {
    const filas = [proy("Arroz", 3, 3.3), proy("Azúcar", 999, 0), proy("Aceite", 20, 0.5)];
    expect(filasPorAgotarse(filas).map((f) => f.nombre)).toEqual(["Arroz", "Aceite"]);
  });

  it("todos sin venta → lista vacía (el bloque se oculta)", () => {
    expect(filasPorAgotarse([proy("A", 999, 0), proy("B", 999, 0)])).toEqual([]);
  });
});

describe("filasConCobertura", () => {
  it("deja fuera la sentinela 999", () => {
    const filas = [
      { nombre: "A", dias: 4, status: "critico" as const },
      { nombre: "B", dias: 999, status: "ok" as const },
    ];
    expect(filasConCobertura(filas)).toHaveLength(1);
  });
});

describe("resumenSalidas", () => {
  const dia = (clave: string, salidas: number) => ({ clave, dia: clave.slice(5), entradas: 0, salidas });

  it("suma, cuenta días con venta y elige el mejor día", () => {
    const r = resumenSalidas([dia("2026-10-07", 0), dia("2026-10-08", 5), dia("2026-10-09", 2)]);
    expect(r.total).toBe(7);
    expect(r.diasConVenta).toBe(2);
    expect(r.pico?.clave).toBe("2026-10-08");
  });

  it("sin ventas → sin mejor día", () => {
    expect(resumenSalidas([dia("2026-10-09", 0)]).pico).toBeNull();
  });
});

describe("rótulos", () => {
  it("días en palabras", () => {
    expect(diasTexto(0)).toBe("hoy");
    expect(diasTexto(1)).toBe("1 día");
    expect(diasTexto(12)).toBe("12 días");
  });

  it("soles sin centavos para el valor del stock", () => {
    expect(solesEnteros(4136.4)).toBe("S/ 4,136");
  });
});
