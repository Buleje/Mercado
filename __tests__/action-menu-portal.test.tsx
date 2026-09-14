/**
 * Tests — ActionMenu, a dónde portalea su panel.
 *
 * Medido en el navegador (2026-09-14): dentro de un `AdminModal` de Radix
 * (Dialog abierto), `document.body` queda con `pointer-events: none` — un
 * panel portaleado siempre a `body` se VE pero ningún ítem recibe clic
 * (`elementsFromPoint` devuelve lo que está debajo). El arreglo: si el botón
 * que abre el menú vive dentro de un `[role="dialog"]`, el panel se portalea
 * COMO DESCENDIENTE de ese diálogo (hereda su `pointer-events: auto`, y para
 * el `DismissableLayer`/`FocusScope` de Radix el panel ya es parte del
 * diálogo). Sin diálogo ancestro, sigue yendo a `document.body` como siempre.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Check } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";

afterEach(() => {
  cleanup();
});

const acciones: MenuAccion[] = [{ id: "a", label: "Acción A", icon: Check, onSelect: () => {} }];

describe("ActionMenu — portal según el ancestro", () => {
  it("sin ancestro [role=dialog], portalea a document.body", () => {
    render(<ActionMenu label="Opciones" actions={acciones} />);
    fireEvent.click(screen.getByRole("button", { name: /Opciones/i }));

    const item = screen.getByRole("menuitem", { name: /Acción A/i });
    expect(document.body.contains(item)).toBe(true);
    expect(item.closest('[role="dialog"]')).toBeNull();
  });

  it("con un ancestro [role=dialog], el panel queda DENTRO de ese diálogo", () => {
    render(
      <div role="dialog" aria-modal="true" data-testid="dialogo">
        <ActionMenu label="Opciones" actions={acciones} />
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Opciones/i }));

    const item = screen.getByRole("menuitem", { name: /Acción A/i });
    const dialogo = screen.getByTestId("dialogo");
    expect(dialogo.contains(item)).toBe(true);
  });

  it("con DOS diálogos anidados, portalea en el más cercano al botón", () => {
    render(
      <div role="dialog" aria-modal="true" data-testid="externo">
        <div role="dialog" aria-modal="true" data-testid="interno">
          <ActionMenu label="Opciones" actions={acciones} />
        </div>
      </div>,
    );
    fireEvent.click(screen.getByRole("button", { name: /Opciones/i }));

    const item = screen.getByRole("menuitem", { name: /Acción A/i });
    const interno = screen.getByTestId("interno");
    expect(interno.contains(item)).toBe(true);
  });

  it("con el botón lejos del borde del diálogo pero cerca del borde del VIEWPORT, el panel no cruza el borde del diálogo (números del bug real, 1440×900, 2026-09-14)", () => {
    // El bug medido: viewport 1440×900, diálogo 141→759 (618 de alto), botón
    // terminando en y≈587. Mirando sólo el viewport (768/900 de innerHeight)
    // "sobra espacio abajo" y el panel abre hacia abajo — pero DENTRO del
    // diálogo sólo quedan 172px, y el panel (4 ítems, ~300px) se pasa 129px.
    Object.defineProperty(window, "innerWidth", { value: 1440, configurable: true });
    Object.defineProperty(window, "innerHeight", { value: 900, configurable: true });

    const acciones4: MenuAccion[] = [
      { id: "a", label: "Acción A", icon: Check, onSelect: () => {} },
      { id: "b", label: "Acción B", icon: Check, onSelect: () => {} },
      { id: "c", label: "Acción C", icon: Check, onSelect: () => {} },
      { id: "d", label: "Acción D", icon: Check, onSelect: () => {} },
    ];
    render(
      // El centrado real de `AdminModal` (Tailwind v4: `translate`, no `transform`).
      <div role="dialog" aria-modal="true" data-testid="dialogo" style={{ translate: "-50% -50%" }}>
        <ActionMenu label="Opciones" actions={acciones4} />
      </div>,
    );

    const dialogo = screen.getByTestId("dialogo");
    dialogo.getBoundingClientRect = () =>
      ({ top: 141, bottom: 759, left: 100, right: 1340, width: 1240, height: 618, x: 100, y: 141, toJSON() {} }) as DOMRect;

    const boton = screen.getByRole("button", { name: /Opciones/i });
    boton.getBoundingClientRect = () =>
      ({ top: 549, bottom: 587, left: 1200, right: 1300, width: 100, height: 38, x: 1200, y: 549, toJSON() {} }) as DOMRect;

    fireEvent.click(boton);

    const item = screen.getByRole("menuitem", { name: /Acción A/i });
    const panel = item.closest('[role="menu"]')!.parentElement as HTMLElement;
    const top = parseFloat(panel.style.top);
    const maxHeight = parseFloat(panel.style.maxHeight);
    // Ambos relativos a la caja del diálogo (618 de alto): el panel entero
    // tiene que caber ahí adentro, nunca más abajo de su borde. Con el bug
    // (marco=viewport) esto daba top+maxHeight≈888−141=747 > 618.
    expect(top + maxHeight).toBeLessThanOrEqual(618);
  });
});
