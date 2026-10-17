/**
 * __tests__/compras-borrador-canasta.test.tsx
 *
 * Auditoría de Compras 15-10, hallazgo O01 (C07/C58): la canasta de Comprar
 * vaciada —quitando la última línea o con «Limpiar»— volvía con sus 21
 * unidades al cambiar de pestaña y regresar, o al recargar.
 *
 * Causa: el autoguardado sólo escribía el borrador cuando había ítems («no
 * pisa con vacío»), así que el último borrador CON ítems quedaba en el
 * navegador y el siguiente montaje lo restauraba. Además, con dos pestañas
 * abiertas, la que aún mostraba la versión vieja la volvía a escribir.
 *
 * Cada montaje del hook es «volver a la pestaña» o «recargar»: la vista se
 * desmonta al navegar dentro del panel y vuelve a leer el borrador.
 */
import { StrictMode, type ReactNode } from "react";
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useCompraCarrito } from "@/components/admin/compra/use-compra-carrito";
import type { PurchaseProduct } from "@/lib/types/purchases";

const CLAVE = "poc-draft";
const TORNILLO: PurchaseProduct = {
  id: 7, name: "Tornillo 1m", category: "Ferretería", price: 12, costPrice: 10, image: "", unit: "und", stock: 0,
};
const CLAVO: PurchaseProduct = { ...TORNILLO, id: 8, name: "Clavo 3 pulgadas" };

const confirmar = vi.fn(async () => true);
const conStrict = ({ children }: { children: ReactNode }) => <StrictMode>{children}</StrictMode>;
const montar = () => renderHook(() => useCompraCarrito({ playDing: () => undefined, confirm: confirmar }), { wrapper: conStrict });
const guardado = () => {
  const raw = localStorage.getItem(CLAVE);
  return raw ? (JSON.parse(raw) as { cart: Array<{ product: { id: number }; quantity: number }> }) : null;
};

/** Lo que el navegador avisa a OTRA pestaña cuando ésta cambia el borrador. */
function avisoDeOtraPestana(valorNuevo: string | null) {
  window.dispatchEvent(new StorageEvent("storage", { key: CLAVE, newValue: valorNuevo, storageArea: localStorage }));
}

beforeEach(() => {
  localStorage.clear();
  confirmar.mockClear();
  vi.stubGlobal("fetch", vi.fn(async () => new Response("[]", { status: 200 })));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("borrador de la canasta de compra (C07/C58)", () => {
  it("quitar la última línea no resucita al volver a la pestaña", async () => {
    const primera = montar();
    act(() => primera.result.current.addToCart(TORNILLO, 21));
    await waitFor(() => expect(guardado()?.cart[0]?.quantity).toBe(21));

    act(() => primera.result.current.removeItem(TORNILLO.id));
    expect(primera.result.current.cart).toHaveLength(0);
    primera.unmount();

    const vuelta = montar();
    await act(async () => { await Promise.resolve(); });
    expect(vuelta.result.current.cart).toHaveLength(0);
    expect(guardado()).toBeNull();
    expect(vuelta.result.current.hasDraft).toBe(false);
  });

  it("«Limpiar» confirmado no resucita al recargar", async () => {
    const primera = montar();
    act(() => primera.result.current.addToCart(TORNILLO, 21));
    act(() => primera.result.current.addToCart(CLAVO, 3));
    await waitFor(() => expect(guardado()?.cart).toHaveLength(2));

    await act(async () => { await primera.result.current.clearCart(); });
    expect(confirmar).toHaveBeenCalledTimes(1);
    primera.unmount();

    const recarga = montar();
    await act(async () => { await Promise.resolve(); });
    expect(recarga.result.current.cart).toHaveLength(0);
    expect(guardado()).toBeNull();
  });

  it("un borrador con ítems se sigue restaurando al volver (no se pierde lo que dejaste)", async () => {
    const primera = montar();
    act(() => primera.result.current.addToCart(TORNILLO, 5));
    await waitFor(() => expect(guardado()?.cart[0]?.quantity).toBe(5));
    primera.unmount();

    const vuelta = montar();
    await waitFor(() => expect(vuelta.result.current.cart[0]?.quantity).toBe(5));
    expect(guardado()?.cart[0]?.quantity).toBe(5);
  });

  it("dos pestañas: la que vació manda; la vieja no vuelve a escribir la línea", async () => {
    const a = montar();
    act(() => a.result.current.addToCart(TORNILLO, 21));
    await waitFor(() => expect(guardado()?.cart).toHaveLength(1));

    // La pestaña B se abre con el borrador de A.
    const b = montar();
    await waitFor(() => expect(b.result.current.cart).toHaveLength(1));

    // A vacía la canasta: el navegador le avisa a B.
    act(() => a.result.current.removeItem(TORNILLO.id));
    expect(guardado()).toBeNull();
    act(() => avisoDeOtraPestana(null));
    expect(b.result.current.cart).toHaveLength(0);

    // B sigue trabajando: lo que escribe no trae de vuelta la línea vieja.
    act(() => b.result.current.addToCart(CLAVO, 2));
    await waitFor(() => expect(guardado()?.cart).toHaveLength(1));
    expect(guardado()?.cart[0]?.product.id).toBe(CLAVO.id);
  });

  it("dos pestañas: la que agrega en otra pestaña se ve acá sin recargar", async () => {
    const a = montar();
    const b = montar();
    act(() => a.result.current.addToCart(TORNILLO, 4));
    await waitFor(() => expect(guardado()?.cart).toHaveLength(1));

    act(() => avisoDeOtraPestana(localStorage.getItem(CLAVE)));
    expect(b.result.current.cart[0]?.quantity).toBe(4);
  });

  it("cantidad escrita (C02): 21 de una vez; 0 o negativo se ignoran; −1 no baja de lo escrito si es menos de 1", () => {
    const h = montar();
    act(() => h.result.current.addToCart(TORNILLO, 1));
    act(() => h.result.current.setQty(TORNILLO.id, 21));
    expect(h.result.current.cart[0]?.quantity).toBe(21);
    act(() => h.result.current.setQty(TORNILLO.id, 0));
    act(() => h.result.current.setQty(TORNILLO.id, -3));
    act(() => h.result.current.setQty(TORNILLO.id, Number.NaN));
    expect(h.result.current.cart[0]?.quantity).toBe(21);
    act(() => h.result.current.setQty(TORNILLO.id, 0.5));
    act(() => h.result.current.updateQty(TORNILLO.id, -1));
    expect(h.result.current.cart[0]?.quantity).toBe(0.5);
    act(() => h.result.current.setQty(TORNILLO.id, 2));
    act(() => h.result.current.updateQty(TORNILLO.id, -1));
    act(() => h.result.current.updateQty(TORNILLO.id, -1));
    expect(h.result.current.cart[0]?.quantity).toBe(1);
  });
});
