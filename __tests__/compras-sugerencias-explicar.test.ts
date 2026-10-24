import { describe, expect, it } from "vitest";
import {
  agruparSugerencias,
  cantidadConUnidad,
  fechaDelCalculo,
  notaDeLaOrden,
  pasosDeLaCuenta,
} from "@/components/admin/compras/sugerencias/explicar";
import type { Sugerencia } from "@/components/admin/compras/sugerencias/tipos";

/**
 * C26/C28 (17-10): la explicación se arma con los números que mandó el
 * servidor, así no puede contradecir a la cantidad sugerida.
 */
const base: Sugerencia = {
  productId: 1, productName: "Aceite 1 L", category: "Abarrotes", currentStock: 4, stockMin: 6,
  enTransito: 6, unit: "und", dailyAvg: 1.6, daysOfStock: 6, puntoReorden: 12.8, leadTimeDias: 5,
  leadTimeOrigen: "declarado", suggestedQty: 16, suggestedSupplier: null, lastPrice: null,
  urgency: "URGENTE", causa: "durante_entrega", criterio: "ventas", motivo: "x",
  detalle: {
    vendido: 48, diasConStock: 30, ventaDiaria: 1.6, leadTimeDias: 5, colchonDias: 3, diasCobertura: 8,
    porRitmo: 12.8, stockMin: 6, minimoManda: false, puntoReorden: 12.8, stock: 4, enTransito: 6,
    disponible: 10, objetivo: 25.6, cantidad: 16, pocosDatos: false,
  },
};

describe("pasosDeLaCuenta", () => {
  it("reconstruye la cantidad con lo que hay en camino", () => {
    const pasos = pasosDeLaCuenta(base, 30);
    expect(pasos.map((p) => p.rotulo)).toEqual(["Venta", "Plazo", "Pedir cuando", "Tienes", "Cuánto"]);
    expect(pasos[3].texto).toBe("4 en stock + 6 en camino = 10: menos que 12,8");
    expect(pasos[4].texto).toContain("= 16 unidades");
  });

  it("con pocos datos avisa y, si manda el mínimo, lo dice", () => {
    const s: Sugerencia = {
      ...base, unit: "pt", criterio: "minimo",
      detalle: { ...base.detalle!, ventaDiaria: 0.5, porRitmo: 5, stockMin: 120, minimoManda: true, puntoReorden: 120, objetivo: 120, disponible: 40, stock: 40, enTransito: 0, cantidad: 80, pocosDatos: true },
    };
    const pasos = pasosDeLaCuenta(s, 30);
    expect(pasos.some((p) => p.aviso)).toBe(true);
    expect(pasos.find((p) => p.rotulo === "Pedir cuando")?.texto).toContain("manda el mínimo");
    expect(pasos.at(-1)?.texto).toBe("Llegar a tu mínimo, 120 − 40 que tienes = 80 pt");
  });

  it("una respuesta sin detalle no inventa pasos", () => {
    expect(pasosDeLaCuenta({ ...base, detalle: undefined }, 30)).toEqual([]);
  });
});

describe("textos", () => {
  it("la hora del cálculo es la de Lima, aun pasada la medianoche UTC", () => {
    // 03:40 UTC del sábado 17 = 22:40 del viernes 16 en Lima.
    expect(fechaDelCalculo("2026-10-17T03:40:00.000Z")).toBe("viernes 16/10, 22:40");
    expect(fechaDelCalculo(null)).toBeNull();
  });

  it("la unidad suelta se escribe en palabras; la del negocio, tal cual", () => {
    expect(cantidadConUnidad(1, "und")).toBe("1 unidad");
    expect(cantidadConUnidad(2.5, "pt")).toBe("2,5 pt");
  });

  it("la nota de la orden entra en los 1000 caracteres del contrato", () => {
    const muchos = Array.from({ length: 80 }, (_, i) => ({ ...base, productId: i, productName: `Producto con nombre largo ${i}` }));
    const nota = notaDeLaOrden(muchos, "2026-10-17T03:40:00.000Z", 30);
    expect(nota.length).toBeLessThanOrEqual(1000);
    expect(nota.startsWith("Desde Sugerencias de compra del viernes 16/10, 22:40")).toBe(true);
  });
});

describe("agruparSugerencias", () => {
  it("por causa sigue el orden de la causa y omite los grupos vacíos", () => {
    const lista = [base, { ...base, productId: 2, causa: "agotado" as const, urgency: "CRITICO" as const }];
    expect(agruparSugerencias(lista, "causa").map((g) => g.clave)).toEqual(["agotado", "durante_entrega"]);
    expect(agruparSugerencias(lista, "urgencia").map((g) => g.clave)).toEqual(["CRITICO", "URGENTE"]);
  });
});
