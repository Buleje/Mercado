/**
 * Tests — StoreWhatsAppButton
 *
 * Componente: components/marketplace/StoreWhatsAppButton.tsx
 * Props: whatsappNumber, storeName, productName?, productSlug?, variant?
 * Comportamiento:
 *   - Null si whatsappNumber es null/undefined
 *   - Null si whatsappNumber tiene menos de 7 dígitos
 *   - Href correcto con mensaje default (sin producto)
 *   - Href correcto con mensaje que incluye productName
 *   - Normaliza número: quita espacios, +, guiones
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import StoreWhatsAppButton from "@/components/marketplace/StoreWhatsAppButton";

vi.mock("server-only", () => ({}));

vi.mock("lucide-react", () => ({
  MessageCircle: () => <span data-testid="icon-message-circle" />,
}));

// fetch global mock (analytics fire-and-forget)
const fetchMock = vi.fn().mockResolvedValue({ ok: true });
vi.stubGlobal("fetch", fetchMock);

describe("StoreWhatsAppButton", () => {
  beforeEach(() => vi.clearAllMocks());

  // ── Test 1 ────────────────────────────────────────────────────────────────

  it("renderiza null cuando whatsappNumber es null", () => {
    const { container } = render(
      <StoreWhatsAppButton whatsappNumber={null} storeName="Bodega Lima" />
    );
    expect(container.firstChild).toBeNull();
  });

  // ── Test 2 ────────────────────────────────────────────────────────────────

  it("renderiza null cuando whatsappNumber tiene menos de 7 dígitos", () => {
    const { container } = render(
      <StoreWhatsAppButton whatsappNumber="123" storeName="Bodega Lima" />
    );
    expect(container.firstChild).toBeNull();
  });

  // ── Test 3 ────────────────────────────────────────────────────────────────

  it("construye href correcto con mensaje default cuando no hay productName", () => {
    render(
      <StoreWhatsAppButton
        whatsappNumber="+51987654321"
        storeName="Bodega Lima"
        variant="primary"
      />
    );

    const link = screen.getByRole("link");
    const href = link.getAttribute("href") ?? "";

    expect(href).toContain("https://wa.me/51987654321");
    expect(href).toContain(encodeURIComponent("Hola! Tengo una consulta sobre la tienda Bodega Lima en Buleje"));
  });

  // ── Test 4 ────────────────────────────────────────────────────────────────

  it("construye href correcto con mensaje que incluye productName", () => {
    render(
      <StoreWhatsAppButton
        whatsappNumber="+51987654321"
        storeName="Bodega Lima"
        productName="Arroz Costeño 5kg"
        variant="outline"
      />
    );

    const link = screen.getByRole("link");
    const href = link.getAttribute("href") ?? "";

    expect(href).toContain("https://wa.me/51987654321");
    expect(href).toContain(
      encodeURIComponent("Hola! Me interesa el producto 'Arroz Costeño 5kg' de Bodega Lima en Buleje. ¿Esta disponible?")
    );
  });

  // ── Test 5 ────────────────────────────────────────────────────────────────

  it("normaliza el número eliminando espacios, guiones y signo +", () => {
    render(
      <StoreWhatsAppButton
        whatsappNumber="+51 987 654 321"
        storeName="Tienda Norte"
        variant="primary"
      />
    );

    const link = screen.getByRole("link");
    const href = link.getAttribute("href") ?? "";

    // El número limpio debe ser solo dígitos, sin +, espacios ni guiones
    expect(href).toContain("https://wa.me/51987654321");
  });
});
