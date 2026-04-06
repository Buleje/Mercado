/**
 * Seed del tenant "fruteria-maria" — segundo tenant de prueba para QA multi-tenant.
 * Crea una frutería con productos, clientes, pedidos y datos distintos al tenant "demo".
 *
 * Ejecutar: npx tsx prisma/seed-fruteria.ts
 */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const SLUG = "fruteria-maria";
const TENANT_NAME = "Frutería María";

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");

  const isLocal = connectionString.includes("localhost") || connectionString.includes("127.0.0.1");
  const resolvedUrl = !isLocal && !connectionString.includes("pgbouncer=true")
    ? connectionString + (connectionString.includes("?") ? "&" : "?") + "pgbouncer=true"
    : connectionString;

  const adapter = new PrismaPg({ connectionString: resolvedUrl, ssl: isLocal ? false : { rejectUnauthorized: false } });
  const prisma = new PrismaClient({ adapter });

  try {
    // ── Verificar si ya existe ──────────────────────────────
    const existing = await prisma.tenant.findUnique({ where: { slug: SLUG } });
    if (existing) {
      console.log(`ℹ️  Tenant '${SLUG}' ya existe. Eliminando datos antiguos para recrear...`);
      await prisma.$transaction([
        prisma.activityLog.deleteMany({ where: { tenantId: existing.id } }),
        prisma.review.deleteMany({ where: { tenantId: existing.id } }),
        prisma.cashMovement.deleteMany({ where: { cashRegister: { tenantId: existing.id } } }),
        prisma.cashRegister.deleteMany({ where: { tenantId: existing.id } }),
        prisma.promotion.deleteMany({ where: { tenantId: existing.id } }),
        prisma.expense.deleteMany({ where: { tenantId: existing.id } }),
        prisma.batch.deleteMany({ where: { tenantId: existing.id } }),
        prisma.fiadoCuota.deleteMany({ where: { fiado: { tenantId: existing.id } } }),
        prisma.fiado.deleteMany({ where: { tenantId: existing.id } }),
        prisma.saleItem.deleteMany({ where: { sale: { tenantId: existing.id } } }),
        prisma.sale.deleteMany({ where: { tenantId: existing.id } }),
        prisma.purchaseItem.deleteMany({ where: { purchaseOrder: { tenantId: existing.id } } }),
        prisma.purchaseOrder.deleteMany({ where: { tenantId: existing.id } }),
        prisma.orderItem.deleteMany({ where: { order: { tenantId: existing.id } } }),
        prisma.order.deleteMany({ where: { tenantId: existing.id } }),
        prisma.supplier.deleteMany({ where: { tenantId: existing.id } }),
        prisma.customer.deleteMany({ where: { tenantId: existing.id } }),
        prisma.product.deleteMany({ where: { tenantId: existing.id } }),
        prisma.adminUser.deleteMany({ where: { tenantId: existing.id } }),
        prisma.settings.deleteMany({ where: { tenantId: existing.id } }),
        prisma.store.deleteMany({ where: { tenantId: existing.id } }),
      ]);
      await prisma.tenant.delete({ where: { slug: SLUG } });
      console.log("🗑️  Datos antiguos eliminados.");
    }

    // ── Crear Tenant ────────────────────────────────────────
    const tenant = await prisma.tenant.create({
      data: {
        slug: SLUG,
        name: TENANT_NAME,
        plan: "pro",
        type: "store",
        active: true,
        ownerEmail: "maria@fruteria.pe",
        ownerPhone: "987200001",
        trialEndsAt: new Date("2099-12-31"),
      },
    });
    console.log(`✅ Tenant '${SLUG}' creado (ID: ${tenant.id})`);

    // ── AdminUser ───────────────────────────────────────────
    const passwordHash = await hash("fruteria123", 10);
    await prisma.$transaction([
      prisma.adminUser.create({
        data: { tenantId: tenant.id, username: "maria", passwordHash, role: "admin", name: "María López", active: true },
      }),
      prisma.adminUser.create({
        data: { tenantId: tenant.id, username: "vendedor", passwordHash, role: "cajero", name: "Juan Vendedor", active: true },
      }),
    ]);
    console.log("✅ 2 usuarios admin creados (maria/fruteria123, vendedor/fruteria123)");

    // ── Settings con branding propio ────────────────────────
    await prisma.settings.create({
      data: {
        tenantId: tenant.id,
        businessName: TENANT_NAME,
        mode: "checkout",
        cashEnabled: true,
        yapeEnabled: true,
        businessPhone: "987200001",
        businessAddress: "Av. Yarinacocha km 2, Pucallpa, Peru",
        primaryColor: "#22C55E",
        secondaryColor: "#F59E0B",
        slogan: "Frutas frescas directo del campo a tu mesa",
        storeThemeJson: JSON.stringify({
          primaryColor: "#22C55E", secondaryColor: "#F59E0B", accentColor: "#16A34A",
          name: TENANT_NAME, slogan: "Frutas frescas directo del campo a tu mesa",
          description: "Frutería con frutas tropicales frescas de la selva peruana. Delivery en Pucallpa.",
          heroTitle: "Frutas frescas de la selva",
          heroSubtitle: "Delivery rápido en Pucallpa. Paga con Yape o efectivo.",
          heroCTA: "Ver frutas", whatsapp: "987200001", phone: "987200001",
          address: "Av. Yarinacocha km 2, Pucallpa", fontFamily: "inter",
          sections: ["hero", "categories", "popular", "deals", "testimonials", "faq", "contact"],
          sectionOrder: ["hero", "categories", "popular", "deals", "testimonials", "faq", "contact"],
        }),
      },
    });

    // ── Store publicada ─────────────────────────────────────
    await prisma.store.create({
      data: { tenantId: tenant.id, slug: SLUG, name: TENANT_NAME, isPublished: true, category: "fruteria" },
    });
    console.log("✅ Settings + Store creados");

    // ── 20 Productos (frutas y verduras) ────────────────────
    const PRODUCTS = [
      { name: "Mango Kent x kg", price: 5.00, costPrice: 3.00, stock: 60, stockMin: 15, category: "Frutas", barcode: "8801001001001" },
      { name: "Papaya Criolla x kg", price: 3.50, costPrice: 2.00, stock: 45, stockMin: 10, category: "Frutas", barcode: "8801001001002" },
      { name: "Plátano de Isla x kg", price: 2.00, costPrice: 1.20, stock: 80, stockMin: 20, category: "Frutas", barcode: "8801001001003" },
      { name: "Piña Golden x unidad", price: 6.00, costPrice: 3.50, stock: 35, stockMin: 8, category: "Frutas", barcode: "8801001001004" },
      { name: "Sandía x kg", price: 2.50, costPrice: 1.30, stock: 25, stockMin: 5, category: "Frutas", barcode: "8801001001005" },
      { name: "Maracuyá x kg", price: 4.00, costPrice: 2.50, stock: 40, stockMin: 10, category: "Frutas", barcode: "8801001001006" },
      { name: "Coco Fresco x unidad", price: 3.00, costPrice: 1.50, stock: 30, stockMin: 8, category: "Frutas", barcode: "8801001001007" },
      { name: "Aguaje (fruto) x kg", price: 8.00, costPrice: 5.00, stock: 20, stockMin: 5, category: "Frutas", barcode: "8801001001008" },
      { name: "Camu Camu x kg", price: 12.00, costPrice: 8.00, stock: 15, stockMin: 5, category: "Frutas", barcode: "8801001001009" },
      { name: "Cocona x kg", price: 5.50, costPrice: 3.50, stock: 25, stockMin: 8, category: "Frutas", barcode: "8801001001010" },
      { name: "Tomate x kg", price: 3.00, costPrice: 1.80, stock: 50, stockMin: 15, category: "Verduras", barcode: "8801001002001" },
      { name: "Cebolla Roja x kg", price: 3.50, costPrice: 2.00, stock: 60, stockMin: 15, category: "Verduras", barcode: "8801001002002" },
      { name: "Ajo fresco x kg", price: 15.00, costPrice: 10.00, stock: 10, stockMin: 3, category: "Verduras", barcode: "8801001002003" },
      { name: "Limón x kg", price: 4.00, costPrice: 2.50, stock: 70, stockMin: 20, category: "Verduras", barcode: "8801001002004" },
      { name: "Yuca x kg", price: 2.50, costPrice: 1.50, stock: 40, stockMin: 10, category: "Verduras", barcode: "8801001002005" },
      { name: "Choclo fresco x unidad", price: 1.50, costPrice: 0.80, stock: 100, stockMin: 25, category: "Verduras", barcode: "8801001002006" },
      { name: "Jugo de Naranja Natural 1L", price: 8.00, costPrice: 4.50, stock: 20, stockMin: 5, category: "Jugos", barcode: "8801001003001" },
      { name: "Jugo de Maracuyá Natural 1L", price: 7.00, costPrice: 4.00, stock: 18, stockMin: 5, category: "Jugos", barcode: "8801001003002" },
      { name: "Ensalada de Frutas x porción", price: 5.00, costPrice: 2.50, stock: 15, stockMin: 5, category: "Preparados", barcode: "8801001004001" },
      { name: "Canasta de Frutas Surtida", price: 25.00, costPrice: 15.00, stock: 10, stockMin: 3, category: "Preparados", barcode: "8801001004002" },
    ];

    await prisma.product.createMany({
      data: PRODUCTS.map((p) => ({
        tenantId: tenant.id, name: p.name, price: p.price, costPrice: p.costPrice,
        stock: p.stock, stockMin: p.stockMin, category: p.category, barcode: p.barcode, active: true,
      })),
    });
    const products = await prisma.product.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, price: true, costPrice: true } });
    console.log(`✅ ${products.length} productos creados`);

    // ── 8 Clientes ──────────────────────────────────────────
    const CUSTOMERS = [
      { name: "Elena Quispe Rivera", phone: "987200010", email: "elena@fruteria.pe", location: "Jr. Padre Abad 111, Pucallpa" },
      { name: "Roberto Peña Torres", phone: "987200011", email: "roberto@fruteria.pe", location: "Av. Centenario 789, Pucallpa" },
      { name: "Sonia Campos Diaz", phone: "987200012", email: "sonia@fruteria.pe", location: "Jr. Libertad 234, Pucallpa" },
      { name: "Fernando Cruz Silva", phone: "987200013", email: "fernando@fruteria.pe", location: "Av. Manantay 567, Pucallpa" },
      { name: "Patricia Rojas Luna", phone: "987200014", email: "patricia@fruteria.pe", location: "Jr. Tarapaca 890, Pucallpa" },
      { name: "Diego Alvarez Soto", phone: "987200015", email: "diego@fruteria.pe", location: "Av. San Martin 456, Pucallpa" },
      { name: "Carmen Rios Vargas", phone: "987200016", email: "carmen@fruteria.pe", location: "Jr. Ucayali 678, Pucallpa" },
      { name: "André Flores Paredes", phone: "987200017", email: "andre@fruteria.pe", location: "Av. Yarinacocha km 1, Pucallpa" },
    ];
    await prisma.$transaction(
      CUSTOMERS.map((c) => prisma.customer.create({
        data: { tenantId: tenant.id, name: c.name, phone: c.phone, email: c.email, location: c.location },
      }))
    );
    console.log(`✅ ${CUSTOMERS.length} clientes creados`);

    // ── 3 Proveedores ───────────────────────────────────────
    const SUPPLIERS = [
      { id: `sup-fm-1`, name: "Fundo Los Mangos SAC", ruc: "20612345001", phone: "061555001", email: "ventas@fundolosmangos.pe", address: "Carretera Federico Basadre km 10, Pucallpa" },
      { id: `sup-fm-2`, name: "Cooperativa Frutas Ucayali", ruc: "20612345002", phone: "061555002", email: "coop@frutasucayali.pe", address: "Av. Centenario km 8, Pucallpa" },
      { id: `sup-fm-3`, name: "Verduras del Valle EIRL", ruc: "20612345003", phone: "061555003", email: "info@verduradelvalle.pe", address: "Mercado N°2, Pucallpa" },
    ];
    await prisma.$transaction(
      SUPPLIERS.map((s) => prisma.supplier.create({
        data: { ...s, tenantId: tenant.id, estado: "activo", tipoPersona: "juridica", tipoDocumento: "RUC", documento: s.ruc },
      }))
    );
    console.log(`✅ ${SUPPLIERS.length} proveedores creados`);

    // ── 15 Pedidos ──────────────────────────────────────────
    const ORDER_STATUSES = ["entregado", "entregado", "entregado", "entregado", "entregado",
      "entregado", "entregado", "pendiente", "pendiente", "pendiente",
      "confirmado", "confirmado", "en_camino", "en_camino", "cancelado"] as const;
    const PAYMENT_METHODS = ["cash", "yape", "plin", "cash", "yape"];

    for (let i = 0; i < 15; i++) {
      const c = CUSTOMERS[i % CUSTOMERS.length];
      const p1 = products[i % products.length];
      const p2 = products[(i + 3) % products.length];
      const q1 = (i % 3) + 1, q2 = (i % 2) + 1;
      const total = p1.price * q1 + p2.price * q2;

      await prisma.order.create({
        data: {
          id: `fm-ord-${String(i).padStart(3, "0")}`,
          tenantId: tenant.id, customerName: c.name,
          customer: { connect: { phone: c.phone } },
          status: ORDER_STATUSES[i], total,
          paymentMethod: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
          customerLocation: c.location,
          createdAt: new Date(Date.now() - (15 - i) * 4 * 60 * 60 * 1000),
          items: {
            create: [
              { productId: p1.id, name: p1.name, price: p1.price, quantity: q1, unit: "kg" },
              { productId: p2.id, name: p2.name, price: p2.price, quantity: q2, unit: "kg" },
            ],
          },
        },
      });
    }
    console.log("✅ 15 pedidos creados");

    // ── 8 Ventas POS ────────────────────────────────────────
    for (let i = 0; i < 8; i++) {
      const p1 = products[i % products.length];
      const p2 = products[(i + 2) % products.length];
      const total = p1.price * 2 + p2.price;
      await prisma.sale.create({
        data: {
          id: `fm-sale-${String(i).padStart(3, "0")}`,
          tenantId: tenant.id, total, totalCogs: total * 0.6,
          payment: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
          amountPaid: Math.ceil(total / 5) * 5, change: Math.ceil(total / 5) * 5 - total,
          customer: { connect: { phone: CUSTOMERS[i % CUSTOMERS.length].phone } },
          cashierId: i % 2 === 0 ? "vendedor" : "maria",
          comprobanteTipo: "ticket",
          createdAt: new Date(Date.now() - (8 - i) * 3 * 60 * 60 * 1000),
          items: {
            create: [
              { productId: p1.id, name: p1.name, price: p1.price, quantity: 2, unit: "kg" },
              { productId: p2.id, name: p2.name, price: p2.price, quantity: 1, unit: "kg" },
            ],
          },
        },
      });
    }
    console.log("✅ 8 ventas POS creadas");

    // ── 4 Lotes con vencimiento (frutas frescas) ────────────
    const BATCHES = [
      { productIdx: 0, lote: "LOTE-MAN-001", qty: 60, daysToExpiry: 4, category: "Frutas" },
      { productIdx: 1, lote: "LOTE-PAP-001", qty: 45, daysToExpiry: 3, category: "Frutas" },
      { productIdx: 3, lote: "LOTE-PIN-001", qty: 35, daysToExpiry: 6, category: "Frutas" },
      { productIdx: 10, lote: "LOTE-TOM-001", qty: 50, daysToExpiry: 5, category: "Verduras" },
    ];
    for (const b of BATCHES) {
      const p = products[b.productIdx];
      await prisma.batch.create({
        data: {
          tenantId: tenant.id, lote: b.lote, productName: p.name, productCategory: b.category,
          quantity: b.qty, unit: "kg", productId: p.id,
          entryDate: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
          expiryDate: new Date(Date.now() + b.daysToExpiry * 24 * 60 * 60 * 1000),
          costUnit: (p.costPrice ?? p.price * 0.6) as number,
          supplierName: SUPPLIERS[b.productIdx % SUPPLIERS.length].name,
          supplierId: SUPPLIERS[b.productIdx % SUPPLIERS.length].id,
        },
      });
    }
    console.log("✅ 4 lotes creados");

    // ── 2 Promociones ───────────────────────────────────────
    await prisma.$transaction([
      prisma.promotion.create({ data: { id: "fm-promo-1", tenantId: tenant.id, name: "20% en Frutas Tropicales", description: "Descuento en mangos, papayas y piñas", discountPercent: 20, minPurchase: 15, active: true, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }),
      prisma.promotion.create({ data: { id: "fm-promo-2", tenantId: tenant.id, name: "Canasta Familiar S/20", description: "Canasta surtida de frutas a precio especial", discountPercent: 15, minPurchase: 20, active: true, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } }),
    ]);
    console.log("✅ 2 promociones creadas");

    // ── 5 Gastos ────────────────────────────────────────────
    const EXPENSES = [
      { category: "alquiler", description: "Alquiler puesto mercado abril", amount: 800, recurring: true },
      { category: "servicios", description: "Electricidad refrigeración", amount: 180, recurring: true },
      { category: "transporte", description: "Flete frutas desde fundo", amount: 250, recurring: false },
      { category: "personal", description: "Sueldo ayudante quincenal", amount: 400, recurring: true },
      { category: "otros", description: "Bolsas y empaques", amount: 60, recurring: false },
    ];
    await prisma.$transaction(
      EXPENSES.map((e, i) => prisma.expense.create({
        data: { ...e, tenantId: tenant.id, date: new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000) },
      }))
    );
    console.log("✅ 5 gastos creados");

    // ── 4 Reviews ───────────────────────────────────────────
    const REVIEWS = [
      { phone: CUSTOMERS[0].phone, name: CUSTOMERS[0].name, rating: 5, comment: "Las mejores frutas de Pucallpa! Siempre frescas y a buen precio." },
      { phone: CUSTOMERS[1].phone, name: CUSTOMERS[1].name, rating: 5, comment: "El mango Kent es espectacular. Delivery rápido y bien empacado." },
      { phone: CUSTOMERS[2].phone, name: CUSTOMERS[2].name, rating: 4, comment: "Buena variedad de frutas amazónicas. Me gustaría que tengan más jugos." },
      { phone: CUSTOMERS[3].phone, name: CUSTOMERS[3].name, rating: 5, comment: "La ensalada de frutas es mi favorita. Siempre fresca y abundante." },
    ];
    for (let i = 0; i < REVIEWS.length; i++) {
      const r = REVIEWS[i];
      await prisma.review.create({
        data: { id: `fm-rev-${i}`, tenantId: tenant.id, phone: r.phone, name: r.name, rating: r.rating, text: r.comment, productId: products[i * 2 % products.length].id },
      });
    }
    console.log("✅ 4 reviews creadas");

    // ── 8 Registros de actividad ────────────────────────────
    const ACTIVITIES = [
      { action: "create", entity: "sale", detail: "Venta POS S/15.00 — Yape — Juan Vendedor", user: "vendedor" },
      { action: "create", entity: "order", detail: "Nuevo pedido #fm-ord-014 de Elena Quispe", user: "sistema" },
      { action: "update", entity: "product", detail: "ALERTA: Camu Camu bajo stock (15 unidades, mínimo 5)", user: "sistema" },
      { action: "create", entity: "product", detail: "Nuevo producto: Canasta de Frutas Surtida — S/25.00", user: "maria" },
      { action: "update", entity: "batch", detail: "LOTE-PAP-001 vence en 3 días (45 kg de Papaya Criolla)", user: "sistema" },
      { action: "create", entity: "promotion", detail: "Nueva promo: 20% en Frutas Tropicales", user: "maria" },
      { action: "update", entity: "settings", detail: "Logo y colores de la frutería actualizados", user: "maria" },
      { action: "create", entity: "cash", detail: "Ingreso caja: S/280 — Ventas efectivo mañana", user: "vendedor" },
    ];
    await prisma.$transaction(
      ACTIVITIES.map((a, i) => prisma.activityLog.create({
        data: { tenantId: tenant.id, action: a.action, entity: a.entity, detail: a.detail, user: a.user, createdAt: new Date(Date.now() - i * 30 * 60 * 1000) },
      }))
    );
    console.log("✅ 8 registros de actividad");

    console.log(`\n🍊 FRUTERÍA MARÍA CREADA EXITOSAMENTE`);
    console.log(`   Tenant: ${SLUG}`);
    console.log(`   Admin:  /t/${SLUG}/admin  (usuario: maria, clave: fruteria123)`);
    console.log(`   Tienda: /t/${SLUG}/tienda`);
    console.log(`   Plan:   Pro`);
    console.log(`   Productos: 20 (frutas, verduras, jugos, preparados)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
