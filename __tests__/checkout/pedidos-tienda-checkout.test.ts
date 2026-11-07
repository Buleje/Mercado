import { describe, it, expect } from "vitest";
import { limpiarCelularEscrito } from "@/components/checkout/parts/phone-validation";
import {
  enlaceMapa,
  notasDelPedido,
  sanearNotasUbicacion,
  ubicacionDeEnlace,
} from "@/components/checkout/parts/ubicacion-en-notas";
import { buildOrderPayload } from "@/components/checkout/hooks/checkout-submit-helpers";
import { INITIAL_CHECKOUT_STATE } from "@/components/checkout/hooks/useCheckoutState";
import {
  datosImagenCheckout,
  textoPedidoWhatsapp,
  descuentoTotal,
  type PedidoConfirmado,
} from "@/components/checkout/parts/pedido-whatsapp-checkout";
import { rutaParaVolverAlCheckout } from "@/components/checkout/hooks/useGoogleCheckout";
import { numeroWhatsappDe } from "@/components/checkout/hooks/usePedidosTienda";

const ENLACE = "https://maps.google.com/?q=-8.379100,-74.553900";

describe("limpiarCelularEscrito", () => {
  it("pegar el celular con prefijo deja los 9 dígitos", () => {
    expect(limpiarCelularEscrito("+51 987 654 321")).toBe("987654321");
    expect(limpiarCelularEscrito("(+51) 987.654.321")).toBe("987654321");
    expect(limpiarCelularEscrito("0051 987 654 321")).toBe("987654321");
  });
  it("tecleando sigue igual que antes: sólo dígitos, máximo 9", () => {
    expect(limpiarCelularEscrito("98a7")).toBe("987");
    expect(limpiarCelularEscrito("9876543210")).toBe("987654321");
    expect(limpiarCelularEscrito("")).toBe("");
  });
});

describe("ubicación en las notas del pedido", () => {
  it("se suma como último renglón de las notas; sin enlace las notas quedan igual", () => {
    expect(notasDelPedido(" Tocar el timbre ", ENLACE)).toBe(`Tocar el timbre\nMi ubicación: ${ENLACE}`);
    expect(notasDelPedido("", ENLACE)).toBe(`Mi ubicación: ${ENLACE}`);
    expect(notasDelPedido(" Tocar el timbre ", "")).toBe("Tocar el timbre");
    expect(notasDelPedido("Hola", "https://evil.example/?q=1,2")).toBe("Hola");
  });
  it("el pedido manda las notas con la ubicación, sin campos nuevos", () => {
    const state = {
      ...INITIAL_CHECKOUT_STATE,
      address: { ...INITIAL_CHECKOUT_STATE.address, notes: "Tocar el timbre", ubicacionEnVivo: ENLACE },
    };
    const effective = { name: "Ana", dni: "", phone: "987654321", location: "Jr. Ucayali 1", reference: "", payment: "efectivo" as const };
    const body = JSON.parse(
      buildOrderPayload({ state, effective, orderItems: [], totalPedido: 10, promo: null, discount: 0 }),
    ) as Record<string, unknown>;
    expect(body.notes).toBe(`Tocar el timbre\nMi ubicación: ${ENLACE}`);
    expect(Object.keys(body)).not.toContain("ubicacionEnVivo");
  });
  it("se lee de vuelta para la imagen; un enlace ajeno no es ubicación", () => {
    expect(ubicacionDeEnlace(ENLACE)).toMatchObject({ lat: -8.3791, lng: -74.5539, enlaceMapa: ENLACE, precision: 0 });
    expect(ubicacionDeEnlace("")).toBeNull();
    expect(ubicacionDeEnlace("por el mercado")).toBeNull();
  });
  it("el enlace se arma con 6 decimales, igual que el kit", () => {
    expect(enlaceMapa(-8.3791, -74.5539)).toBe(ENLACE);
  });
});

describe("POST /api/orders: renglón de ubicación falso", () => {
  it("quita «Mi ubicación:» que no sea Google Maps con coordenadas; el resto intacto", () => {
    expect(sanearNotasUbicacion(`Tocar el timbre\nMi ubicación: https://evil.example/?q=1,2`)).toBe("Tocar el timbre");
    expect(sanearNotasUbicacion("Mi ubicación: por el mercado")).toBeUndefined();
    expect(sanearNotasUbicacion(` Mi ubicación: https://maps.google.com/?q=1,2&x=y`)).toBeUndefined();
  });
  it("deja pasar el renglón legítimo y las notas sin ubicación", () => {
    const ok = `Tocar el timbre\nMi ubicación: ${ENLACE}`;
    expect(sanearNotasUbicacion(ok)).toBe(ok);
    expect(sanearNotasUbicacion("Dejar en portería")).toBe("Dejar en portería");
    expect(sanearNotasUbicacion(undefined)).toBeUndefined();
  });
});

const PEDIDO: PedidoConfirmado = {
  negocio: "Bodega San Martín",
  numero: "ord_123",
  items: [
    { name: "Arroz Costeño 5 kg", price: 20, quantity: 2, image: "/img/arroz.webp" },
    { name: "Aceite Primor 1 L", price: 10, quantity: 1, note: "el más grande" },
  ],
  // S/ 50 de subtotal; promo −5 y cupón −5 → el servidor cobró 40.
  total: 40,
  cliente: {
    nombre: " Ana Pérez ",
    celular: "987654321",
    direccion: "Jr. Ucayali 123",
    referencia: "frente al parque",
    pago: "yape",
    notas: "Tocar el timbre",
    ubicacion: ENLACE,
  },
};

describe("pedido confirmado para WhatsApp", () => {
  it("un solo descuento = subtotal − total del servidor (promo + cupón juntos)", () => {
    expect(descuentoTotal(PEDIDO)).toBe(10);
    expect(descuentoTotal({ items: PEDIDO.items, total: 50 })).toBe(0);
    expect(descuentoTotal({ items: [{ name: "x", price: 0.1, quantity: 3 }], total: 0.3 })).toBe(0);
  });
  it("el texto lleva el número de pedido, productos, total del servidor y los datos", () => {
    const t = textoPedidoWhatsapp(PEDIDO);
    expect(t).toContain("Hola Bodega San Martín, acabo de hacer el pedido #ord_123 en la tienda en línea:");
    expect(t).toContain("• Arroz Costeño 5 kg x2 — S/ 40.00");
    expect(t).toContain("  Nota: el más grande");
    expect(t).toContain("Descuentos: −S/ 10.00");
    expect(t).toContain("Total: S/ 40.00 (lo confirma el negocio)");
    expect(t).not.toContain("Descuento: −S/ 5.00");
    expect(t).toContain("Nombre: Ana Pérez");
    expect(t).toContain("Celular: 987 654 321");
    expect(t).toContain("Entrega: Jr. Ucayali 123 (frente al parque)");
    expect(t).toContain(`Ubicación: ${ENLACE}`);
    expect(t).toContain("Pago: Yape");
    expect(t).toContain("Notas: Tocar el timbre");
  });
  it("la imagen usa el total del servidor, el número de pedido y la ubicación", () => {
    const d = datosImagenCheckout(PEDIDO, { colorAcento: "rgb(0, 160, 160)", logo: null });
    expect(d.total).toBe(40);
    expect(d.lineas).toHaveLength(2);
    expect(d.lineas[0]).toMatchObject({ nombre: "Arroz Costeño 5 kg", cantidad: 2, precio: 20, imagen: "/img/arroz.webp" });
    expect(d.cliente).toMatchObject({ nombre: "Ana Pérez", celular: "987654321", pago: "Yape" });
    expect(d.cliente.ubicacion?.enlaceMapa).toBe(ENLACE);
    expect(d.notas).toEqual(["Pedido #ord_123", "Descuentos: −S/ 10.00", "Nota: Tocar el timbre"]);
  });
});

describe("Google y WhatsApp del negocio", () => {
  it("volver de Google reabre el checkout en la misma página", () => {
    expect(rutaParaVolverAlCheckout("http://localhost:3000/tienda?cat=bebidas#x")).toBe("/tienda?cat=bebidas&checkout=resume");
    expect(rutaParaVolverAlCheckout("https://musa.buleje.pe/t/musa/tienda")).toBe("/t/musa/tienda?checkout=resume");
  });
  it("el número sale de WhatsApp y si no, del teléfono; vacío = sin número", () => {
    expect(numeroWhatsappDe({ whatsapp: "+51 987 654 321" })).toBe("51987654321");
    expect(numeroWhatsappDe({ whatsapp: "", phone: "987-654-321" })).toBe("987654321");
    expect(numeroWhatsappDe({ whatsapp: "", phone: "" })).toBeNull();
    expect(numeroWhatsappDe(null)).toBeNull();
  });
});
