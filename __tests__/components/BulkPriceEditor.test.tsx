/**
 * Tests de componente — BulkPriceEditorTab
 *
 * Componente: components/admin/marketplace/BulkPriceEditorTab.tsx
 * Comportamiento real:
 *   - Carga productos vía fetch("/api/marketplace/products?limit=500")
 *   - Si fetch falla, usa 10 productos mock
 *   - Editar precio inline actualiza el estado de changes
 *   - Botón "Aplicar cambios" se habilita cuando hay al menos 1 change
 *   - Click en "Aplicar cambios" → abre modal ConfirmModal
 *   - Confirmar → POST /api/marketplace/products/bulk-edit
 *   - Exportar CSV → crea blob download
 *   - Error 500 del backend → muestra toast de error
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import BulkPriceEditorTab from "@/components/admin/marketplace/BulkPriceEditorTab";

vi.mock("server-only", () => ({}));

// ── next/image ────────────────────────────────────────────────────────────────
vi.mock("next/image", () => ({
  default: ({ alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement> & { alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img alt={alt} {...props} />
  ),
}));

// ── lucide-react (iconos) ────────────────────────────────────────────────────
vi.mock("lucide-react", () => ({
  Search: () => <span data-testid="icon-search" />,
  X: () => <span data-testid="icon-x" />,
  Upload: () => <span data-testid="icon-upload" />,
  Download: () => <span data-testid="icon-download" />,
  CheckCircle: () => <span data-testid="icon-check" />,
  XCircle: () => <span data-testid="icon-xcircle" />,
  Loader2: () => <span data-testid="icon-loader" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
  ImageOff: () => <span data-testid="icon-imageoff" />,
  ToggleLeft: () => <span data-testid="icon-toggle-off" />,
  ToggleRight: () => <span data-testid="icon-toggle-on" />,
}));

// ── lib/utils ─────────────────────────────────────────────────────────────────
vi.mock("@/lib/utils", () => ({
  cn: (...args: (string | undefined | null | false)[]) => args.filter(Boolean).join(" "),
}));

// ── Datos de ejemplo ──────────────────────────────────────────────────────────
function makeProducts(count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    name: `Producto ${i + 1}`,
    category: ["abarrotes", "bebidas"][i % 2],
    price: (i + 1) * 5,
    stock: 10 + i,
    active: true,
    image: null,
  }));
}

// ── fetch global mock ─────────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ── URL.createObjectURL / revokeObjectURL ─────────────────────────────────────
global.URL.createObjectURL = vi.fn(() => "blob:fake");
global.URL.revokeObjectURL = vi.fn();

// ── HTMLAnchorElement.click ───────────────────────────────────────────────────
HTMLAnchorElement.prototype.click = vi.fn();

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("BulkPriceEditorTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // 1. Render con 5 productos mockeados
  it("renderiza 5 productos cuando el fetch responde correctamente", async () => {
    const products = makeProducts(5);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: products }),
    });

    render(<BulkPriceEditorTab />);

    await waitFor(() => {
      expect(screen.getByText("Producto 1")).toBeInTheDocument();
    });
    expect(screen.getByText("Producto 5")).toBeInTheDocument();
  });

  // 2. Editar precio inline → value en state (botón "Aplicar" se habilita)
  it("editar precio inline habilita el botón 'Aplicar cambios'", async () => {
    const products = makeProducts(3);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: products }),
    });

    render(<BulkPriceEditorTab />);

    await waitFor(() => screen.getByText("Producto 1"));

    // El botón de aplicar empieza deshabilitado
    const applyBtn = screen.getByRole("button", { name: /aplicar cambios/i });
    expect(applyBtn).toBeDisabled();

    // Editar el precio del primer producto
    const priceInputs = screen.getAllByPlaceholderText(/^\d+\.\d{2}$/);
    await userEvent.clear(priceInputs[0]);
    await userEvent.type(priceInputs[0], "15.5");

    // Ahora el botón debe estar habilitado
    await waitFor(() => {
      expect(applyBtn).not.toBeDisabled();
    });
  });

  // 3. Click "Aplicar" → abre modal confirmación
  it("click en 'Aplicar cambios' abre el modal de confirmación", async () => {
    const products = makeProducts(2);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: products }),
    });

    render(<BulkPriceEditorTab />);
    await waitFor(() => screen.getByText("Producto 1"));

    // Editar un precio para habilitar el botón
    const priceInputs = screen.getAllByPlaceholderText(/^\d+\.\d{2}$/);
    await userEvent.clear(priceInputs[0]);
    await userEvent.type(priceInputs[0], "20");

    const applyBtn = screen.getByRole("button", { name: /aplicar cambios/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());
    await userEvent.click(applyBtn);

    expect(screen.getByText("Confirmar cambios")).toBeInTheDocument();
  });

  // 4. Confirmar → fetch POST con updates
  it("confirmar en modal → fetch POST a /api/marketplace/products/bulk-edit", async () => {
    const products = makeProducts(2);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: products }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ updated: 1, failed: [] }),
      });

    render(<BulkPriceEditorTab />);
    await waitFor(() => screen.getByText("Producto 1"));

    // Editar precio
    const priceInputs = screen.getAllByPlaceholderText(/^\d+\.\d{2}$/);
    await userEvent.clear(priceInputs[0]);
    await userEvent.type(priceInputs[0], "99");

    // Abrir modal
    const applyBtn = screen.getByRole("button", { name: /aplicar cambios/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());
    await userEvent.click(applyBtn);

    // Confirmar
    const confirmBtn = screen.getByRole("button", { name: /confirmar/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        "/api/marketplace/products/bulk-edit",
        expect.objectContaining({
          method: "POST",
          body: expect.stringContaining('"updates"'),
        })
      );
    });
  });

  // 5. CSV export crea blob download
  it("click en 'Exportar CSV' invoca URL.createObjectURL", async () => {
    const products = makeProducts(3);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: products }),
    });

    render(<BulkPriceEditorTab />);
    await waitFor(() => screen.getByText("Producto 1"));

    const exportBtn = screen.getByRole("button", { name: /exportar csv/i });
    await userEvent.click(exportBtn);

    expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
    expect(HTMLAnchorElement.prototype.click).toHaveBeenCalledTimes(1);
  });

  // 6. Error 500 del backend → toast de error
  it("error 500 del backend al aplicar → muestra toast de error", async () => {
    const products = makeProducts(2);
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: products }),
      })
      .mockResolvedValueOnce({
        ok: false,
        json: async () => ({ error: "Internal Server Error" }),
      });

    render(<BulkPriceEditorTab />);
    await waitFor(() => screen.getByText("Producto 1"));

    // Editar precio para habilitar botón
    const priceInputs = screen.getAllByPlaceholderText(/^\d+\.\d{2}$/);
    await userEvent.clear(priceInputs[0]);
    await userEvent.type(priceInputs[0], "5");

    const applyBtn = screen.getByRole("button", { name: /aplicar cambios/i });
    await waitFor(() => expect(applyBtn).not.toBeDisabled());
    await userEvent.click(applyBtn);

    const confirmBtn = screen.getByRole("button", { name: /confirmar/i });
    await userEvent.click(confirmBtn);

    // Debe aparecer un toast con mensaje de error
    await waitFor(() => {
      // El toast muestra el error del backend o un mensaje genérico
      const errorIcon = screen.queryByTestId("icon-xcircle");
      expect(errorIcon).toBeInTheDocument();
    });
  });
});
