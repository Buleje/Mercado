/**
 * «Enviar mi pedido por WhatsApp» del pedido confirmado sobrevive a una
 * recarga (2026-10-11): se guarda en sessionStorage al confirmar, vence a las
 * 24 h y al recargar se lee de ahí (sin estado del checkout ni carrito).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { useEffect } from "react";

vi.mock("@/components/checkout/hooks/usePedidosTienda", () => ({
  usePedidosTienda: () => ({
    config: { loginGoogle: true, pedirCelular: true, pedirUbicacion: true, pedidoComoImagen: true },
    numeroWhatsapp: "987654321",
    nombreNegocio: "Bodega Rosa",
    logo: null,
  }),
}));
vi.mock("@/components/store/cliente/use-imagen-pedido", () => ({
  useImagenPedido: () => ({ blob: null, generando: false, error: null }),
}));
vi.mock("@/lib/tienda-cliente/imagen-pedido", () => ({ resolverColorCss: () => "rgb(0, 160, 160)" }));

import {
  PREFIJO_PEDIDO_GUARDADO,
  guardarPedidoConfirmado,
  leerPedidoConfirmado,
  type DatosPedidoGuardado,
} from "@/components/checkout/parts/pedido-confirmado-guardado";
import { PedidoConfirmadoWhatsapp, useGuardarPedidoConfirmado } from "@/components/checkout/parts/PedidoConfirmadoWhatsapp";
import { CheckoutFlowProvider, useCheckoutFlow } from "@/components/checkout/checkout-flow-context";

const ENLACE = "https://maps.google.com/?q=-8.379100,-74.553900";
const DATOS: DatosPedidoGuardado = {
  id: "ORD-777",
  total: 40,
  items: [{ name: "Arroz Costeño 5 kg", quantity: 2, price: 25, image: "" }],
  cliente: {
    nombre: "Ana Pérez",
    celular: "987654321",
    direccion: "Jr. Ucayali 450",
    referencia: "casa azul",
    pago: "efectivo",
    ubicacion: ENLACE,
  },
};

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});
afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe("guardado del pedido confirmado", () => {
  it("se lee por id y vence a las 24 h (y se borra)", () => {
    const t0 = Date.UTC(2026, 9, 11, 15, 0, 0);
    expect(guardarPedidoConfirmado(DATOS, t0)).toBe(true);
    expect(leerPedidoConfirmado("ORD-777", t0 + 60 * 60 * 1000)?.cliente.nombre).toBe("Ana Pérez");
    expect(leerPedidoConfirmado("OTRO", t0)).toBeNull();
    expect(leerPedidoConfirmado("ORD-777", t0 + 25 * 60 * 60 * 1000)).toBeNull();
    expect(sessionStorage.getItem(`${PREFIJO_PEDIDO_GUARDADO}ORD-777`)).toBeNull();
  });

  it("no guarda nada que no estuviera en el mensaje (sin notas ni correo)", () => {
    guardarPedidoConfirmado({ ...DATOS, notas: "secreto" } as unknown as DatosPedidoGuardado);
    const crudo = sessionStorage.getItem(`${PREFIJO_PEDIDO_GUARDADO}ORD-777`) ?? "";
    expect(crudo).not.toContain("secreto");
  });
});

describe("al recargar la página", () => {
  it("sin estado del checkout, el botón sigue con los datos guardados", async () => {
    guardarPedidoConfirmado(DATOS);
    const r = render(<PedidoConfirmadoWhatsapp orderId="ORD-777" />);
    await waitFor(() => expect(r.getByTestId("pedido-confirmado-whatsapp")).toBeTruthy());
    expect(r.getByRole("button", { name: /Enviar mi pedido por WhatsApp/ })).toBeTruthy();
  });

  it("sin nada guardado de ese pedido no se dibuja", () => {
    guardarPedidoConfirmado(DATOS);
    const r = render(<PedidoConfirmadoWhatsapp orderId="ORD-888" />);
    expect(r.queryByTestId("pedido-confirmado-whatsapp")).toBeNull();
  });
});

function Preparar() {
  const { dispatch } = useCheckoutFlow();
  useEffect(() => {
    dispatch({ type: "SET_CUSTOMER", patch: { name: "Ana Pérez", phone: "987654321" } });
    dispatch({ type: "SET_ADDRESS", patch: { location: "Jr. Ucayali 450", reference: "casa azul", ubicacionEnVivo: ENLACE } });
    dispatch({ type: "SET_PAYMENT", patch: { method: "efectivo" } });
    dispatch({ type: "SET_UI", patch: { orderId: "ORD-777" } });
  }, [dispatch]);
  return null;
}
function Guardar() {
  useGuardarPedidoConfirmado("ORD-777");
  return null;
}

describe("al confirmar", () => {
  it("la pantalla de éxito guarda productos y total del servidor + datos del checkout", async () => {
    localStorage.setItem(
      "buleje-last-order",
      JSON.stringify({ id: "ORD-777", total: 40, items: [{ name: "Arroz Costeño 5 kg", quantity: 2, price: 25, unit: "bolsa", image: "" }] }),
    );
    render(
      <CheckoutFlowProvider>
        <Preparar />
        <Guardar />
      </CheckoutFlowProvider>,
    );
    await waitFor(() => expect(leerPedidoConfirmado("ORD-777")).not.toBeNull());
    const g = leerPedidoConfirmado("ORD-777");
    expect(g?.total).toBe(40);
    expect(g?.cliente).toMatchObject({ nombre: "Ana Pérez", direccion: "Jr. Ucayali 450", ubicacion: ENLACE, pago: "efectivo" });
  });
});
