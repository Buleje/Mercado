/**
 * Carrito lateral en modo WhatsApp (2026-10-11): con el WhatsApp del negocio
 * usa el kit — imagen lista antes del clic, chat DEL negocio, total «(lo
 * confirma el negocio)» — y después hace lo mismo que antes (pendiente +
 * aviso + «¿enviaste tu pedido?»). Sin número no se dibuja (queda el de siempre).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, waitFor } from "@testing-library/react";
import type { CartItem } from "@/contexts/cart-context";

const tienda = vi.hoisted(() => ({ numero: "987654321" as string | null }));
const carrito = vi.hoisted(() => ({ markOrderPending: vi.fn(), openConfirmModal: vi.fn() }));
const envio = vi.hoisted(() => ({ enviar: vi.fn(async () => ({ via: "portapapeles" as const })) }));

vi.mock("@/components/checkout/hooks/usePedidosTienda", () => ({
  usePedidosTienda: () => ({
    config: { loginGoogle: true, pedirCelular: true, pedirUbicacion: true, pedidoComoImagen: true },
    numeroWhatsapp: tienda.numero,
    nombreNegocio: "Bodega Rosa",
    logo: null,
  }),
}));
vi.mock("@/contexts/customer-context", () => ({
  useCustomer: () => ({
    customer: { name: "Rosa Díaz", phone: "912345678", location: "Jr. Lima 120", reference: "esquina del mercado" },
  }),
}));
vi.mock("@/contexts/cart-context", () => ({ useCart: () => carrito }));
vi.mock("@/components/store/cliente/use-cliente-tienda", () => ({ useClienteTienda: () => ({ cliente: null }) }));
vi.mock("@/components/store/cliente/use-imagen-pedido", () => ({
  useImagenPedido: (datos: unknown) => ({
    blob: datos ? new Blob(["png"], { type: "image/png" }) : null,
    generando: false,
    error: null,
  }),
}));
vi.mock("@/lib/tienda-cliente/imagen-pedido", () => ({ resolverColorCss: () => "rgb(0, 160, 160)" }));
vi.mock("@/lib/tienda-cliente/compartir", async (original) => ({
  ...(await original<typeof import("@/lib/tienda-cliente/compartir")>()),
  enviarPedidoWhatsapp: envio.enviar,
}));

import { PedidoCarritoWhatsapp } from "@/components/checkout/parts/PedidoCarritoWhatsapp";

const items = [
  { id: 1, name: "Arroz Costeño 5 kg", price: 20, quantity: 2, unit: "bolsa", image: "/a.webp" },
  { id: 2, name: "Aceite Primor 1 L", price: 10, quantity: 1, unit: "botella", image: "" },
] as unknown as CartItem[];

afterEach(() => {
  tienda.numero = "987654321";
  vi.clearAllMocks();
});

describe("carrito lateral → WhatsApp del negocio con imagen", () => {
  it("vista previa con los datos a mano y el total que confirma el negocio", () => {
    const r = render(<PedidoCarritoWhatsapp items={items} total={45} onEditar={() => {}} />);
    const vista = r.getByTestId("carrito-whatsapp-kit").textContent ?? "";
    expect(vista).toContain("Hola Bodega Rosa, te envío mi pedido de la tienda en línea:");
    expect(vista).toContain("Descuentos: −S/ 5.00");
    expect(vista).toContain("Total: S/ 45.00 (lo confirma el negocio)");
    expect(vista).toContain("Nombre: Rosa Díaz");
    expect(vista).toContain("Celular: 912 345 678");
    expect(vista).toContain("Entrega: Jr. Lima 120 (esquina del mercado)");
    expect(vista).not.toContain("#");
  });

  it("el clic manda la imagen ya dibujada al número del negocio y luego pregunta si lo envió", async () => {
    const r = render(<PedidoCarritoWhatsapp items={items} total={45} onEditar={() => {}} />);
    fireEvent.click(r.getByRole("button", { name: /Enviar pedido por WhatsApp/ }));
    expect(envio.enviar).toHaveBeenCalledTimes(1);
    const [arg] = envio.enviar.mock.calls[0] as unknown as [{ blob: Blob | null; numero: string; texto: string }];
    expect(arg.numero).toBe("987654321");
    expect(arg.blob).toBeInstanceOf(Blob);
    expect(arg.texto).toContain("(lo confirma el negocio)");
    await waitFor(() => expect(carrito.markOrderPending).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(carrito.openConfirmModal).toHaveBeenCalledTimes(1), { timeout: 3000 });
  });

  it("sin WhatsApp del negocio no se dibuja (el carrito sigue con su envío de siempre)", () => {
    tienda.numero = null;
    const r = render(<PedidoCarritoWhatsapp items={items} total={45} onEditar={() => {}} />);
    expect(r.queryByTestId("carrito-whatsapp-kit")).toBeNull();
  });
});
