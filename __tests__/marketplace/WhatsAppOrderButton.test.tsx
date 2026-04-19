/**
 * Tests — WhatsAppOrderButton
 *
 * Verifica:
 *  1. Retorna null cuando storePhone es null
 *  2. El botón se renderiza cuando hay teléfono
 *  3. El click abre wa.me con el formato correcto
 *  4. El mensaje contiene todos los items con qty + precio
 *  5. El teléfono recibe el prefijo 51 si le falta
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import WhatsAppOrderButton, {
  normalizePhone,
  buildWhatsAppMessage,
} from "@/components/marketplace/WhatsAppOrderButton";

// ── helpers ────────────────────────────────────────────────────────────────────

const ITEMS = [
  { name: "Arroz Costeño 5kg", quantity: 2, price: 17.5, unit: "bolsa" },
  { name: "Aceite Primor", quantity: 1, price: 12.5, unit: null },
];

// ── mocks ──────────────────────────────────────────────────────────────────────

const mockWindowOpen = vi.fn();
const mockFetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));

beforeEach(() => {
  vi.stubGlobal("open", mockWindowOpen);
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── tests ──────────────────────────────────────────────────────────────────────

describe("WhatsAppOrderButton", () => {
  it("retorna null cuando storePhone es null", () => {
    const { container } = render(
      <WhatsAppOrderButton
        storeSlug="bodega-el-sol"
        storeName="Bodega El Sol"
        storePhone={null}
        items={ITEMS}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renderiza el botón cuando hay teléfono", () => {
    render(
      <WhatsAppOrderButton
        storeSlug="bodega-el-sol"
        storeName="Bodega El Sol"
        storePhone="916409675"
        items={ITEMS}
      />,
    );
    const btn = screen.getByRole("button", { name: /pedir por whatsapp/i });
    expect(btn).toBeDefined();
  });

  it("el click abre wa.me con URL correcta", () => {
    render(
      <WhatsAppOrderButton
        storeSlug="bodega-el-sol"
        storeName="Bodega El Sol"
        storePhone="916409675"
        items={ITEMS}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /pedir por whatsapp/i }));

    expect(mockWindowOpen).toHaveBeenCalledOnce();
    const [url, target, features] = mockWindowOpen.mock.calls[0] as [string, string, string];
    expect(url).toMatch(/^https:\/\/wa\.me\/51916409675\?text=/);
    expect(target).toBe("_blank");
    expect(features).toBe("noopener");
  });

  it("el mensaje contiene todos los items con cantidad y precio", () => {
    const message = buildWhatsAppMessage("Bodega El Sol", ITEMS);
    expect(message).toContain("2x Arroz Costeño 5kg");
    expect(message).toContain("1x Aceite Primor");
    // Intl.NumberFormat "es-PE" usa espacio no-rompible (U+00A0) entre "S/" y el número.
    // Verificar las cantidades numéricas sin depender del formato exacto del separador.
    expect(message).toContain("35.00");
    expect(message).toContain("12.50");
    expect(message).toContain("47.50");
  });

  it("normalizePhone agrega prefijo 51 si falta", () => {
    expect(normalizePhone("916409675")).toBe("51916409675");
    expect(normalizePhone("51916409675")).toBe("51916409675");
    expect(normalizePhone("+51 916 409 675")).toBe("51916409675");
    // "00 51 916409675" → digits = "0051916409675" → starts with "00" not "51" → agrega prefijo
    expect(normalizePhone("00 51 916409675")).toBe("510051916409675");
  });
});
