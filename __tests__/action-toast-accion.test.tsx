/**
 * Tests — el paso siguiente dentro del toast (`accion`).
 *
 * El encadenado del ANEXO N° 04 depende de que el aviso traiga un botón con
 * nombre propio: sin eso, «la siguiente es la N° 42» es información que hay que
 * ir a buscar a mano, que es justo lo que se quiso sacar.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ActionToasts, type ActionToast } from "@/components/admin/forestal/cubicador-toasts";

const toast = (extra: Partial<ActionToast> = {}): ActionToast => ({
  id: 1,
  tono: "info",
  msg: "Quedan 3 guías sin anexo",
  ...extra,
});

describe("ActionToasts · acción con nombre", () => {
  it("dibuja el botón del paso siguiente y lo ejecuta", () => {
    const emitir = vi.fn();
    render(
      <ActionToasts
        toasts={[toast({ detail: "La siguiente es la N° 42", accion: { label: "Emitir la N° 42", onClick: emitir } })]}
        onDismiss={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: /Emitir la N° 42/i });
    fireEvent.click(btn);
    expect(emitir).toHaveBeenCalledTimes(1);
  });

  it("al ejecutar la acción cierra el aviso: no queda un botón que ya se usó", () => {
    const onDismiss = vi.fn();
    render(
      <ActionToasts
        toasts={[toast({ accion: { label: "Emitir la N° 42", onClick: () => {} } })]}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Emitir la N° 42/i }));
    expect(onDismiss).toHaveBeenCalledWith(1);
  });

  it("sin acción no inventa un botón", () => {
    render(<ActionToasts toasts={[toast()]} onDismiss={() => {}} />);
    // Sólo queda el de cerrar.
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: /Cerrar aviso/i })).toBeInTheDocument();
  });
});
