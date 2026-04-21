/**
 * QuickAddDrawer — tests del drawer lateral de "agregar rápido al carrito".
 *
 * Protege contra:
 *   - Regresión del "archivo vacío" (antes crasheaba /marketplace/explorar).
 *   - Cambios que rompan el stepper o el botón de agregar.
 *   - Desconexión con el provider o el cart context.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QuickAddProvider, useQuickAdd } from "@/contexts/quick-add-context";
import QuickAddDrawer from "@/components/marketplace/QuickAddDrawer";
import type { Product } from "@/data/products";

const addItemMock = vi.fn();
const showToastMock = vi.fn();

vi.mock("@/contexts/cart-context", () => ({
  useCart: () => ({ addItem: addItemMock }),
}));

vi.mock("@/contexts/toast-context", () => ({
  useToast: () => ({ showToast: showToastMock }),
}));

// next/image: render como <img> simple para JSDOM. Filtramos `fill` (boolean)
// y `sizes` para evitar warning de DOM attribute.
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    const { fill: _fill, sizes: _sizes, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element
    return <img {...(rest as React.ImgHTMLAttributes<HTMLImageElement>)} alt={String(rest.alt ?? "")} />;
  },
}));

// framer-motion: en JSDOM las animaciones de salida de AnimatePresence no se
// completan (no hay RAF real). Mockeamos AnimatePresence como passthrough para
// que `exit` sea inmediato — así podemos testear el ciclo de abrir/cerrar.
vi.mock("framer-motion", async () => {
  const actual = await vi.importActual<typeof import("framer-motion")>("framer-motion");
  return {
    ...actual,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const PRODUCT: Product = {
  id: 42,
  name: "Arroz Superior",
  category: "abarrotes",
  price: 12.5,
  image: "/img/arroz.png",
  unit: "kg",
  description: "1kg de arroz Superior",
};

function Harness({ product }: { product: Product }) {
  const { openQuickAdd } = useQuickAdd();
  return (
    <>
      <button onClick={() => openQuickAdd(product)}>open</button>
      <QuickAddDrawer />
    </>
  );
}

function renderWithProvider(product: Product = PRODUCT) {
  return render(
    <QuickAddProvider>
      <Harness product={product} />
    </QuickAddProvider>,
  );
}

describe("QuickAddDrawer", () => {
  beforeEach(() => {
    addItemMock.mockClear();
    showToastMock.mockClear();
  });
  afterEach(cleanup);

  it("does not render panel when closed", () => {
    renderWithProvider();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens with product info when openQuickAdd() is called", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Arroz Superior")).toBeInTheDocument();
    // Precio aparece 2 veces: en el header (precio unitario) y en el subtotal.
    expect(screen.getAllByText(/S\/ 12\.50/).length).toBeGreaterThanOrEqual(1);
  });

  it("stepper increments and decrements, clamped to [1, maxQty]", () => {
    renderWithProvider({ ...PRODUCT, stock: 3 });
    fireEvent.click(screen.getByText("open"));

    const dec = screen.getByLabelText("Disminuir cantidad");
    const inc = screen.getByLabelText("Aumentar cantidad");

    expect(dec).toBeDisabled();
    fireEvent.click(inc);
    fireEvent.click(inc);
    expect(screen.getByText("3")).toBeInTheDocument();
    fireEvent.click(inc);
    expect(inc).toBeDisabled();
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("calls addItem N times with the product and shows toast", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("open"));

    fireEvent.click(screen.getByLabelText("Aumentar cantidad"));
    fireEvent.click(screen.getByLabelText("Aumentar cantidad"));
    const addBtn = screen.getByRole("button", { name: /Agregar 3/i });
    fireEvent.click(addBtn);

    expect(addItemMock).toHaveBeenCalledTimes(3);
    expect(addItemMock).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
    expect(showToastMock).toHaveBeenCalledWith("3× Arroz Superior", "/img/arroz.png");
  });

  it("closes on Escape", () => {
    renderWithProvider();
    fireEvent.click(screen.getByText("open"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    // La animación de salida elimina el panel; framer-motion lo desmonta.
    // En JSDOM sin animaciones reales, el estado isOpen=false basta.
    // Consultamos el aria-modal: si sigue presente sería un fail.
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("shows 'Agotado' when stock is 0 and disables the add button", () => {
    renderWithProvider({ ...PRODUCT, stock: 0 });
    fireEvent.click(screen.getByText("open"));

    expect(screen.getByText(/agotado por ahora/i)).toBeInTheDocument();
    const addBtn = screen.getByRole("button", { name: /Agotado/i });
    expect(addBtn).toBeDisabled();
  });
});
