/**
 * Tests de componente — ShareCartButton
 *
 * Cubre:
 *  1. Botón deshabilitado cuando el carrito está vacío
 *  2. Copia al portapapeles la URL correcta
 *  3. Feedback visual "Link copiado" tras copiar
 *  4. navigator.share es llamado cuando está disponible
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import ShareCartButton from "@/components/marketplace/ShareCartButton";

// ---------- mocks ----------

const mockItems = [
  {
    storeId: "tienda-1",
    storeName: "Bodega Test",
    storeSlug: "bodega-test",
    storeProductId: "sp-1",
    productId: 1,
    name: "Arroz",
    price: 3.5,
    quantity: 2,
    image: null,
    unit: "kg",
  },
];

vi.mock("@/hooks/use-marketplace-cart", () => ({
  useMarketplaceCart: vi.fn(),
}));

import { useMarketplaceCart } from "@/hooks/use-marketplace-cart";

const mockUseMarketplaceCart = vi.mocked(useMarketplaceCart);

// ---------- helpers ----------

function renderButton() {
  return render(<ShareCartButton />);
}

// ---------- tests ----------

describe("ShareCartButton", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Resetear window.location
    Object.defineProperty(window, "location", {
      value: { origin: "http://localhost:3000" },
      writable: true,
      configurable: true,
    });
  });

  it("se renderiza deshabilitado cuando el carrito está vacío", () => {
    mockUseMarketplaceCart.mockReturnValue({
      items: [],
      itemCount: 0,
    } as unknown as ReturnType<typeof useMarketplaceCart>);

    renderButton();

    const btn = screen.getByRole("button");
    expect(btn).toBeDisabled();
    expect(btn).toHaveAttribute("aria-label", "Agregá productos para compartir");
  });

  it("llama a navigator.clipboard.writeText con la URL correcta", async () => {
    mockUseMarketplaceCart.mockReturnValue({
      items: mockItems,
      itemCount: 2,
    } as ReturnType<typeof useMarketplaceCart>);

    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    // Asegurar que navigator.share no esté definido (para forzar clipboard)
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    renderButton();
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });

    const calledUrl: string = writeText.mock.calls[0][0];
    expect(calledUrl).toMatch(/^http:\/\/localhost:3000\/marketplace\?cart=/);
    // Extraer solo el token (parte después de "?cart=") y verificar que sea URL-safe
    const token = calledUrl.split("?cart=")[1] ?? "";
    expect(token).not.toMatch(/[+/=]/);
  });

  it("muestra feedback visual 'Link copiado' tras copiar", async () => {
    mockUseMarketplaceCart.mockReturnValue({
      items: mockItems,
      itemCount: 2,
    } as ReturnType<typeof useMarketplaceCart>);

    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      writable: true,
      configurable: true,
    });
    Object.defineProperty(navigator, "share", {
      value: undefined,
      writable: true,
      configurable: true,
    });

    renderButton();
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(screen.getByRole("button")).toHaveTextContent(/link copiado/i);
    });
  });

  it("llama a navigator.share cuando está disponible", async () => {
    mockUseMarketplaceCart.mockReturnValue({
      items: mockItems,
      itemCount: 2,
    } as ReturnType<typeof useMarketplaceCart>);

    const shareFn = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", {
      value: shareFn,
      writable: true,
      configurable: true,
    });

    renderButton();
    fireEvent.click(screen.getByRole("button"));

    await waitFor(() => {
      expect(shareFn).toHaveBeenCalledTimes(1);
    });

    const shareArg = shareFn.mock.calls[0][0];
    expect(shareArg).toMatchObject({
      title: expect.stringContaining("carrito"),
      url: expect.stringMatching(/\/marketplace\?cart=/),
    });
  });
});
