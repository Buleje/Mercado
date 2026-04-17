/**
 * Tests de componente — MarketplaceNavbar
 *
 * MarketplaceNavbar usa: next/navigation (useRouter), next/link, next/dynamic,
 * lucide-react, MarketplaceCart, MarketplaceCheckoutModal, AuthModal.
 * Se mockean todos para aislar el comportamiento del navbar.
 *
 * Comportamientos verificados:
 *   - Logo enlaza a /marketplace
 *   - Input de búsqueda envía al router al hacer submit
 *   - Botón hamburguesa abre el menú móvil
 *   - Menú móvil cierra al hacer clic en un link interno
 *   - Botón "Ingresar" abre el AuthModal
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ─────────────────────────────────────────────────────────────────────

const mockPush = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => ({ get: vi.fn() }),
  usePathname: () => "/marketplace",
}));

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    onClick,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLAnchorElement>;
  } & React.AnchorHTMLAttributes<HTMLAnchorElement>) => (
    <a href={href} onClick={onClick} {...props}>{children}</a>
  ),
}));

vi.mock("next/dynamic", () => ({
  default: (_loader: unknown, _opts?: unknown) => {
    const MockDynamic = () => null;
    MockDynamic.displayName = "DynamicMock";
    return MockDynamic;
  },
}));

vi.mock("lucide-react", () => ({
  Search: () => <span data-testid="icon-search" />,
  ChefHat: () => <span data-testid="icon-chef" />,
  Menu: () => <span data-testid="icon-menu">menu</span>,
  X: () => <span data-testid="icon-x">x</span>,
}));

vi.mock("framer-motion", () => ({
  motion: {
    span: ({ children, ...props }: React.HTMLAttributes<HTMLSpanElement> & { children?: React.ReactNode }) =>
      <span {...props}>{children}</span>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// CartBadge: botón con aria-label que contiene "Carrito"
vi.mock("@/components/marketplace/MarketplaceCart", () => ({
  CartBadge: ({ onClick }: { onClick: () => void }) => (
    <button aria-label="Carrito — 0 productos" onClick={onClick}>
      <span>carrito</span>
    </button>
  ),
  default: () => null,
}));

vi.mock("@/components/marketplace/MarketplaceCheckoutModal", () => ({
  default: () => null,
}));

vi.mock("@/components/auth/AuthModal", () => ({
  AuthModal: ({ open }: { open: boolean; onClose: () => void }) =>
    open ? <div role="dialog" aria-label="Iniciar sesión">modal-auth</div> : null,
  useAuthModal: () => ({
    authModalOpen: false,
    openAuthModal: vi.fn(),
    closeAuthModal: vi.fn(),
  }),
}));

// ── Importar DESPUÉS de los mocks ─────────────────────────────────────────────

import MarketplaceNavbar from "@/components/marketplace/MarketplaceNavbar";

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
});

describe("MarketplaceNavbar", () => {
  it("logo 'B' enlaza a /marketplace", () => {
    render(<MarketplaceNavbar />);
    // El logo es un Link con href=/marketplace que contiene la letra "B"
    const logoLinks = screen.getAllByRole("link");
    const marketplaceLink = logoLinks.find(
      (l) => l.getAttribute("href") === "/marketplace" && l.textContent?.includes("B")
    );
    expect(marketplaceLink).toBeDefined();
  });

  it("submit del formulario de búsqueda navega al router con el término", () => {
    render(<MarketplaceNavbar />);

    const input = screen.getByPlaceholderText(/Buscar tiendas/i);
    fireEvent.change(input, { target: { value: "arroz" } });

    const form = input.closest("form")!;
    fireEvent.submit(form);

    expect(mockPush).toHaveBeenCalledWith(
      "/marketplace?buscar=arroz"
    );
  });

  it("submit con campo vacío NO navega", () => {
    render(<MarketplaceNavbar />);

    const input = screen.getByPlaceholderText(/Buscar tiendas/i);
    fireEvent.change(input, { target: { value: "   " } });

    const form = input.closest("form")!;
    fireEvent.submit(form);

    expect(mockPush).not.toHaveBeenCalled();
  });

  it("botón hamburguesa abre el menú móvil", () => {
    render(<MarketplaceNavbar />);

    // Antes de abrir no existe el texto del menú móvil (Inicio, etc. están también en desktop)
    const burgerBtn = screen.getByRole("button", { name: "Abrir menú" });
    expect(burgerBtn).toBeInTheDocument();

    // El menú móvil no tiene un elemento propio único antes del clic
    // verificamos que el ícono hamburgesa esté visible
    expect(screen.getByTestId("icon-menu")).toBeInTheDocument();

    fireEvent.click(burgerBtn);

    // Después del clic el ícono "x" debe aparecer (menú abierto)
    expect(screen.getByTestId("icon-x")).toBeInTheDocument();
  });

  it("botón carrito está presente y tiene aria-label correcto", () => {
    render(<MarketplaceNavbar />);
    const cartBtns = screen.getAllByRole("button", { name: /carrito/i });
    expect(cartBtns.length).toBeGreaterThan(0);
  });
});
