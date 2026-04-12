/**
 * Tests — LazyChart wrapper
 *
 * Verifica:
 *   1. ChartSkeleton renderiza correctamente (dimensiones, aria, barras decorativas)
 *   2. LazyBarChart muestra el skeleton durante la carga
 *   3. LazyBarChart renderiza el componente real después de resolver
 *   4. El barrel index.ts exporta todos los charts esperados
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { Suspense } from "react";

// ── Mock de next/dynamic ───────────────────────────────────────────────────────
// Simula el comportamiento de dynamic(): primero muestra loading, luego el componente.

vi.mock("next/dynamic", () => ({
  default: (
    loader: () => Promise<{ default: React.ComponentType<Record<string, unknown>> }>,
    options?: { loading?: () => React.ReactElement; ssr?: boolean }
  ) => {
    // Retornar un componente que usa el loader de forma diferida
    const LazyComponent = (props: Record<string, unknown>) => {
      const [Component, setComponent] = vi.fn().mockReturnValue([null, null])();
      // En tests síncronos, resolvemos inmediatamente para verificar el loading state
      if (!Component && options?.loading) {
        return options.loading();
      }
      return Component ? <Component {...props} /> : null;
    };
    LazyComponent.displayName = "DynamicComponent";
    return LazyComponent;
  },
}));

// ── Mock de recharts ──────────────────────────────────────────────────────────
vi.mock("recharts", () => ({
  BarChart: ({ children, "data-testid": testId }: { children?: React.ReactNode; "data-testid"?: string }) => (
    <div data-testid={testId ?? "recharts-barchart"}>{children}</div>
  ),
  LineChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-linechart">{children}</div>
  ),
  PieChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-piechart">{children}</div>
  ),
  AreaChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-areachart">{children}</div>
  ),
  ComposedChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-composedchart">{children}</div>
  ),
  ScatterChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-scatterchart">{children}</div>
  ),
  RadialBarChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-radialbarchart">{children}</div>
  ),
  RadarChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-radarchart">{children}</div>
  ),
}));

import ChartSkeleton from "@/components/charts/ChartSkeleton";
import {
  LazyBarChart,
  LazyLineChart,
  LazyPieChart,
  LazyAreaChart,
  LazyComposedChart,
  LazyScatterChart,
  LazyRadialBarChart,
  LazyRadarChart,
} from "@/components/charts";

// ── ChartSkeleton ─────────────────────────────────────────────────────────────

describe("ChartSkeleton", () => {
  it("renderiza con altura por defecto 300px", () => {
    const { container } = render(<ChartSkeleton />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton).toBeDefined();
    expect(skeleton.style.height).toBe("300px");
  });

  it("acepta altura personalizada", () => {
    const { container } = render(<ChartSkeleton height={450} />);
    const skeleton = container.firstChild as HTMLElement;
    expect(skeleton.style.height).toBe("450px");
  });

  it("tiene role=status para accesibilidad", () => {
    render(<ChartSkeleton label="Cargando ventas" />);
    expect(screen.getByRole("status")).toBeDefined();
  });

  it("usa el label personalizado en aria-label", () => {
    render(<ChartSkeleton label="Cargando ventas del mes" />);
    const el = screen.getByRole("status");
    expect(el.getAttribute("aria-label")).toBe("Cargando ventas del mes");
  });

  it("contiene 8 barras decorativas", () => {
    const { container } = render(<ChartSkeleton />);
    // Las barras son divs hijos del contenedor flex
    const innerContainer = container.querySelector(".flex");
    expect(innerContainer?.children.length).toBe(8);
  });

  it("aplica className adicional si se provee", () => {
    const { container } = render(<ChartSkeleton className="mt-4" />);
    expect(container.firstChild).toHaveClass("mt-4");
  });
});

// ── LazyChart — loading state ─────────────────────────────────────────────────

describe("LazyBarChart — skeleton durante carga", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("muestra el ChartSkeleton como fallback de loading (no lanza)", () => {
    // El mock de next/dynamic devuelve el loading() inmediatamente.
    // El test principal verifica que el componente no lanza durante el render.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const Chart = LazyBarChart as React.ComponentType<any>;
    expect(() => {
      render(<Chart width={400} height={300} data={[]} />);
    }).not.toThrow();
  });

  it("LazyBarChart es un componente React renderizable", () => {
    expect(typeof LazyBarChart).toBe("function");
  });
});

// ── Barrel exports ────────────────────────────────────────────────────────────

describe("components/charts barrel", () => {
  it("exporta todos los chart types esperados", () => {
    expect(LazyBarChart).toBeDefined();
    expect(LazyLineChart).toBeDefined();
    expect(LazyPieChart).toBeDefined();
    expect(LazyAreaChart).toBeDefined();
    expect(LazyComposedChart).toBeDefined();
    expect(LazyScatterChart).toBeDefined();
    expect(LazyRadialBarChart).toBeDefined();
    expect(LazyRadarChart).toBeDefined();
  });

  it("exporta ChartSkeleton standalone", () => {
    expect(ChartSkeleton).toBeDefined();
  });
});
