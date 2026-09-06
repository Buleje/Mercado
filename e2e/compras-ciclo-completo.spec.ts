/**
 * compras-ciclo-completo.spec.ts
 *
 * E2E del corazón de Compras: **crear orden → recepcionar → cuenta por pagar**.
 *
 * Por qué existe: el reporte de QA de 2026-08-12 no pudo probar esta cadena
 * (el tenant tenía la prueba vencida y la creación de OC devolvía 402), así que
 * el flujo más importante del módulo quedó sin verificar. Verificarlo a mano
 * cuesta caro: hay que sembrar producto, orden y recepción, y después limpiar
 * a mano lo que tocó stock.
 *
 * Qué afirma, más allá de "no explota":
 *   - el stock sube EXACTAMENTE lo recibido (regresión del doble descuento que
 *     ya mordió en ventas y ajustes),
 *   - el costo del producto queda en el costo real de la compra,
 *   - la orden pasa a "recibido",
 *   - se genera la cuenta por pagar por el total de la orden.
 *
 * Siembra lo suyo y lo borra: producto, orden y cuenta por pagar por API; la
 * recepción por SQL, porque `/api/compras/recepciones` no expone DELETE (borrar
 * una recepción debería revertir stock, y esa decisión no la toma un test).
 *
 * Como correr:
 *   npx playwright test e2e/compras-ciclo-completo.spec.ts
 */

import { test, expect, type APIRequestContext } from "@playwright/test";

const ADMIN_USER = "qaadmin";
const ADMIN_PASS = "Qa-admin-1234";
const TENANT = "main";

const CANTIDAD = 10;
const COSTO_UNITARIO = 60;
const TOTAL_ESPERADO = CANTIDAD * COSTO_UNITARIO;

/** Marca única de la corrida: si algo sobrevive, se sabe de dónde salió. */
const MARCA = `E2E-CICLO-${Date.now()}`;

/**
 * UN solo contexto para todo el describe. El fixture `request` de Playwright es
 * por-test: cada test arrancaba con un cookie jar vacío y el middleware cortaba
 * en CSRF (403) antes siquiera de mirar la sesión, lo que parecía un problema
 * de token y era de aislamiento entre tests.
 */
let api: APIRequestContext;
let proveedorId: string | null = null;
let productoId: number | null = null;
let ordenId: string | null = null;
let csrf = "";

/**
 * El token CSRF se lee ANTES de cada mutación, no una sola vez: la cookie rota
 * junto con la sesión, y un token cacheado en `beforeAll` hace que la segunda
 * escritura del test se coma un 403 que no tiene nada que ver con lo que prueba.
 */
async function headers(ctx: APIRequestContext) {
  const { cookies } = await ctx.storageState();
  csrf = cookies.find((c) => c.name === "csrf-token")?.value ?? csrf;
  return { "Content-Type": "application/json", "x-csrf-token": csrf };
}

/** Devuelve el producto sembrado tal como lo ve el panel (stock y costo reales). */
async function leerProducto() {
  const res = await api.get("/api/products");
  const body = await res.json();
  const lista = Array.isArray(body) ? body : (body.products ?? []);
  return lista.find((p: { id: number }) => p.id === productoId) ?? null;
}

test.describe.serial("Compras — ciclo orden → recepción → cuenta por pagar", () => {
  test.beforeAll(async ({ playwright, baseURL }) => {
    api = await playwright.request.newContext({ baseURL });
    // `tenantSlug` es obligatorio: qaadmin existe en varias tiendas y sin él el
    // login devuelve el selector de tienda, no la cookie de sesión.
    const login = await api.post("/api/auth/login", {
      data: { username: ADMIN_USER, password: ADMIN_PASS, tenantSlug: TENANT },
      headers: { "x-tenant-id": TENANT },
    });
    test.skip(!login.ok(), "Skip: no hay admin qaadmin disponible (entorno sin seeds)");

    // Proveedor propio: la cuenta por pagar referencia al proveedor, así que un
    // `supplierId` vacío rompe la creación de la orden con un 500.
    const prov = await api.post("/api/suppliers", {
      headers: await headers(api),
      data: { name: `${MARCA} proveedor`, phone: "999000111", category: "e2e" },
    });
    test.skip(!prov.ok(), `Skip: no se pudo sembrar el proveedor (${prov.status()})`);
    proveedorId = (await prov.json()).id;

    const res = await api.post("/api/products", {
      headers: await headers(api),
      data: {
        name: `${MARCA} producto`,
        category: "e2e",
        price: 100,
        costPrice: COSTO_UNITARIO,
        stock: 0,
        unit: "und",
        active: true,
      },
    });
    test.skip(!res.ok(), `Skip: no se pudo sembrar el producto (${res.status()})`);
    productoId = (await res.json()).id;
  });

  test("crear la orden de compra la deja pendiente y con el total correcto", async () => {
    const res = await api.post("/api/purchases", {
      headers: await headers(api),
      data: {
        supplierId: proveedorId,
        supplierName: `${MARCA} proveedor`,
        items: [{
          productId: productoId,
          name: `${MARCA} producto`,
          quantity: CANTIDAD,
          unitCost: COSTO_UNITARIO,
          unit: "und",
        }],
        notes: MARCA,
        paymentMethod: "credito_30",
        idempotencyKey: MARCA,
      },
    });

    // El cuerpo va en el mensaje: un 402 (plan), un 403 (CSRF) y un 400
    // (payload) se ven igual en el status y distinto en la causa.
    expect(res.status(), `POST /api/purchases → ${await res.text()}`).toBe(201);
    const oc = await res.json();
    ordenId = String(oc.id);
    expect(Number(oc.total)).toBe(TOTAL_ESPERADO);
    expect(oc.status).toBe("pendiente");
  });

  test("recepcionar sube el stock exactamente lo recibido y fija el costo", async () => {
    const antes = await leerProducto();
    expect(antes?.stock ?? 0).toBe(0);

    const res = await api.post("/api/compras/recepciones", {
      headers: await headers(api),
      data: {
        orderRef: ordenId,
        supplier: `${MARCA} proveedor`,
        inspector: ADMIN_USER,
        status: "aceptada",
        items: [{
          product: `${MARCA} producto`,
          productId: productoId,
          expectedQty: CANTIDAD,
          receivedQty: CANTIDAD,
          condition: "ok",
          notes: MARCA,
        }],
      },
    });

    expect(res.status()).toBe(201);
    const recepcion = await res.json();
    expect(recepcion.status).toBe("aceptada");
    // El endpoint informa cuántos productos movió. Separarlo de la lectura
    // posterior distingue "no movió stock" de "lo movió y lo estoy leyendo de
    // un cache viejo" — dos bugs con el mismo síntoma.
    expect(recepcion.stockUpdated, "la recepción debe mover el stock de 1 producto").toBe(1);

    // El corazón del test: 10 recibidas son 10, no 20. El doble movimiento de
    // stock ya se coló antes en ventas y en ajustes de inventario.
    //
    // Se consulta con `poll` porque `ProductsDB.getAll` cachea 5 minutos: la
    // recepción invalida el tag, pero la lectura inmediata puede alcanzar la
    // entrada stale. Lo que se afirma es que el panel converge —y que converge
    // en 10, nunca en 20—, no que el cache sea instantáneo.
    await expect
      .poll(async () => (await leerProducto())?.stock, {
        timeout: 15_000,
        message: "el stock del panel debe reflejar lo recibido, una sola vez",
      })
      .toBe(CANTIDAD);

    expect(Number((await leerProducto())?.costPrice)).toBe(COSTO_UNITARIO);
  });

  test("la orden queda recibida y aparece la cuenta por pagar", async () => {
    const ocs = await (await api.get("/api/purchases")).json();
    const oc = (Array.isArray(ocs) ? ocs : []).find((o: { id: string }) => String(o.id) === ordenId);
    expect(oc?.status, "recepcionar completo cierra la orden").toBe("recibido");

    // Se busca por `purchaseOrderId`, no por el nombre del proveedor: el nombre
    // es texto libre y ata el test a residuos de corridas anteriores; el id de
    // la orden es la relación real entre la compra y la deuda.
    //
    // Con `poll` por lo mismo que el stock: `PayablesDB.getAll` cachea 30s.
    const leerCuentas = async () => {
      const body = await (await api.get("/api/payables")).json();
      return Array.isArray(body) ? body : (body.payables ?? body.items ?? []);
    };
    await expect
      .poll(async () => (await leerCuentas()).some((p: { purchaseOrderId?: string }) => p.purchaseOrderId === ordenId), {
        timeout: 15_000,
        message: `la compra a crédito debe dejar la deuda de la OC ${ordenId}`,
      })
      .toBe(true);

    const cuentas = await leerCuentas();
    const cuenta = cuentas.find((p: { purchaseOrderId?: string }) => p.purchaseOrderId === ordenId);

    expect(
      cuenta,
      `la compra a crédito debe dejar la deuda de la OC ${ordenId}. Recibí ${cuentas.length} cuentas: ` +
        JSON.stringify(cuentas.slice(0, 5).map((p: { purchaseOrderId?: string; amount?: unknown }) =>
          ({ oc: p.purchaseOrderId, monto: p.amount }))),
    ).toBeTruthy();
    expect(Number(cuenta.amount)).toBe(TOTAL_ESPERADO);
    expect(cuenta.status).toBe("pendiente");
  });

  test.afterAll(async () => {
    await api.dispose().catch(() => { /* ya cumplió su función: si falla al cerrarse, da igual */ });

    // Limpieza por SQL y en orden de dependencia. Se intentó por API y no
    // alcanza: `DELETE /api/products/[id]` choca contra las FK de los
    // movimientos de inventario que la propia recepción creó, y la recepción no
    // expone DELETE a propósito (borrarla debería revertir stock). El barrido va
    // por patrón `E2E-CICLO%`, así que también levanta lo que dejaron corridas
    // que murieron a mitad de camino.
    // playwright.config.ts no carga dotenv: sin esto `DATABASE_URL` viene
    // undefined, la limpieza se saltea en silencio y cada corrida deja producto
    // + recepción tirados (medido: 19 productos y 14 recepciones en una tarde).
    if (!process.env.DATABASE_URL) {
      const { config } = await import("dotenv");
      config({ path: ".env.local" });
    }
    if (!process.env.DATABASE_URL) {
      console.warn("[e2e] sin DATABASE_URL: queda sedimento con marca E2E-CICLO");
      return;
    }
    const { default: pg } = await import("pg");
    const cliente = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      await cliente.connect();
      await cliente.query(`DELETE FROM "Payable" WHERE "supplierName" LIKE 'E2E-CICLO%'`);
      await cliente.query(`DELETE FROM "GoodsReceipt" WHERE "supplierName" LIKE 'E2E-CICLO%'`);
      await cliente.query(`DELETE FROM "InventoryMovement" WHERE "productId" IN
        (SELECT id FROM "Product" WHERE name LIKE 'E2E-CICLO%')`);
      await cliente.query(`DELETE FROM "PurchaseItem" WHERE "purchaseOrderId" IN
        (SELECT id FROM "PurchaseOrder" WHERE "supplierName" LIKE 'E2E-CICLO%')`);
      await cliente.query(`DELETE FROM "PurchaseOrder" WHERE "supplierName" LIKE 'E2E-CICLO%'`);
      await cliente.query(`DELETE FROM "Product" WHERE name LIKE 'E2E-CICLO%'`);
      await cliente.query(`DELETE FROM "Supplier" WHERE name LIKE 'E2E-CICLO%'`);
    } catch (err) {
      console.warn(`[e2e] limpieza incompleta (marca ${MARCA}):`, String(err));
    } finally {
      await cliente.end().catch(() => { /* best-effort: el proceso del test termina igual */ });
    }
  });
});
