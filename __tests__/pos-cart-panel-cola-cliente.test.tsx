/**
 * __tests__/pos-cart-panel-cola-cliente.test.tsx
 *
 * Otro carrito = otro cliente (09-10). El cliente elegido en el cobro vive en
 * usePOSCobro y sólo se limpiaba cuando el carrito quedaba VACÍO. Pasar de un
 * carrito lleno a otro lleno —«Cola: N › Cliente N» o «Retomar» un carrito
 * pausado— no lo vacía, así que el cliente A quedaba pegado al carrito B y el
 * Fiado se anotaba a A. El panel tiene que soltar al cliente antes de cambiar.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { POSCarrito } from "@/components/admin/pos/usePOSCarrito";

// Los hijos que piden datos o animan no importan acá: sólo el cambio de carrito.
vi.mock("@/components/admin/pos/POSFiadoPanel", () => ({ default: () => null }));
vi.mock("@/components/admin/pos/POSCrossSell", () => ({ default: () => null }));
vi.mock("@/components/admin/pos/POSCartDetail", () => ({ default: () => null }));
vi.mock("@/components/admin/pos/POSCartItem", () => ({ default: () => null }));
vi.mock("@/components/admin/pos/POSPausedCarts", () => ({
  default: ({ onResume }: { onResume: (items: unknown[]) => void }) => (
    <button type="button" onClick={() => onResume([{ productId: 9, name: "Pan", price: 1, quantity: 2, unit: "und" }])}>
      Retomar pausado
    </button>
  ),
}));

import POSCartPanel from "@/components/admin/pos/POSCartPanel";

const linea = (id: number, name: string, price: number) => ({
  product: { id, name, price, unit: "und", image: "", category: "", active: true, description: "" },
  quantity: 1,
});

function montar() {
  const carrito = {
    cart: [linea(1, "Arroz", 4)],
    cartCount: 1,
    cartTotal: 4,
    clientQueues: [[linea(2, "Azúcar", 5)]],
    enqueueClient: vi.fn(),
    loadFromQueue: vi.fn(),
    removeFromQueue: vi.fn(),
    clearCart: vi.fn(),
    handlePauseCart: vi.fn(),
    handleResumeCart: vi.fn(),
    handleAddFromSearch: vi.fn(),
    lastAddedId: null,
    updateQuantity: vi.fn(),
    updateDiscount: vi.fn(),
    removeFromCart: vi.fn(),
  } as unknown as POSCarrito;
  const onQuitarCliente = vi.fn();
  render(
    <POSCartPanel
      carrito={carrito}
      expanded={false}
      customerPhone="922334455"
      customerName="Cliente QA"
      onQuitarCliente={onQuitarCliente}
      openPaymentModal={vi.fn()}
    />,
  );
  return { carrito, onQuitarCliente };
}

describe("POSCartPanel — el cliente no viaja a otro carrito", () => {
  it("pasar al cliente de la cola suelta al cliente elegido antes de cargar su carrito", () => {
    const { carrito, onQuitarCliente } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Cola: 1/ }));
    fireEvent.click(screen.getByRole("button", { name: /Cliente 1/ }));
    expect(onQuitarCliente).toHaveBeenCalledTimes(1);
    expect(carrito.loadFromQueue).toHaveBeenCalledWith(0);
    expect(onQuitarCliente.mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(carrito.loadFromQueue).mock.invocationCallOrder[0],
    );
  });

  it("retomar un carrito pausado también suelta al cliente", () => {
    const { carrito, onQuitarCliente } = montar();
    fireEvent.click(screen.getByRole("button", { name: "Retomar pausado" }));
    expect(onQuitarCliente).toHaveBeenCalledTimes(1);
    expect(carrito.handleResumeCart).toHaveBeenCalledTimes(1);
  });

  it("quitar una entrada de la cola no toca al cliente del carrito actual", () => {
    const { carrito, onQuitarCliente } = montar();
    fireEvent.click(screen.getByRole("button", { name: /Cola: 1/ }));
    fireEvent.click(screen.getByRole("button", { name: "Quitar" }));
    expect(carrito.removeFromQueue).toHaveBeenCalledWith(0);
    expect(onQuitarCliente).not.toHaveBeenCalled();
  });
});
