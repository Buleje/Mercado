/**
 * Tests — Escape con un `ActionMenu` abierto DENTRO de un `AdminModal`.
 *
 * Medido en el navegador (2026-09-14): con el menú de una fila abierto sobre
 * el libro, Escape cerraba las DOS capas (el menú Y el diálogo de abajo) —
 * el `DismissableLayer` de Radix escucha Escape en `document` en captura y
 * cierra el diálogo pase lo que pase adentro. El arreglo: `ActionMenu` marca
 * su diálogo ancestro con `data-menu-abierto` mientras está abierto, y
 * `AdminModal` hace `preventDefault()` en su `onEscapeKeyDown` mientras esa
 * marca esté puesta — Escape cierra sólo el menú, el diálogo se queda.
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Check } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";

afterEach(() => {
  cleanup();
});

const acciones: MenuAccion[] = [{ id: "a", label: "Acción A", icon: Check, onSelect: () => {} }];

describe("Escape dentro de un AdminModal con un ActionMenu abierto", () => {
  it("con el menú de la fila abierto, Escape lo cierra y el diálogo NO llama a onClose", () => {
    const onClose = vi.fn();
    render(
      <AdminModal open onClose={onClose} title="Producción · Todos y registrados">
        <ActionMenu label="Opciones" actions={acciones} />
      </AdminModal>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Opciones/i }));
    expect(screen.getByRole("menuitem", { name: /Acción A/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    // El menú se cerró...
    expect(screen.queryByRole("menuitem", { name: /Acción A/i })).not.toBeInTheDocument();
    // ...pero el diálogo de abajo NO recibió la orden de cerrarse.
    expect(onClose).not.toHaveBeenCalled();
  });

  it("sin ningún menú abierto, Escape sigue cerrando el diálogo como siempre (no romper el modal de cobro)", () => {
    const onClose = vi.fn();
    render(
      <AdminModal open onClose={onClose} title="Cobrar aserrío">
        <p>Sin menús acá adentro.</p>
      </AdminModal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
