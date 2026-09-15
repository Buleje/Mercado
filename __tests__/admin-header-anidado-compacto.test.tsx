/**
 * Tests — encabezado de módulo anidado
 *
 * Lo que blindan (medido en navegador 2026-09-07, `?tab=analytics-pro`):
 * un hub dibujaba su título editorial de 39px y el módulo hijo dibujaba OTRO
 * igual, con dos `h1` en la misma pantalla y 111px de alto para repetir dónde
 * estás. Primero el hijo se compactó a una línea; después Brandon pidió que
 * el segundo nivel no repita título en absoluto («exactamente como Analytics
 * Pro»): anidado, el header dibuja sólo sus acciones — o nada. Lo detecta
 * `useModuleDepth`, que `AdminTabBar` incrementa alrededor de su panel.
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
  it("no dibuja título ni descripción: sólo sus acciones, a la derecha", () => {
    render(
      <ModuleDepthProvider>
        <AdminModuleHeader
          eyebrow="No debería verse"
          title="Métricas del negocio"
          description="Ventas, productos y clientes."
        >
          <button type="button">Exportar</button>
        </AdminModuleHeader>
      </ModuleDepthProvider>,
    );

    // Brandon 2026-09-07: el segundo nivel no repite en prosa lo que la
    // pestaña del hub dice en un botón — ni siquiera en una línea compacta.
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByText("Métricas del negocio")).toBeNull();
    expect(screen.queryByText(/Ventas, productos y clientes/)).toBeNull();
    expect(screen.queryByText("No debería verse")).toBeNull();

    // Las acciones sobreviven: cada botón sigue donde el usuario lo conoce.
    const accion = screen.getByRole("button", { name: "Exportar" });
    expect(accion.closest("[data-admin-module-actions]")).toBeTruthy();
  });

  it("sin acciones no deja ni un contenedor vacío", () => {
    const { container } = render(
      <ModuleDepthProvider>
        <AdminModuleHeader title="Impuestos e IGV" description="Nada que ver acá." />
      </ModuleDepthProvider>,
    );
    expect(container.innerHTML).toBe("");
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
    // El hijo no repite título: ni h1 ni h2 — la pestaña «Analytics Pro» ya lo dice.
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
    expect(screen.queryByText("Métricas del negocio")).toBeNull();
  });
});
