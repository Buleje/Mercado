/**
 * La ficha del Directorio por pasos (24-10): la barra lista los pasos, se ve
 * uno a la vez sin desmontar los otros, y «Guardar» lleva al paso donde está
 * el problema y lo marca en rojo.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { ConfirmDialogProvider } from "@/components/admin/shared/ConfirmDialog";
import CtpParteModal from "@/components/admin/forestal/CtpParteModal";

beforeEach(() => {
  vi.stubGlobal("scrollTo", vi.fn());
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200, headers: { "content-type": "application/json" } })),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function abrir(rolInicial: "proveedor" | "destinatario" = "proveedor") {
  const onGuardar = vi.fn(async () => undefined);
  render(
    <ConfirmDialogProvider>
      <CtpParteModal parte={null} rolInicial={rolInicial} existentes={[]} onGuardar={onGuardar} onClose={vi.fn()} />
    </ConfirmDialogProvider>,
  );
  const barra = screen.getByRole("navigation", { name: "Pasos de la ficha" });
  const paso = (nombre: RegExp) => within(barra).getByRole("button", { name: nombre });
  return { onGuardar, barra, paso };
}

describe("ficha del Directorio por pasos", () => {
  it("la barra trae los cinco pasos y arranca en «Quién es»; los otros pasos siguen montados", () => {
    const { barra, paso } = abrir();
    expect(within(barra).getAllByRole("button")).toHaveLength(5);
    expect(paso(/Quién es/)).toHaveAttribute("aria-current", "step");
    // «Según el papel» no se ve, pero su campo existe: lo cargado no se pierde al cambiar de paso.
    const dni = screen.getByLabelText("DNI del representante");
    expect(dni.closest("[data-paso]")).toHaveAttribute("data-paso", "papel");
    expect(dni.closest("[data-paso]")).toHaveAttribute("hidden");

    fireEvent.click(screen.getByRole("button", { name: /^Siguiente/ }));
    expect(paso(/Según el papel/)).toHaveAttribute("aria-current", "step");
    expect(dni.closest("[data-paso]")).not.toHaveAttribute("hidden");
  });

  it("guardar sin nombre avisa, no guarda y marca «Quién es» en rojo", () => {
    const { onGuardar, paso } = abrir();
    fireEvent.click(paso(/Dónde y contacto/));
    fireEvent.click(screen.getByRole("button", { name: /^Guardar$/ }));
    expect(screen.getByText("El nombre es obligatorio.")).toBeInTheDocument();
    expect(onGuardar).not.toHaveBeenCalled();
    expect(paso(/Quién es/)).toHaveAttribute("aria-current", "step");
    expect(paso(/Quién es/)).toHaveAttribute("data-paso-estado", "falta");
  });

  it("un DNI del representante mal escrito lleva a «Según el papel» y lo marca en rojo", () => {
    const { onGuardar, paso } = abrir();
    fireEvent.change(screen.getByLabelText(/Nombre o razón social/), { target: { value: "CCNN SANTA ROSA" } });
    fireEvent.change(screen.getByLabelText("DNI del representante"), { target: { value: "123" } });
    expect(paso(/Según el papel/)).toHaveAttribute("data-paso-estado", "falta");

    fireEvent.click(screen.getByRole("button", { name: /^Guardar$/ }));
    // Dos veces: al pie del campo y en el error del pie del modal.
    expect(screen.getAllByText("El DNI tiene 8 dígitos.").length).toBeGreaterThanOrEqual(2);
    expect(onGuardar).not.toHaveBeenCalled();
    expect(paso(/Según el papel/)).toHaveAttribute("aria-current", "step");
  });
});
