/**
 * CartProvider hydration — regresión del bug multi-store.
 *
 * Escenario: user agrega producto de store "bodega-rosa" en /marketplace.
 * El ID del producto NO pertenece al tenant "main" → /api/products?active=true
 * no lo devuelve → validación ingenua borraría el carrito entero.
 *
 * El fix (guard): si TODOS los items desaparecerían, NO tocar el carrito.
 *
 * ⚠️ NOTA: este test solo PASA si el parche defensivo del cart-context
 * está aplicado (ver .github/instructions/state-management.instructions.md).
 * Si no está aplicado, el test falla — señal clara de regresión.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { CartProvider, useCart } from "@/contexts/cart-context";

function CartProbe() {
  const { items, count } = useCart();
  return (
    <div>
      <span data-testid="count">{count}</span>
      <ul>
        {items.map((i) => (
          <li key={i.id} data-testid={`item-${i.id}`}>
            {i.name}
          </li>
        ))}
      </ul>
    </div>
  );
}

function seedCart(slug: string, items: unknown) {
  localStorage.setItem(`buleje-${slug}-cart`, JSON.stringify(items));
}

function mockCheckExists(existingIds: number[]) {
  const orig = global.fetch;
  global.fetch = vi.fn(async (url: unknown) => {
    const u = typeof url === "string" ? url : String(url);
    if (u.includes("/api/marketplace/products/check-exists")) {
      // Parsea los IDs pedidos y devuelve la intersección con `existingIds`.
      const asked = new URL(u, "http://localhost").searchParams
        .get("ids")
        ?.split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n) && n > 0) ?? [];
      const setExisting = new Set(existingIds);
      const existing = asked.filter((id) => setExisting.has(id));
      const missing = asked.filter((id) => !setExisting.has(id));
      return new Response(
        JSON.stringify({ existingIds: existing, missingIds: missing }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    return orig ? orig(url as RequestInfo) : new Response(null, { status: 404 });
  }) as typeof fetch;
}

describe("CartProvider — multi-store hydration guard", () => {
  beforeEach(() => {
    localStorage.clear();
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("preserva items del carrito cuando NINGUNO existe en /api/products (multi-store)", async () => {
    // Carrito con IDs 9001, 9002 — de stores distintas al tenant "main".
    seedCart("main", [
      { id: 9001, name: "Arroz de bodega rosa", price: 10, quantity: 1, image: "", unit: "kg", category: "abarrotes" },
      { id: 9002, name: "Aceite de bodega pablo", price: 12, quantity: 2, image: "", unit: "L", category: "abarrotes" },
    ]);

    // /api/products solo devuelve productos del tenant "main" — NINGUNO coincide.
    mockCheckExists([100, 200, 300]);

    render(
      <CartProvider tenantSlug="main">
        <CartProbe />
      </CartProvider>,
    );

    // Primera hidratación sincrónica desde localStorage.
    expect(await screen.findByTestId("item-9001")).toBeInTheDocument();
    expect(await screen.findByTestId("item-9002")).toBeInTheDocument();

    // Esperar a que se resuelva la validación remota.
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });

    // Guard activo: items aún presentes a pesar de "no existir" en /api/products.
    // Si el guard está roto, este assertion falla (items se borraron).
    await waitFor(
      () => {
        expect(screen.queryByTestId("item-9001")).toBeInTheDocument();
        expect(screen.queryByTestId("item-9002")).toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });

  it("sí borra items individuales cuando al menos uno es válido (tienda single-tenant normal)", async () => {
    seedCart("main", [
      { id: 1, name: "Producto válido", price: 10, quantity: 1, image: "", unit: "kg", category: "abarrotes" },
      { id: 2, name: "Producto borrado", price: 5, quantity: 1, image: "", unit: "kg", category: "abarrotes" },
    ]);

    // Solo id=1 vive en la DB.
    mockCheckExists([1]);

    render(
      <CartProvider tenantSlug="main">
        <CartProbe />
      </CartProvider>,
    );

    await waitFor(
      () => {
        expect(screen.queryByTestId("item-1")).toBeInTheDocument();
        expect(screen.queryByTestId("item-2")).not.toBeInTheDocument();
      },
      { timeout: 1000 },
    );
  });
});
