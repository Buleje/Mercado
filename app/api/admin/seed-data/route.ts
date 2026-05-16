import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/require-admin";
import { prisma } from "@/lib/prisma";
import { toNumOrZero } from "@/lib/decimal-utils";
import { logger } from "@/lib/logger";
import { applyRateLimit } from "@/lib/rate-limit";
import { assertCsrf } from "@/lib/auth/csrf";

// Brandon 2026-05-16 (audit Info): force-dynamic obligatorio — endpoint
// destructivo (borra todo y reseeda) con cookies + CSRF + STRICT rate
// limit + step-up confirm. NO debe cachearse jamás.

/**
 * POST /api/admin/seed-data
 * Seeds realistic simulated data for a Peruvian bodega in Pucallpa.
 * Admin-only. Clears existing data first, then inserts seed data.
 *
 * Brandon 2026-05-16 (audit P2 step-up auth): requiere body con
 * `{ confirm: "SEED" }` para ejecutar — el patrón es similar a clear-data
 * que pide `confirmUsername === auth.username`. Sin esto un click
 * accidental o un fetch malicioso desde otra tab autenticada (CSRF ya
 * cubre pero defensa-en-profundidad) podía borrar todos los datos del
 * tenant. STRICT rate limit (10 req/15min) reduce ventana de abuso.
 */
export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "admin-seed-data"); if (_rl) return _rl;
  const csrfFail = assertCsrf(req);
  if (csrfFail) return csrfFail;
  const auth = await requireAdmin(req, ["admin"]);
  if (auth instanceof NextResponse) return auth;

  // Step-up auth: requiere body con confirm="SEED" para evitar trigger
  // accidental (botón Seed se vuelve doble-confirmación deliberada).
  const body = await req.json().catch(() => ({}));
  if ((body as { confirm?: string })?.confirm !== "SEED") {
    return NextResponse.json(
      { error: "Confirmación requerida. Envía { confirm: \"SEED\" } en el body." },
      { status: 400 },
    );
  }

  function rid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }
  function pick<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
  function rand(min: number, max: number) {
    return Math.round((Math.random() * (max - min) + min) * 100) / 100;
  }
  function randInt(min: number, max: number) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    d.setHours(randInt(7, 22), randInt(0, 59), 0, 0);
    return d;
  }

  // SECURITY: tenantId debe extraerse ANTES de los deleteMany para aislamiento.
  // Sin where:{tenantId}, deleteMany borra datos de TODOS los tenants (P0 #7).
  const tenantId = auth.tenantId;

  /* eslint-disable no-restricted-syntax -- Modelos indirectos (ADR-101): pageVersion/pageBlock/bundleItem/shoppingListItem/returnItem/saleItem/orderItem/etc usan FK al padre tenant-scoped. El where: { padre: { tenantId } } es correcto y safe; la AST rule no detecta nesting. */
  try {
    // ── Clear all data for THIS tenant only ───────────
    await prisma.aBTestEvent.deleteMany({ where: { tenantId } });
    await prisma.aBTest.deleteMany({ where: { tenantId } });
    await prisma.surveyResponse.deleteMany({ where: { tenantId } });
    await prisma.pageVersion.deleteMany({ where: { page: { tenantId } } });
    await prisma.pageBlock.deleteMany({ where: { page: { tenantId } } });
    await prisma.page.deleteMany({ where: { tenantId } });
    await prisma.blockTemplate.deleteMany({ where: { tenantId } });
    await prisma.media.deleteMany({ where: { tenantId } });
    await prisma.themeSettings.deleteMany({ where: { tenantId } });
    await prisma.navigation.deleteMany({ where: { tenantId } });
    await prisma.chatMessage.deleteMany({ where: { tenantId } });
    await prisma.notificationLog.deleteMany({ where: { tenantId } });
    await prisma.customerNotification.deleteMany({ where: { tenantId } });
    await prisma.pushSubscription.deleteMany({ where: { tenantId } });
    await prisma.activityLog.deleteMany({ where: { tenantId } });
    await prisma.bundleItem.deleteMany({ where: { bundle: { tenantId } } });
    await prisma.bundle.deleteMany({ where: { tenantId } });
    await prisma.expense.deleteMany({ where: { tenantId } });
    await prisma.supplierEvaluation.deleteMany({ where: { tenantId } });
    await prisma.adminMessage.deleteMany({ where: { tenantId } });
    await prisma.deliverySlot.deleteMany({ where: { tenantId } });
    await prisma.priceHistory.deleteMany({ where: { tenantId } });
    await prisma.shoppingListItem.deleteMany({ where: { shoppingList: { tenantId } } });
    await prisma.shoppingList.deleteMany({ where: { tenantId } });
    await prisma.returnItem.deleteMany({ where: { returnRecord: { tenantId } } });
    await prisma.return.deleteMany({ where: { tenantId } });
    await prisma.coupon.deleteMany({ where: { tenantId } });
    await prisma.inventoryMovement.deleteMany({ where: { tenantId } });
    await prisma.cashMovement.deleteMany({ where: { cashRegister: { tenantId } } });
    await prisma.cashRegister.deleteMany({ where: { tenantId } });
    await prisma.payment.deleteMany({ where: { payable: { tenantId } } });
    await prisma.payable.deleteMany({ where: { tenantId } });
    await prisma.promotion.deleteMany({ where: { tenantId } });
    await prisma.saleItem.deleteMany({ where: { sale: { tenantId } } });
    await prisma.sale.deleteMany({ where: { tenantId } });
    await prisma.purchaseItem.deleteMany({ where: { purchaseOrder: { tenantId } } });
    await prisma.purchaseOrder.deleteMany({ where: { tenantId } });
    await prisma.supplier.deleteMany({ where: { tenantId } });
    await prisma.review.deleteMany({ where: { tenantId } });
    await prisma.orderItem.deleteMany({ where: { order: { tenantId } } });
    await prisma.order.deleteMany({ where: { tenantId } });
    await prisma.savedCart.deleteMany({ where: { tenantId } });
    await prisma.savedLocation.deleteMany({ where: { customer: { tenantId } } });
    await prisma.customer.deleteMany({ where: { tenantId } });
    await prisma.product.deleteMany({ where: { tenantId } });

    // ── Products ────────────────────────────────────────
    const productData = [
      { name: "Arroz Costeño 5kg", category: "Abarrotes", price: 22.50, costPrice: 18.00, unit: "bolsa", stock: 45, stockMin: 10, stockMax: 80 },
      { name: "Azúcar Rubia 1kg", category: "Abarrotes", price: 4.50, costPrice: 3.50, unit: "bolsa", stock: 60, stockMin: 15, stockMax: 100 },
      { name: "Aceite Primor 1L", category: "Abarrotes", price: 9.90, costPrice: 7.80, unit: "botella", stock: 30, stockMin: 8, stockMax: 50 },
      { name: "Fideos Don Vittorio Spaghetti", category: "Abarrotes", price: 3.80, costPrice: 2.90, unit: "paquete", stock: 50, stockMin: 12, stockMax: 80 },
      { name: "Leche Gloria Entera 400g", category: "Lácteos", price: 4.20, costPrice: 3.30, unit: "lata", stock: 80, stockMin: 20, stockMax: 120 },
      { name: "Atún Florida 170g", category: "Conservas", price: 5.50, costPrice: 4.20, unit: "lata", stock: 35, stockMin: 10, stockMax: 60 },
      { name: "Coca-Cola 1.5L", category: "Bebidas", price: 7.50, costPrice: 5.80, unit: "botella", stock: 40, stockMin: 10, stockMax: 60 },
      { name: "Inca Kola 1.5L", category: "Bebidas", price: 7.50, costPrice: 5.80, unit: "botella", stock: 38, stockMin: 10, stockMax: 60 },
      { name: "Agua San Luis 2.5L", category: "Bebidas", price: 3.50, costPrice: 2.50, unit: "botella", stock: 50, stockMin: 15, stockMax: 80 },
      { name: "Cerveza Pilsen 630ml", category: "Bebidas", price: 6.50, costPrice: 4.80, unit: "botella", stock: 48, stockMin: 12, stockMax: 72 },
      { name: "Pan de Molde Bimbo", category: "Panadería", price: 7.90, costPrice: 6.00, unit: "paquete", stock: 15, stockMin: 5, stockMax: 30 },
      { name: "Jabón Bolívar 200g", category: "Limpieza", price: 2.80, costPrice: 2.00, unit: "barra", stock: 40, stockMin: 10, stockMax: 60 },
      { name: "Papel Higiénico Elite x4", category: "Limpieza", price: 6.90, costPrice: 5.20, unit: "paquete", stock: 25, stockMin: 8, stockMax: 40 },
      { name: "Sal Emsal 1kg", category: "Abarrotes", price: 1.50, costPrice: 1.00, unit: "bolsa", stock: 55, stockMin: 15, stockMax: 80 },
      { name: "Café Altomayo 85g", category: "Abarrotes", price: 8.50, costPrice: 6.50, unit: "frasco", stock: 20, stockMin: 5, stockMax: 35 },
      { name: "Huevos x15", category: "Lácteos", price: 9.50, costPrice: 7.50, unit: "paquete", stock: 25, stockMin: 8, stockMax: 40 },
      { name: "Detergente Ariel 900g", category: "Limpieza", price: 12.50, costPrice: 9.80, unit: "bolsa", stock: 18, stockMin: 5, stockMax: 30 },
      { name: "Gaseosa Kola Real 3L", category: "Bebidas", price: 5.00, costPrice: 3.50, unit: "botella", stock: 30, stockMin: 8, stockMax: 50 },
      { name: "Galleta Soda Field", category: "Snacks", price: 2.00, costPrice: 1.40, unit: "paquete", stock: 60, stockMin: 15, stockMax: 90 },
      { name: "Yogurt Gloria Fresa 1L", category: "Lácteos", price: 7.80, costPrice: 5.90, unit: "botella", stock: 20, stockMin: 5, stockMax: 35 },
      { name: "Lentejas 500g", category: "Abarrotes", price: 4.00, costPrice: 3.00, unit: "bolsa", stock: 35, stockMin: 10, stockMax: 50 },
      { name: "Frejoles Negros 500g", category: "Abarrotes", price: 5.00, costPrice: 3.80, unit: "bolsa", stock: 30, stockMin: 8, stockMax: 45 },
      { name: "Quaker Avena 600g", category: "Abarrotes", price: 6.50, costPrice: 4.80, unit: "bolsa", stock: 22, stockMin: 6, stockMax: 35 },
      { name: "Chocolate Sol del Cusco", category: "Abarrotes", price: 3.50, costPrice: 2.50, unit: "tableta", stock: 40, stockMin: 10, stockMax: 60 },
      { name: "Lejía Clorox 1L", category: "Limpieza", price: 5.50, costPrice: 4.00, unit: "botella", stock: 20, stockMin: 6, stockMax: 35 },
      { name: "Vinagre Venturo 500ml", category: "Abarrotes", price: 3.00, costPrice: 2.00, unit: "botella", stock: 28, stockMin: 8, stockMax: 40 },
      { name: "Mentholatum Ointment", category: "Farmacia", price: 8.00, costPrice: 5.50, unit: "unidad", stock: 15, stockMin: 4, stockMax: 25 },
      { name: "Pilas Duracell AA x2", category: "Varios", price: 6.00, costPrice: 4.00, unit: "paquete", stock: 20, stockMin: 5, stockMax: 30 },
      { name: "Frugo Néctar 1L", category: "Bebidas", price: 4.50, costPrice: 3.20, unit: "caja", stock: 32, stockMin: 8, stockMax: 50 },
      { name: "Mantequilla Laive 200g", category: "Lácteos", price: 6.80, costPrice: 5.00, unit: "barra", stock: 14, stockMin: 4, stockMax: 25 },
      // ── Frutas y verduras ──
      { name: "Tomates Frescos 1kg", category: "Frutas y Verduras", price: 3.50, costPrice: 2.00, unit: "kg", stock: 30, stockMin: 5, stockMax: 40 },
      { name: "Cebollas Rojas 1kg", category: "Frutas y Verduras", price: 3.00, costPrice: 1.80, unit: "kg", stock: 25, stockMin: 5, stockMax: 35 },
      { name: "Papas Nativas 1kg", category: "Frutas y Verduras", price: 4.00, costPrice: 2.50, unit: "kg", stock: 30, stockMin: 5, stockMax: 40 },
      { name: "Plátanos de Seda 1kg", category: "Frutas y Verduras", price: 2.50, costPrice: 1.50, unit: "kg", stock: 20, stockMin: 5, stockMax: 30 },
      { name: "Palta Hass", category: "Frutas y Verduras", price: 5.00, costPrice: 3.50, unit: "unidad", stock: 15, stockMin: 3, stockMax: 25 },
      { name: "Zanahoria 1kg", category: "Frutas y Verduras", price: 2.50, costPrice: 1.50, unit: "kg", stock: 20, stockMin: 5, stockMax: 30 },
      { name: "Limones 1kg", category: "Frutas y Verduras", price: 5.00, costPrice: 3.00, unit: "kg", stock: 30, stockMin: 5, stockMax: 40 },
      // ── Carnes ──
      { name: "Pollo Entero", category: "Carnes", price: 12.00, costPrice: 9.00, unit: "kg", stock: 8, stockMin: 3, stockMax: 15 },
      { name: "Carne de Res 1kg", category: "Carnes", price: 28.00, costPrice: 22.00, unit: "kg", stock: 5, stockMin: 2, stockMax: 10 },
      // ── Más abarrotes ──
      { name: "Arroz Extra 1kg", category: "Abarrotes", price: 5.50, costPrice: 4.20, unit: "bolsa", stock: 80, stockMin: 15, stockMax: 120 },
      { name: "Avena 3 Ositos 500g", category: "Abarrotes", price: 4.50, costPrice: 3.20, unit: "bolsa", stock: 25, stockMin: 5, stockMax: 40 },
      { name: "Sillao Kikko 500ml", category: "Abarrotes", price: 4.50, costPrice: 3.00, unit: "botella", stock: 15, stockMin: 3, stockMax: 25 },
      { name: "Huevos x30", category: "Abarrotes", price: 15.00, costPrice: 11.00, unit: "bandeja", stock: 10, stockMin: 3, stockMax: 20 },
      { name: "Pan Integral 500g", category: "Panadería", price: 5.00, costPrice: 3.50, unit: "paquete", stock: 15, stockMin: 3, stockMax: 25 },
      { name: "Café Instantáneo Nescafé 200g", category: "Abarrotes", price: 12.00, costPrice: 9.00, unit: "frasco", stock: 10, stockMin: 3, stockMax: 20 },
      // ── Más bebidas ──
      { name: "Chicha Morada Naturale 1L", category: "Bebidas", price: 5.00, costPrice: 3.50, unit: "botella", stock: 20, stockMin: 5, stockMax: 35 },
      { name: "Cerveza Cusqueña 620ml", category: "Bebidas", price: 7.50, costPrice: 5.50, unit: "botella", stock: 36, stockMin: 8, stockMax: 60 },
      // ── Más limpieza ──
      { name: "Detergente Bolívar 2kg", category: "Limpieza", price: 15.00, costPrice: 11.00, unit: "bolsa", stock: 20, stockMin: 5, stockMax: 35 },
      { name: "Lavavajillas Ayudín 500ml", category: "Limpieza", price: 5.50, costPrice: 3.80, unit: "botella", stock: 15, stockMin: 3, stockMax: 25 },
      // ── Más snacks ──
      { name: "Galletas Oreo 6pk", category: "Snacks", price: 4.50, costPrice: 3.20, unit: "paquete", stock: 25, stockMin: 5, stockMax: 40 },
      { name: "Chocolate Sublime", category: "Snacks", price: 2.50, costPrice: 1.80, unit: "unidad", stock: 30, stockMin: 8, stockMax: 50 },
      // ── Cuidado personal ──
      { name: "Shampoo Head & Shoulders 375ml", category: "Cuidado Personal", price: 16.50, costPrice: 12.00, unit: "botella", stock: 10, stockMin: 3, stockMax: 20 },
      { name: "Pasta Dental Colgate 75ml", category: "Cuidado Personal", price: 4.50, costPrice: 3.00, unit: "tubo", stock: 18, stockMin: 5, stockMax: 30 },
      { name: "Jabón Camay 120g", category: "Cuidado Personal", price: 2.50, costPrice: 1.60, unit: "barra", stock: 25, stockMin: 5, stockMax: 40 },
      // ── Condimentos ──
      { name: "Ajinomoto 100g", category: "Abarrotes", price: 2.50, costPrice: 1.70, unit: "bolsa", stock: 35, stockMin: 8, stockMax: 50 },
      { name: "Ají Panca Molido 80g", category: "Abarrotes", price: 3.00, costPrice: 2.00, unit: "sobre", stock: 20, stockMin: 5, stockMax: 30 },
      { name: "Comino Molido 50g", category: "Abarrotes", price: 2.00, costPrice: 1.20, unit: "sobre", stock: 25, stockMin: 5, stockMax: 35 },
    ];

    // TD-018: Prisma devuelve price/costPrice como Decimal — convertir a number
    // para que el resto del seed pueda hacer aritmética sin TS errors.
    const productsRaw = await Promise.all(
      productData.map((p) =>
        prisma.product.create({
          data: { ...p, tenantId, image: "", active: true, barcode: `7750${randInt(100000, 999999)}` },
        })
      )
    );
    const products = productsRaw.map((p) => ({
      ...p,
      price: toNumOrZero(p.price),
      costPrice: toNumOrZero(p.costPrice),
    }));

    // ── Customers ───────────────────────────────────────
    const customerData = [
      { phone: "961234567", name: "María López", location: "Jr. Ucayali 345, Callería", reference: "Frente al mercado central" },
      { phone: "962345678", name: "Carlos Ríos", location: "Av. Centenario 123, Pucallpa", reference: "Al lado de la farmacia" },
      { phone: "963456789", name: "Rosa Huamán", location: "Jr. Tarapacá 456, Callería", reference: "Casa esquina azul" },
      { phone: "964567890", name: "Hugo Pérez", location: "Av. Yarinacocha km 3", reference: "Frente al grifo" },
      { phone: "965678901", name: "Luisa García", location: "Jr. Inmaculada 789, Pucallpa", reference: "2do piso, puerta marrón" },
      { phone: "966789012", name: "Pedro Sánchez", location: "Jr. 7 de Junio 234, Callería", reference: "A media cuadra del parque" },
      { phone: "967890123", name: "Ana Torres", location: "Av. Sáenz Peña 567, Pucallpa", reference: "Al costado de la panadería" },
      { phone: "968901234", name: "Miguel Vargas", location: "Jr. Progreso 890, Manantay", reference: "Casa con portón verde" },
      { phone: "969012345", name: "Carmen Flores", location: "Av. Centenario 456, Pucallpa", reference: "Edificio rojo 3er piso" },
      { phone: "960123456", name: "Roberto Chávez", location: "Jr. Bolognesi 321, Callería", reference: "Cerca del colegio" },
      { phone: "971234567", name: "Elena Quispe", location: "Av. Yarinacocha km 5", reference: "Casa blanca con jardín" },
      { phone: "972345678", name: "Diego Ramírez", location: "Jr. Huáscar 654, Pucallpa", reference: "Frente a la bodega Don Juan" },
    ];

    const tiers = ["bronce", "plata", "oro", "platino"];
    const customers = await Promise.all(
      customerData.map((c) =>
        prisma.customer.create({
          data: {
            ...c,
            tenantId,
            loyaltyPoints: randInt(0, 500),
            loyaltyTier: pick(tiers),
            totalSpent: rand(50, 3000),
          },
        })
      )
    );

    // ── Suppliers ───────────────────────────────────────
    const supplierData = [
      { id: rid(), name: "Distribuidora Los Andes", ruc: "20123456789", phone: "961111111", email: "losandes@email.com", address: "Av. Industrial 100, Lima" },
      { id: rid(), name: "Abarrotes El Mayorista", ruc: "20234567890", phone: "962222222", email: "elmayorista@email.com", address: "Jr. Comercio 200, Pucallpa" },
      { id: rid(), name: "Bebidas del Oriente SAC", ruc: "20345678901", phone: "963333333", email: "bebidasoriente@email.com", address: "Av. Centenario km 2" },
      { id: rid(), name: "Productos Gloria Regional", ruc: "20456789012", phone: "964444444", email: "gloriaregional@email.com", address: "Zona Industrial, Lima" },
      { id: rid(), name: "Limpieza Total EIRL", ruc: "20567890123", phone: "965555555", email: "limpiezatotal@email.com", address: "Jr. San Martín 500, Pucallpa" },
    ];

    const suppliers = await Promise.all(
      supplierData.map((s) => prisma.supplier.create({ data: { ...s, tenantId } }))
    );

    // ── Orders (last 30 days) ───────────────────────────
    const _statuses = ["pendiente", "confirmado", "en_camino", "entregado", "cancelado"] as const;
    const payMethods = ["efectivo", "yape", "plin"];

    const orders = [];
    for (let i = 0; i < 40; i++) {
      const customer = pick(customers);
      const numItems = randInt(1, 5);
      const items = [];
      const usedProducts = new Set<number>();
      for (let j = 0; j < numItems; j++) {
        let prod = pick(products);
        while (usedProducts.has(prod.id)) prod = pick(products);
        usedProducts.add(prod.id);
        const qty = randInt(1, 4);
        items.push({
          productId: prod.id,
          name: prod.name,
          price: prod.price,
          costPrice: prod.costPrice,
          quantity: qty,
          unit: prod.unit,
          image: "",
        });
      }
      const total = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const totalCogs = items.reduce((s, it) => s + (it.costPrice || 0) * it.quantity, 0);
      const dAgo = randInt(0, 30);
      // Newer orders more likely pending, older ones more likely delivered
      const status = dAgo < 2 ? pick(["pendiente", "confirmado"] as const) : dAgo < 7 ? pick(["confirmado", "en_camino", "entregado"] as const) : pick(["entregado", "entregado", "entregado", "cancelado"] as const);

      const order = await prisma.order.create({
        data: {
          id: `ORD-${rid()}`,
          tenantId,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerLocation: customer.location,
          customerReference: customer.reference,
          total: Math.round(total * 100) / 100,
          totalCogs: Math.round(totalCogs * 100) / 100,
          status,
          paymentMethod: pick(payMethods),
          notes: Math.random() > 0.7 ? pick(["Dejar en portería", "Llamar al llegar", "Sin cebolla por favor", ""]) : null,
          createdAt: daysAgo(dAgo),
          updatedAt: daysAgo(Math.max(0, dAgo - 1)),
          items: { create: items },
        },
      });
      orders.push(order);
    }

    // ── Sales (POS, last 30 days) ───────────────────────
    for (let i = 0; i < 50; i++) {
      const numItems = randInt(1, 4);
      const items = [];
      const usedProducts = new Set<number>();
      for (let j = 0; j < numItems; j++) {
        let prod = pick(products);
        while (usedProducts.has(prod.id)) prod = pick(products);
        usedProducts.add(prod.id);
        const qty = randInt(1, 3);
        items.push({
          productId: prod.id,
          name: prod.name,
          price: prod.price,
          costPrice: prod.costPrice,
          quantity: qty,
          unit: prod.unit,
        });
      }
      const total = items.reduce((s, it) => s + it.price * it.quantity, 0);
      const totalCogs = items.reduce((s, it) => s + (it.costPrice || 0) * it.quantity, 0);
      const method = pick(["efectivo", "efectivo", "yape", "plin"]);
      const amountPaid = method === "efectivo" ? Math.ceil(total / 5) * 5 : total;

      await prisma.sale.create({
        data: {
          id: `SALE-${rid()}`,
          tenantId,
          total: Math.round(total * 100) / 100,
          totalCogs: Math.round(totalCogs * 100) / 100,
          payment: method,
          amountPaid,
          change: Math.round((amountPaid - total) * 100) / 100,
          customerPhone: Math.random() > 0.5 ? pick(customers).phone : null,
          createdAt: daysAgo(randInt(0, 30)),
          items: { create: items },
        },
      });
    }

    // ── Purchase Orders ─────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const supplier = pick(suppliers);
      const numItems = randInt(2, 5);
      const items = [];
      const usedProducts = new Set<number>();
      for (let j = 0; j < numItems; j++) {
        let prod = pick(products);
        while (usedProducts.has(prod.id)) prod = pick(products);
        usedProducts.add(prod.id);
        items.push({
          productId: prod.id,
          name: prod.name,
          quantity: randInt(10, 50),
          unitCost: prod.costPrice || prod.price * 0.7,
          unit: prod.unit,
        });
      }
      const total = items.reduce((s, it) => s + it.unitCost * it.quantity, 0);
      const poStatus = pick(["pendiente", "recibido", "recibido", "recibido"] as const);

      await prisma.purchaseOrder.create({
        data: {
          id: `PO-${rid()}`,
          tenantId,
          supplierId: supplier.id,
          supplierName: supplier.name,
          total: Math.round(total * 100) / 100,
          status: poStatus,
          createdAt: daysAgo(randInt(1, 45)),
          updatedAt: daysAgo(randInt(0, 10)),
          items: { create: items },
        },
      });
    }

    // ── Reviews ─────────────────────────────────────────
    const reviewTexts = [
      "Excelente atención, siempre tienen todo lo que necesito.",
      "Precios justos y entrega rápida, muy recomendada.",
      "Buena variedad de productos, aunque a veces faltan algunas cosas.",
      "El delivery llega puntual, muy contentos con el servicio.",
      "La mejor bodega del barrio, atención amable.",
      "Productos frescos y buena calidad, sigan así.",
      "Un poco caro en algunos productos, pero la calidad es buena.",
      "Rápido y confiable, ya es mi bodega de confianza.",
    ];
    for (let i = 0; i < 8; i++) {
      const c = pick(customers);
      await prisma.review.create({
        data: {
          id: rid(),
          tenantId,
          name: c.name,
          location: c.location.split(",")[0],
          text: reviewTexts[i],
          rating: randInt(3, 5),
          phone: c.phone,
          status: "approved",
          date: daysAgo(randInt(1, 60)),
        },
      });
    }

    // ── Promotions ──────────────────────────────────────
    await prisma.promotion.createMany({
      data: [
        { id: rid(), tenantId, name: "Descuento Fin de Semana", description: "10% en compras mayores a S/50", discountPercent: 10, minPurchase: 50, active: true, createdAt: daysAgo(5) },
        { id: rid(), tenantId, name: "2x1 en Bebidas", description: "Lleva 2 y paga 1 en gaseosas seleccionadas", discountPercent: 50, active: true, createdAt: daysAgo(3) },
        { id: rid(), tenantId, name: "Promo Abarrotes", description: "15% en abarrotes comprando 3 o más", discountPercent: 15, minPurchase: 30, active: false, createdAt: daysAgo(20) },
      ],
    });

    // ── Coupons ─────────────────────────────────────────
    await prisma.coupon.createMany({
      data: [
        { tenantId, code: "BIENVENIDO10", description: "10% de descuento para nuevos clientes", discountType: "percent", discountValue: 10, minPurchase: 30, maxUses: 100, usedCount: 23, active: true },
        { tenantId, code: "BODEGA20", description: "S/20 de descuento en compras mayores a S/100", discountType: "fixed", discountValue: 20, minPurchase: 100, maxUses: 50, usedCount: 8, active: true },
        { tenantId, code: "DELIVERY5", description: "S/5 de descuento en delivery", discountType: "fixed", discountValue: 5, maxUses: 200, usedCount: 45, active: true },
      ],
    });

    // ── Cash Register ───────────────────────────────────
    await prisma.cashRegister.create({
      data: {
        tenantId,
        openedAt: daysAgo(0),
        openingAmount: 200,
        status: "abierta",
        movements: {
          create: [
            { type: "apertura", amount: 200, method: "efectivo", description: "Apertura de caja" },
            { type: "venta", amount: 45.50, method: "efectivo", description: "Venta #1 del día" },
            { type: "venta", amount: 32.00, method: "yape", description: "Venta #2 del día" },
            { type: "ingreso", amount: 100, method: "efectivo", description: "Ingreso adicional" },
          ],
        },
      },
    });

    // ── Expenses ────────────────────────────────────────
    const expenseCategories = ["alquiler", "servicios", "personal", "transporte", "limpieza"];
    for (let i = 0; i < 10; i++) {
      await prisma.expense.create({
        data: {
          tenantId,
          category: pick(expenseCategories),
          description: pick(["Luz del mes", "Agua del mes", "Sueldo ayudante", "Gasolina motokar", "Productos de limpieza", "Alquiler mensual", "Internet", "Celular"]),
          amount: rand(20, 800),
          date: daysAgo(randInt(0, 30)),
          recurring: Math.random() > 0.5,
        },
      });
    }

    // ── Bundles (Combos) ────────────────────────────────
    await prisma.bundle.create({
      data: {
        tenantId,
        name: "Combo Desayuno",
        description: "Pan + Leche + Huevos",
        price: 19.90,
        active: true,
        items: {
          create: [
            { productId: products.find(p => p.name.includes("Pan"))?.id || products[0].id, quantity: 1 },
            { productId: products.find(p => p.name.includes("Leche"))?.id || products[1].id, quantity: 1 },
            { productId: products.find(p => p.name.includes("Huevos"))?.id || products[2].id, quantity: 1 },
          ],
        },
      },
    });
    await prisma.bundle.create({
      data: {
        tenantId,
        name: "Combo Bebidas Familiar",
        description: "Coca-Cola + Inca Kola + Agua",
        price: 16.50,
        active: true,
        items: {
          create: [
            { productId: products.find(p => p.name.includes("Coca-Cola"))?.id || products[0].id, quantity: 1 },
            { productId: products.find(p => p.name.includes("Inca Kola"))?.id || products[1].id, quantity: 1 },
            { productId: products.find(p => p.name.includes("Agua"))?.id || products[2].id, quantity: 1 },
          ],
        },
      },
    });

    // ── Activity Log ────────────────────────────────────
    const actions = ["create", "update", "delete", "view", "login"];
    const entities = ["product", "order", "customer", "sale", "settings"];
    for (let i = 0; i < 15; i++) {
      await prisma.activityLog.create({
        data: {
          tenantId,
          action: pick(actions),
          entity: pick(entities),
          detail: pick(["Producto actualizado", "Nuevo pedido creado", "Cliente registrado", "Venta completada", "Inicio de sesión", "Precio modificado"]),
          user: pick(["admin", "cajero"]),
          createdAt: daysAgo(randInt(0, 14)),
        },
      });
    }

    // ── Supplier Evaluations ────────────────────────────
    for (const sup of suppliers) {
      await prisma.supplierEvaluation.create({
        data: {
          tenantId,
          supplierId: sup.id,
          punctuality: randInt(2, 5),
          quality: randInt(3, 5),
          price: randInt(2, 5),
          notes: pick(["Buen servicio", "A veces demoran", "Calidad constante", "Precios competitivos", ""]),
          createdAt: daysAgo(randInt(5, 30)),
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: "Datos de simulación generados exitosamente",
      counts: {
        products: products.length,
        customers: customers.length,
        suppliers: suppliers.length,
        orders: orders.length,
        sales: 50,
        reviews: 8,
        promotions: 3,
        coupons: 3,
        expenses: 10,
        bundles: 2,
      },
    });
  } catch (e) {
    logger.error("[SEED-DATA] error", { error: (e as Error).message, tenantId: auth.tenantId });
    return NextResponse.json({ error: "Error al generar datos de simulación" }, { status: 500 });
  }
  /* eslint-enable no-restricted-syntax */
}
