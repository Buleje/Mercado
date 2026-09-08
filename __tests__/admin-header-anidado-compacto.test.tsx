/**
 * Tests — encabezado de módulo anidado (compacto)
 *
 * Lo que blindan (medido en navegador 2026-09-07, `?tab=analytics-pro`):
 * un hub dibujaba su título editorial de 39px y el módulo hijo dibujaba OTRO
 * igual, con dos `h1` en la misma pantalla y 111px de alto para repetir dónde
 * estás. Ahora el hijo se compacta SOLO: lo detecta `useModuleDepth`, que
 * `AdminTabBar` incrementa alrededor de su panel.
 *
 * Si alguno de estos tests se pone rojo, lo más probable es que se haya
 * quitado el `<ModuleDepthProvider>` de `AdminTabBar` — sin él vuelven los
 * dos títulos gigantes y los dos `h1`.
 */

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";
import { ModuleDepthProvider } from "@/components/admin/shared/module-depth";

describe("AdminModuleHeader — nivel raíz", () => {
  it("dibuja el editorial completo: h1, eyebrow y borde inferior", () => {
    render(
      <AdminModuleHeader
        eyebrow="Análisis · Negocio"
        title="Análisis"
        description="Métricas del negocio."
      />,
    );

    const titulo = screen.getByRole("heading", { level: 1, name: "Análisis" });
    expect(titulo).toBeTruthy();
    expect(screen.getByText("Análisis · Negocio")).toBeTruthy();

    const header = titulo.closest("header")!;
    expect(header.className).toContain("border-b");
    // La regla de acento a la izquierda es exclusiva del modo compacto.
    expect(header.className).not.toContain("border-l-2");
  });
});

describe("AdminModuleHeader — anidado", () => {
  it("baja a h2 y se compacta cuando hay un título arriba", () => {
    render(
      <ModuleDepthProvider>
        <AdminModuleHeader
          eyebrow="No debería verse"
          title="Métricas del negocio"
          description="Ventas, productos y clientes."
        />
      </ModuleDepthProvider>,
    );

    // h1 → h2: dos h1 en una pantalla rompen la jerarquía del lector de pantalla.
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    const titulo = screen.getByRole("heading", { level: 2, name: "Métricas del negocio" });

    const header = titulo.closest("header")!;
    expect(header.className).toContain("border-l-2");
    expect(header.className).not.toContain("border-b");

    // El eyebrow se cae: el hub de arriba ya dijo en qué sección estás.
    expect(screen.queryByText("No debería verse")).toBeNull();
    // La descripción sobrevive — es lo único que el título de arriba no dice.
    expect(screen.getByText(/Ventas, productos y clientes/)).toBeTruthy();
  });

  it("baja a h3 con dos niveles de hub (Documentos → Facturación → Impuestos)", () => {
    render(
      <ModuleDepthProvider>
        <ModuleDepthProvider>
          <AdminModuleHeader title="Impuestos e IGV" />
        </ModuleDepthProvider>
      </ModuleDepthProvider>,
    );

    expect(screen.getByRole("heading", { level: 3, name: "Impuestos e IGV" })).toBeTruthy();
  });

  it("`variant=\"full\"` es el escape hatch: fuerza el editorial completo", () => {
    render(
      <ModuleDepthProvider>
        <AdminModuleHeader title="Pantalla propia" variant="full" />
      </ModuleDepthProvider>,
    );

    const titulo = screen.getByRole("heading", { level: 1, name: "Pantalla propia" });
    expect(titulo.closest("header")!.className).toContain("border-b");
  });
});

describe("AdminTabBar — es quien suma el nivel", () => {
  it("compacta el header del módulo que carga en su panel", () => {
    render(
      <>
        <AdminModuleHeader title="Análisis" />
        <AdminTabBar
          tabs={[{ id: "analytics", label: "Analytics Pro" }]}
          activeTab="analytics"
          onTabChange={() => {}}
          moduleId="analisis-hub"
        >
          <AdminModuleHeader title="Métricas del negocio" />
        </AdminTabBar>
      </>,
    );

    // Un solo h1 en toda la pantalla — la invariante que se verificó a mano
    // sobre los 14 hubs con módulos anidados.
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1, name: "Análisis" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "Métricas del negocio" })).toBeTruthy();
  });
});
