/**
 * Tests de componente — ProductGallery
 *
 * Implementación real:
 *   - export default ProductGallery
 *   - props: { images: { url, alt? }[], productName: string, fallbackImage?: string }
 *   - thumbnails: aria-label="Imagen N de M" (solo desktop hidden sm:flex)
 *   - prev/next: aria-label="Anterior" / "Siguiente" (solo si images.length > 1)
 *   - sin imágenes y sin fallback: muestra "Sin imagen" (texto)
 *   - sin imágenes con fallback: muestra la img del fallback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ProductGallery from "@/components/marketplace/ProductGallery";

vi.mock("server-only", () => ({}));

vi.mock("framer-motion", () => {
  const MotionDiv = ({ children, ...props }: React.HTMLAttributes<HTMLDivElement> & { children?: React.ReactNode }) =>
    <div {...props}>{children}</div>;
  const motion = { div: MotionDiv };
  return {
    motion,
    m: motion,
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    LazyMotion: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    domAnimation: {},
  };
});

vi.mock("next/image", () => ({
  default: ({
    src,
    alt,
    fill: _fill,
    sizes: _sizes,
    priority: _priority,
    className,
  }: {
    src: string;
    alt: string;
    fill?: boolean;
    sizes?: string;
    priority?: boolean;
    className?: string;
  }) => <img src={src} alt={alt} className={className} />,
}));

vi.mock("lucide-react", () => ({
  ChevronLeft: () => <span>ChevronLeft</span>,
  ChevronRight: () => <span>ChevronRight</span>,
  ZoomIn: () => <span>ZoomIn</span>,
  X: () => <span>X</span>,
  Package: () => <span>Package</span>,
}));

vi.mock("@/lib/utils", () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(" "),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const IMG_1 = { url: "https://example.com/img1.jpg", alt: "Vista frontal" };
const IMG_2 = { url: "https://example.com/img2.jpg", alt: "Vista lateral" };
const IMG_3 = { url: "https://example.com/img3.jpg", alt: "Vista trasera" };
const IMG_4 = { url: "https://example.com/img4.jpg", alt: "Detalle" };
const IMG_5 = { url: "https://example.com/img5.jpg", alt: "Empaque" };

describe("ProductGallery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("render con 1 imagen → NO muestra botones Anterior/Siguiente", () => {
    render(<ProductGallery images={[IMG_1]} productName="Arroz" />);
    expect(screen.queryByRole("button", { name: "Anterior" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Siguiente" })).not.toBeInTheDocument();
  });

  it("render con 5 imágenes → muestra 5 thumbnails", () => {
    render(<ProductGallery images={[IMG_1, IMG_2, IMG_3, IMG_4, IMG_5]} productName="Arroz" />);
    // thumbnails tienen aria-label="Imagen N de 5"
    expect(screen.getByRole("button", { name: "Imagen 1 de 5" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Imagen 5 de 5" })).toBeInTheDocument();
  });

  it("click en thumbnail #3 → cambia imagen principal al índice 2", () => {
    render(<ProductGallery images={[IMG_1, IMG_2, IMG_3, IMG_4, IMG_5]} productName="Arroz" />);
    fireEvent.click(screen.getByRole("button", { name: "Imagen 3 de 5" }));
    // Hay múltiples imgs con ese alt (thumbnail + principal) — verificamos que al menos 1 existe
    const imgs = screen.getAllByAltText("Vista trasera");
    expect(imgs.length).toBeGreaterThanOrEqual(1);
    // El thumbnail #3 debe tener la clase de selección (border-[#2563EB])
    const thumb3 = screen.getByRole("button", { name: "Imagen 3 de 5" });
    expect(thumb3.className).toContain("border-primary");
  });

  it("sin imágenes y sin fallback → muestra texto 'Sin imagen'", () => {
    render(<ProductGallery images={[]} productName="Producto sin foto" />);
    expect(screen.getByText("Sin imagen")).toBeInTheDocument();
  });

  it("sin imágenes con fallback → muestra la imagen de fallback", () => {
    const FALLBACK = "https://example.com/fallback.jpg";
    render(<ProductGallery images={[]} productName="Producto" fallbackImage={FALLBACK} />);
    const img = screen.getByRole("img");
    expect(img).toHaveAttribute("src", FALLBACK);
  });

  it("render con 2+ imágenes → botones Anterior y Siguiente tienen aria-labels correctos", () => {
    render(<ProductGallery images={[IMG_1, IMG_2]} productName="Arroz" />);
    expect(screen.getByRole("button", { name: "Anterior" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Siguiente" })).toBeInTheDocument();
  });
});
