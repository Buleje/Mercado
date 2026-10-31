/**
 * Sesión verificada vs token de seguimiento (security 2026-10-08, Ley 29733).
 *
 * El token que firma un pedido de invitado lleva el teléfono que vino en el
 * CUERPO del pedido: no prueba nada. Antes valía como sesión y un invitado con
 * el teléfono de otro veía todos sus pedidos. Ahora `getCustomerPayload` lo
 * descarta (todos los lectores de la cookie lo ven como «sin sesión») y solo
 * `getSeguimientoPedidos` lo lee, con la lista de pedidos que abre.
 *
 * Firma HMAC real (AUTH_SECRET de vitest.setup.ts), sin mocks.
 */
import { describe, it, expect } from "vitest";
import {
  createCustomerToken,
  getCustomerPayload,
  getSeguimientoPedidos,
  tokenTrasPedido,
  esSesionVerificada,
  telefonoDeLaSesion,
  MAX_PEDIDOS_SEGUIMIENTO,
} from "@/lib/auth/customer-session";

const PEDIDO = { telefono: "987654321", nombre: "Ana", tenantId: "t1" };

describe("token de seguimiento", () => {
  it("no es sesión: getCustomerPayload lo rechaza; getSeguimientoPedidos da solo su pedido", async () => {
    const token = await tokenTrasPedido(undefined, { ...PEDIDO, pedidoId: "ord-1" });
    expect(token).toBeTruthy();
    expect(await getCustomerPayload(token!)).toBeNull();
    expect(await getSeguimientoPedidos(token!)).toEqual({
      telefono: "987654321",
      tenantId: "t1",
      pedidos: ["ord-1"],
    });
  });

  it("se acumula con el mismo teléfono y negocio; con otro teléfono empieza de cero", async () => {
    const t1 = await tokenTrasPedido(undefined, { ...PEDIDO, pedidoId: "ord-1" });
    const t2 = await tokenTrasPedido(t1!, { ...PEDIDO, pedidoId: "ord-2" });
    expect((await getSeguimientoPedidos(t2!))?.pedidos).toEqual(["ord-1", "ord-2"]);

    const otro = await tokenTrasPedido(t2!, { ...PEDIDO, telefono: "911222333", pedidoId: "ord-3" });
    expect(await getSeguimientoPedidos(otro!)).toMatchObject({ telefono: "911222333", pedidos: ["ord-3"] });

    const otroNegocio = await tokenTrasPedido(t2!, { ...PEDIDO, tenantId: "t2", pedidoId: "ord-4" });
    expect((await getSeguimientoPedidos(otroNegocio!))?.pedidos).toEqual(["ord-4"]);
  });

  it(`recuerda solo los ${MAX_PEDIDOS_SEGUIMIENTO} pedidos más nuevos`, async () => {
    let t: string | null | undefined;
    for (let i = 0; i < MAX_PEDIDOS_SEGUIMIENTO + 5; i++) {
      t = await tokenTrasPedido(t ?? undefined, { ...PEDIDO, pedidoId: `ord-${i}` });
    }
    const seg = await getSeguimientoPedidos(t!);
    expect(seg?.pedidos).toHaveLength(MAX_PEDIDOS_SEGUIMIENTO);
    expect(seg?.pedidos.at(-1)).toBe(`ord-${MAX_PEDIDOS_SEGUIMIENTO + 4}`);
  });

  it("con una sesión VERIFICADA no toca la cookie (no la rebaja ni cambia de persona)", async () => {
    const verificada = await createCustomerToken({
      customerId: "987654321",
      email: "ana@x.pe",
      name: "Ana",
      tenantId: "t1",
      provider: "phone",
    });
    expect(await tokenTrasPedido(verificada, { ...PEDIDO, pedidoId: "ord-9" })).toBeNull();
    expect(await getCustomerPayload(verificada)).toMatchObject({ customerId: "987654321" });
    expect(await getSeguimientoPedidos(verificada)).toBeNull();
  });

  it("un token de seguimiento viejo (06-05, sin lista) no abre ningún pedido ni sirve de sesión", async () => {
    const viejo = await createCustomerToken({
      customerId: "987654321",
      email: "987654321@phone.local",
      name: "Ana",
      tenantId: "t1",
      provider: "checkout",
    });
    expect(await getCustomerPayload(viejo)).toBeNull();
    expect((await getSeguimientoPedidos(viejo))?.pedidos).toEqual([]);
  });

  it("lista cerrada: un proveedor desconocido no es sesión verificada", async () => {
    expect(esSesionVerificada({ provider: "phone" })).toBe(true);
    expect(esSesionVerificada({ provider: "google" })).toBe(true);
    expect(esSesionVerificada({ provider: "checkout" })).toBe(false);
    expect(esSesionVerificada({ provider: "email" })).toBe(false);
    const raro = await createCustomerToken({
      customerId: "987654321",
      email: "a@b.c",
      name: "x",
      tenantId: "t1",
      provider: "email",
    });
    expect(await getCustomerPayload(raro)).toBeNull();
  });
});

describe("teléfono que la sesión PRUEBA (security 2026-10-08)", () => {
  const base = { email: "x@y.pe", name: "Ana", tenantId: "t1" };

  it("solo el código (phone) prueba el teléfono; Google/Facebook no", () => {
    expect(telefonoDeLaSesion({ customerId: "987654321", provider: "phone" })).toBe("987654321");
    expect(telefonoDeLaSesion({ customerId: "987654321", provider: "google" })).toBeNull();
    expect(telefonoDeLaSesion({ customerId: "987654321", provider: "facebook" })).toBeNull();
    expect(telefonoDeLaSesion({ customerId: "987654321", provider: "checkout" })).toBeNull();
    expect(telefonoDeLaSesion(null)).toBeNull();
  });

  it("customerId de 9 dígitos EXACTOS: un id de Google nunca se vuelve teléfono", () => {
    // normalizePhone("google_1177…987654321") daba 987654321.
    expect(telefonoDeLaSesion({ customerId: "google_117712345987654321", provider: "phone" })).toBeNull();
    expect(telefonoDeLaSesion({ customerId: "51987654321", provider: "phone" })).toBeNull();
    expect(telefonoDeLaSesion({ customerId: "98765432", provider: "phone" })).toBeNull();
  });

  it("`e2e` prueba el teléfono fuera de producción y nunca en producción", () => {
    const antes = process.env.VERCEL_ENV;
    try {
      delete process.env.VERCEL_ENV;
      expect(telefonoDeLaSesion({ customerId: "987654321", provider: "e2e" })).toBe("987654321");
      process.env.VERCEL_ENV = "production";
      expect(telefonoDeLaSesion({ customerId: "987654321", provider: "e2e" })).toBeNull();
    } finally {
      if (antes === undefined) delete process.env.VERCEL_ENV;
      else process.env.VERCEL_ENV = antes;
    }
  });

  it("token de Google con la ficha de un teléfono (vínculo por correo de antes) ya no es sesión", async () => {
    const legado = await createCustomerToken({ ...base, customerId: "987654321", provider: "google" });
    expect(await getCustomerPayload(legado)).toBeNull();
    const propio = await createCustomerToken({ ...base, customerId: "google_1177", provider: "google" });
    expect((await getCustomerPayload(propio))?.customerId).toBe("google_1177");
    const fb = await createCustomerToken({ ...base, customerId: "987654321", provider: "facebook" });
    expect(await getCustomerPayload(fb)).toBeNull();
  });
});
