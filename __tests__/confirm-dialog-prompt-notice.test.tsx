/**
 * `useConfirm` reemplaza a los tres diálogos nativos del navegador en el panel.
 *
 * Lo que fija este test es el CONTRATO que asumen los ~150 lugares migrados
 * desde `confirm()` / `prompt()` / `alert()`: mismo significado de la respuesta
 * que la versión nativa, así el cambio en cada llamada es sólo un `await`.
 *
 *  · confirm → `true` al aceptar, `false` al cancelar.
 *  · prompt  → el texto al aceptar, `null` al cancelar (igual que `window.prompt`).
 *  · prompt obligatorio → con el campo vacío no se puede aceptar.
 *  · notice  → un solo botón; resuelve al cerrarlo.
 */

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import { ConfirmDialogProvider, useConfirm } from "@/components/admin/shared/ConfirmDialog";

type Api = ReturnType<typeof useConfirm>;

function montar() {
  const ref: { api: Api | null } = { api: null };
  function Captura() {
    ref.api = useConfirm();
    return null;
  }
  render(
    <ConfirmDialogProvider>
      <Captura />
    </ConfirmDialogProvider>,
  );
  if (!ref.api) throw new Error("useConfirm no montó");
  return ref.api;
}

afterEach(cleanup);

describe("confirm", () => {
  it("aceptar resuelve true", async () => {
    const api = montar();
    let respuesta: Promise<boolean> | undefined;
    act(() => {
      respuesta = api.confirm({ title: "¿Eliminar el producto?", confirmLabel: "Sí, eliminar" });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Sí, eliminar" }));
    await expect(respuesta).resolves.toBe(true);
  });

  it("cancelar resuelve false", async () => {
    const api = montar();
    let respuesta: Promise<boolean> | undefined;
    act(() => {
      respuesta = api.confirm({ title: "¿Eliminar el producto?" });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await expect(respuesta).resolves.toBe(false);
  });
});

describe("prompt", () => {
  it("devuelve lo escrito", async () => {
    const api = montar();
    let respuesta: Promise<string | null> | undefined;
    act(() => {
      respuesta = api.prompt({ title: "Motivo de la anulación", label: "Motivo" });
    });
    fireEvent.change(await screen.findByRole("textbox", { name: "Motivo" }), { target: { value: "cliente devolvió" } });
    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
    await expect(respuesta).resolves.toBe("cliente devolvió");
  });

  it("cancelar devuelve null, como window.prompt", async () => {
    const api = montar();
    let respuesta: Promise<string | null> | undefined;
    act(() => {
      respuesta = api.prompt({ title: "Nombre de la carpeta", defaultValue: "Nueva" });
    });
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar" }));
    await expect(respuesta).resolves.toBeNull();
  });

  it("sin rótulo, el campo se nombra con el título", async () => {
    const api = montar();
    act(() => {
      void api.prompt({ title: "Nombre de la carpeta" });
    });
    /* El diálogo también se llama así (su título): se busca el CAMPO por rol. */
    expect(await screen.findByRole("textbox", { name: "Nombre de la carpeta" })).toBeTruthy();
  });

  it("obligatorio y vacío: no se puede aceptar", async () => {
    const api = montar();
    act(() => {
      void api.prompt({ title: "Motivo", required: true });
    });
    const aceptar = await screen.findByRole("button", { name: "Aceptar" });
    expect((aceptar as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByRole("textbox", { name: "Motivo" }), { target: { value: "x" } });
    expect((aceptar as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("notice", () => {
  it("un solo botón, y resuelve al cerrarlo", async () => {
    const api = montar();
    let respuesta: Promise<void> | undefined;
    act(() => {
      respuesta = api.notice({ title: "No se pudo guardar", description: "Revisa tu conexión." });
    });
    const entendido = await screen.findByRole("button", { name: "Entendido" });
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    fireEvent.click(entendido);
    await expect(respuesta).resolves.toBeUndefined();
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });
});
