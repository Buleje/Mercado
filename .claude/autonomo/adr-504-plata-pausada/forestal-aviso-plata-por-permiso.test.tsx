/**
 * ADR-504 · Los 409 de plata por permiso se ven como aviso: FRENA dice qué
 * hacer y abre «Asignar permiso»; EN_OTRO_PERMISO avisa sin botón; cualquier
 * otro código no pinta nada. Y el permiso «conocido» de una guía sólo cuando
 * todas sus líneas lo dicen.
 */
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("@/lib/forestal/ctp-fetch", () => ({
  ctpGet: vi.fn(async () => ({ contratos: [] })),
  invalidarCtp: vi.fn(),
}));

import AvisoPlataPorPermiso from "@/components/admin/forestal/AvisoPlataPorPermiso";
import { contratoComun } from "@/lib/forestal/guia-por-permiso";

const MSJ = "La guía N° 4 también entró SIN permiso: puede ser la misma y pagarse dos veces.";

describe("AvisoPlataPorPermiso", () => {
  it("FRENA: la línea clara y el botón abre «Asignar permiso» de esa guía", async () => {
    render(<AvisoPlataPorPermiso gtf="4" codigo="GUIA_SIN_PERMISO_FRENA" mensaje={MSJ} onAsignado={() => {}} />);
    expect(screen.getByText(/La GTF 4 sin permiso frena el pago: asígnale su permiso primero/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Asignar permiso/ }));
    expect(await screen.findByText("GTF 4 · la que entró sin permiso")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Declarar en la guía/ })).toBeTruthy();
  });

  it("EN_OTRO_PERMISO: aviso sin botón", () => {
    render(<AvisoPlataPorPermiso gtf="4" codigo="GUIA_EN_OTRO_PERMISO" mensaje="ya existe" onAsignado={() => {}} />);
    expect(document.querySelector('[data-aviso-plata-permiso="GUIA_EN_OTRO_PERMISO"]')?.textContent).toContain(
      "La GTF 4 ya está anotada con otro permiso",
    );
    expect(screen.queryByRole("button", { name: /Asignar permiso/ })).toBeNull();
  });

  it("otro código: no pinta nada (la pantalla muestra su error)", () => {
    const { container } = render(<AvisoPlataPorPermiso gtf="4" codigo="PERIODO_CERRADO" mensaje="x" onAsignado={() => {}} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("contratoComun", () => {
  it("todas las líneas con el mismo permiso → ese", () => {
    expect(contratoComun([{ contratoId: "c17" }, { contratoId: "c17" }])).toBe("c17");
  });
  it("mezcla, sin permiso o vacío → undefined (decide el servidor)", () => {
    expect(contratoComun([{ contratoId: "c17" }, { contratoId: "c20" }])).toBeUndefined();
    expect(contratoComun([{ contratoId: "c17" }, { contratoId: null }])).toBeUndefined();
    expect(contratoComun([{}])).toBeUndefined();
    expect(contratoComun([])).toBeUndefined();
  });
});
