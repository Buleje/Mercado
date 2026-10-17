/**
 * Compras › Sugerencias (plan «panel unificado», ola 3): un solo «qué reponer».
 *
 * La vista junta 3 motores y su origen son las 3 pestañas de antes (compras,
 * forecasting, sugerencias-ia). El motor de Compras GENERA órdenes de compra:
 *   - no se le regala a quien llegó sólo por Predicción o Sugerencias IA;
 *   - pero es lo propio de la vista: si no pasa ninguno de los 3 (`main`, cuya
 *     plantilla oculta Compras, abierto por enlace; o el rol que no llegó), se
 *     ve como antes. Medido 10-10: con un `PermisoDe origen="compras"` a secas,
 *     main abría Sugerencias en blanco.
 * Los otros dos bloques se ven sólo con su origen (regla R2).
 *
 * Ejecutar: npx vitest run __tests__/compras-sugerencias-motor.test.tsx
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const permitidos = new Set<string>();

vi.mock("@/hooks/use-vistas-permitidas", () => ({
  usePermisoDe: (origen: readonly string[]) => origen.some((o) => permitidos.has(o)),
}));

// Cada dynamic() dibuja el nombre de lo que importa: alcanza para saber qué se montó.
vi.mock("next/dynamic", () => ({
  default: (cargar: () => Promise<unknown>) => {
    const fuente = String(cargar);
    const nombre = fuente.includes("ForecastReorden")
      ? "motor-prediccion"
      : fuente.includes("TabCompras")
        ? "motor-ia"
        : fuente.includes("SugerenciasCompraTab")
          ? "motor-compras"
          : "otro";
    return function Dinamico() {
      return <div data-testid={nombre} />;
    };
  },
}));

import SugerenciasVista from "@/components/admin/compras/SugerenciasVista";

afterEach(() => {
  cleanup();
  permitidos.clear();
  localStorage.clear();
});

function montar(...origenes: string[]) {
  for (const o of origenes) permitidos.add(o);
  render(<SugerenciasVista />);
  return {
    motor: screen.queryByTestId("motor-compras") !== null,
    prediccion: screen.queryByRole("button", { name: /Reorden por predicción/ }) !== null,
    ia: screen.queryByRole("button", { name: /Qué se acaba esta semana/ }) !== null,
  };
}

describe("Compras › Sugerencias — quién ve cada motor", () => {
  it("quien ve Compras ve el motor de Compras arriba", () => {
    expect(montar("compras")).toEqual({ motor: true, prediccion: false, ia: false });
  });

  it("quien llegó sólo por Predicción no recibe el motor que genera órdenes", () => {
    expect(montar("forecasting")).toEqual({ motor: false, prediccion: true, ia: false });
  });

  it("quien llegó sólo por Sugerencias IA tampoco", () => {
    expect(montar("sugerencias-ia")).toEqual({ motor: false, prediccion: false, ia: true });
  });

  it("si no pasa ninguno (main por enlace, o sin rol), se ve el motor como antes y nada ajeno", () => {
    expect(montar()).toEqual({ motor: true, prediccion: false, ia: false });
  });

  it("con los 3, los 3: el motor arriba y los otros plegados", () => {
    expect(montar("compras", "forecasting", "sugerencias-ia")).toEqual({ motor: true, prediccion: true, ia: true });
    // Plegados por defecto: no se monta (ni pide datos) lo de adentro.
    expect(screen.queryByTestId("motor-prediccion")).toBeNull();
    expect(screen.queryByTestId("motor-ia")).toBeNull();
  });
});
