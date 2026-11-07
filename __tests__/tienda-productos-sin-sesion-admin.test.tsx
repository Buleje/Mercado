// @vitest-environment jsdom
/**
 * Con la sesión del ADMIN abierta, /api/products devuelve los productos del
 * negocio del JWT (88 de main) y no los de la tienda que se mira (16-10). La
 * tienda pública pide sus productos como visitante: `credentials: "omit"` y
 * sin caché, igual que `contexts/cart-context.tsx`.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, renderHook, waitFor } from "@testing-library/react";

vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: ({ src, alt }: { src: string; alt: string }) => <img src={src} alt={alt} />,
}));

function espiarFetch() {
  const fetchMock = vi.fn(async () => new Response("[]", { status: 200, headers: { "content-type": "application/json" } }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe("productos de la tienda pública sin la sesión del admin", () => {
  it("useStoreProducts pide /api/products como visitante", async () => {
    const fetchMock = espiarFetch();
    const { useStoreProducts } = await import("@/hooks/use-store-products");
    renderHook(() => useStoreProducts());
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/products",
      expect.objectContaining({ credentials: "omit", cache: "no-store" }),
    );
  });

  it("TenantCatalog pide los productos como visitante y con el slug de la página", async () => {
    const fetchMock = espiarFetch();
    const { default: TenantCatalog } = await import("@/app/t/[slug]/tienda/_components/TenantCatalog");
    render(<TenantCatalog slug="musa" storeName="Musa" primaryColor="" currency="PEN" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/products?active=true&limit=100",
      expect.objectContaining({ credentials: "omit", cache: "no-store", headers: { "x-tenant-id": "musa" } }),
    );
  });
});
