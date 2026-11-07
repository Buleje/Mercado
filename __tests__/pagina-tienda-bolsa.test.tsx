/**
 * ADR-511 · La bolsa de la plantilla de tienda, con el carrito de siempre:
 * · En el marco, «Finalizar compra» cierra la bolsa y abre el checkout del
 *   layout (`openCheckout`), sin tocar el checkout.
 * · En la portada (sin layout), el checkout se baja y se monta ahí mismo.
 * · Por WhatsApp: guía al dato que falta y arma el enlace con el nombre, las
 *   zonas y los pagos del NEGOCIO (nada fijo de Musa).
 * · Quitar deja deshacer; Escape cierra; sin productos, «Tu bolsa está vacía».
 */
// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const carrito = vi.hoisted(() => ({
  items: [] as { id: number; name: string; price: number; quantity: number; image: string; stock?: number }[],
  count: 0,
  total: 0,
  checkoutOpen: false,
  openCheckout: vi.fn(),
  updateQty: vi.fn(),
  removeItem: vi.fn(),
  addMultiple: vi.fn(),
}));
vi.mock("@/contexts/cart-context", () => ({ useCart: () => carrito, CARRITO_NO_AGREGADO: "carrito:no-agregado" }));

const montado = vi.hoisted(() => vi.fn());
vi.mock("@/extensiones/pagina-tienda/BolsaCheckoutEnPortada", () => ({
  CheckoutEnPortada: ({ pedido }: { pedido: boolean }) => {
    montado(pedido);
    return null;
  },
}));

import { PartesBolsa } from "@/extensiones/pagina-tienda/Bolsa";
import { abrirBolsa, cerrarBolsa } from "@/extensiones/pagina-tienda/estado-bolsa";
import type { DatosBolsa } from "@/extensiones/pagina-tienda/producto-carrito";

const BOLSA: DatosBolsa = {
  slug: "demo",
  nombre: "Pizza Demo",
  logo: null,
  whatsapp: "51987654321",
  direccion: null,
  pagos: ["Yape", "Efectivo"],
  envio: { gratisDesde: 100, zonas: [{ nombre: "Centro", costo: 5 }] },
  pedidosCliente: { loginGoogle: false, pedirCelular: false, pedirUbicacion: false, pedidoComoImagen: false },
  pedido: "checkout",
  acento: "rgb(0, 120, 90)",
  codigos: { 1: "PZ-01" },
  catalogo: "/t/demo/tienda",
};

function conPizza() {
  carrito.items = [{ id: 1, name: "Pizza americana", price: 39, quantity: 1, image: "" }];
  carrito.count = 1;
  carrito.total = 39;
}

beforeEach(() => {
  localStorage.clear();
  conPizza();
  act(() => abrirBolsa());
});

afterEach(() => {
  act(() => cerrarBolsa());
  cleanup();
  vi.clearAllMocks();
});

describe("bolsa → checkout", () => {
  it("en el marco cierra la bolsa y abre el checkout del layout con ese carrito", () => {
    const { container } = render(<PartesBolsa bolsa={BOLSA} />);
    expect(screen.getByRole("dialog", { name: /Tu bolsa/ })).toBeTruthy();
    expect(container.querySelector("[data-ti-avance-envio]")?.textContent).toContain("Te faltan S/ 61 para el envío gratis");
    expect(screen.getByText("Pizza americana")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Finalizar compra/ }));
    expect(carrito.openCheckout).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(montado).not.toHaveBeenCalled();
  });

  it("en la portada baja el checkout y lo monta ahí mismo (sin cambiar de página)", async () => {
    render(<PartesBolsa bolsa={BOLSA} enPortada />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Finalizar compra/ }));
    });
    await vi.waitFor(() => expect(montado).toHaveBeenCalledWith(true));
    expect(screen.getByText("Preparando tu pedido…")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull(); // la bolsa se cerró: el checkout va encima
    expect(window.location.pathname).not.toContain("/tienda");
  });
});

describe("bolsa → WhatsApp", () => {
  const PORWSP: DatosBolsa = { ...BOLSA, pedido: "whatsapp" };

  it("sin nombre no abre WhatsApp: dice qué falta y lleva el foco ahí", () => {
    render(<PartesBolsa bolsa={PORWSP} />);
    fireEvent.click(screen.getByRole("button", { name: /Pedir por WhatsApp/ }));
    expect(screen.getByText("Escribe tu nombre para que Pizza Demo sepa quién pide.")).toBeTruthy();
    expect(document.activeElement).toBe(screen.getByPlaceholderText("Tu nombre"));
  });

  it("con nombre arma el mensaje con el negocio, su zona y su pago", () => {
    render(<PartesBolsa bolsa={PORWSP} />);
    fireEvent.change(screen.getByPlaceholderText("Tu nombre"), { target: { value: "Ana" } });
    const enlace = screen.getByRole("link", { name: /Pedir por WhatsApp/ }) as HTMLAnchorElement;
    expect(enlace.href.startsWith("https://wa.me/51987654321?text=")).toBe(true);
    const mensaje = decodeURIComponent(enlace.href.split("text=")[1]);
    expect(mensaje).toContain("Hola Pizza Demo, quiero:");
    expect(mensaje).toContain("• 1 × Pizza americana (PZ-01) S/ 39");
    expect(mensaje).toContain("Envío (Centro): S/ 5");
    expect(mensaje).toContain("Total: S/ 44");
    expect(mensaje).toContain("Pago: Yape");
    expect(screen.getByText("S/ 44")).toBeTruthy(); // el total (vista previa) incluye el envío de la zona
  });
});

describe("cajón", () => {
  it("quitar deja deshacer con el carrito de siempre", () => {
    render(<PartesBolsa bolsa={BOLSA} />);
    fireEvent.click(screen.getByRole("button", { name: "Sacar Pizza americana de tu bolsa" }));
    expect(carrito.removeItem).toHaveBeenCalledWith(1);
    fireEvent.click(screen.getByRole("button", { name: /Deshacer/ }));
    expect(carrito.addMultiple).toHaveBeenCalledWith([{ product: carrito.items[0], quantity: 1 }]);
  });

  it("Escape cierra la bolsa", () => {
    render(<PartesBolsa bolsa={BOLSA} />);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("sin productos: «Tu bolsa está vacía» y el enlace al catálogo", () => {
    carrito.items = [];
    carrito.count = 0;
    carrito.total = 0;
    render(<PartesBolsa bolsa={BOLSA} />);
    expect(screen.getByText("Tu bolsa está vacía")).toBeTruthy();
    expect((screen.getByRole("link", { name: /Ver el catálogo/ }) as HTMLAnchorElement).getAttribute("href")).toBe("/t/demo/tienda");
  });
});
