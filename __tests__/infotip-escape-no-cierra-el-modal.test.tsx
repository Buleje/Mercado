/**
 * Escape con un `InfoTip` (ⓘ) abierto DENTRO de un `AdminModal`.
 *
 * Medido en el navegador (2026-09-26, «Plata de la guía»): el ⓘ escuchaba
 * `keydown` en `window` sin cortar la propagación. El `DismissableLayer` de
 * Radix (el `AdminModal` que lo contiene) también escucha Escape y cerraba el
 * diálogo entero — un solo Escape se llevaba las DOS capas: el tip Y el
 * modal, con un formulario a medio llenar. Ver
 * `.claude/agent-memory/frontend/infotip-escape-cierra-el-modal.md`.
 *
 * El arreglo (mismo mecanismo que `admin-modal-escape-menu.test.tsx` usa para
 * `ActionMenu`, más `stopPropagation` porque el ⓘ también vive en modales a
 * mano con `useModalAccesible`, que no mira `defaultPrevented`): el ⓘ corta
 * el evento en CAPTURA sobre `window` mientras está abierto.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import AdminModal from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Escape con un InfoTip abierto dentro de un AdminModal", () => {
  it("primer Escape cierra sólo el tip (el modal NO llama a onClose); segundo Escape sí cierra el modal", () => {
    const onClose = vi.fn();
    render(
      <AdminModal open onClose={onClose} title="Plata de la guía">
        <InfoTip title="Puesto en patio" what="¿De quién es la madera?" />
      </AdminModal>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Información: Puesto en patio" }));
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // Primer Escape: como lo vería Radix (llega hasta `document`).
    fireEvent.keyDown(document, { key: "Escape" });

    // El tip se cerró...
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();
    // ...pero el diálogo de abajo NO recibió la orden de cerrarse.
    expect(onClose).not.toHaveBeenCalled();

    // Segundo Escape, con el tip ya cerrado: el modal se comporta como siempre.
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("sin ningún InfoTip abierto, Escape sigue cerrando el modal como siempre", () => {
    const onClose = vi.fn();
    render(
      <AdminModal open onClose={onClose} title="Cobrar aserrío">
        <InfoTip title="Ayuda" what="Texto." />
        <p>Sin el ⓘ abierto.</p>
      </AdminModal>,
    );

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
