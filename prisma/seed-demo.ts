/**
 * Seed del tenant DEMO permanente.
 * Crea un tenant "demo" con datos completos para que cualquier visitante
 * entre directamente sin crear uno nuevo.
 *
 * Ejecutar: npx tsx prisma/seed-demo.ts
 */
import { PrismaClient } from "../lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { hash } from "bcryptjs";

const SLUG = "demo";
const TENANT_NAME = "Bodega Demo — Plan Enterprise";

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
      console.log("ℹ️  Tenant 'demo' ya existe. Eliminando datos antiguos para recrear...");
      // Limpiar datos del tenant demo para recrear frescos
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
        plan: "enterprise",
        type: "store",
        active: true,
        ownerEmail: "demo@buleje.pe",
        ownerPhone: "999888777",
        trialEndsAt: new Date("2099-12-31"),
      },
    });
    console.log(`✅ Tenant '${SLUG}' creado (ID: ${tenant.id})`);

    // ── AdminUser ───────────────────────────────────────────
    const passwordHash = await hash("demo1234", 10);
    await prisma.$transaction([
      prisma.adminUser.create({
        data: { tenantId: tenant.id, username: "demo", passwordHash, role: "admin", name: "Admin Demo", active: true },
      }),
      prisma.adminUser.create({
        data: { tenantId: tenant.id, username: "cajero", passwordHash, role: "cajero", name: "Maria Cajera", active: true },
      }),
    ]);
    console.log("✅ 2 usuarios admin creados (demo/demo1234, cajero/demo1234)");

    // ── Settings con branding completo ──────────────────────
    await prisma.settings.create({
      data: {
        tenantId: tenant.id,
        businessName: TENANT_NAME,
        mode: "checkout",
        cashEnabled: true,
        yapeEnabled: true,
        businessPhone: "999888777",
        businessAddress: "Jr. Ucayali 456, Pucallpa, Peru",
        primaryColor: "#00B4A6",
        secondaryColor: "#f97316",
        slogan: "Tu bodega digital de confianza",
        storeThemeJson: JSON.stringify({
          primaryColor: "#00B4A6", secondaryColor: "#f97316", accentColor: "#00B4A6",
          name: TENANT_NAME, slogan: "Tu bodega digital de confianza",
          description: "Tienda demo con plan Enterprise. Explora todos los modulos del sistema.",
          heroTitle: "Todo lo que necesitas, en tu puerta",
          heroSubtitle: "Delivery rapido en Pucallpa. Paga con Yape o efectivo.",
          heroCTA: "Ver productos", whatsapp: "999888777", phone: "999888777",
          address: "Jr. Ucayali 456, Pucallpa", fontFamily: "inter",
          sections: ["announcement","hero","categories","popular","deals","combos","recipes","testimonials","faq","contact","delivery_map"],
          sectionOrder: ["announcement","hero","categories","popular","deals","combos","recipes","testimonials","faq","contact","delivery_map"],
        }),
      },
    });

    // ── Store publicada ─────────────────────────────────────
    await prisma.store.create({
      data: { tenantId: tenant.id, slug: SLUG, name: TENANT_NAME, isPublished: true },
    });
    console.log("✅ Settings + Store creados");

    // ── 30 Productos ────────────────────────────────────────
    const PRODUCTS = [
      { name: "Arroz Costeno Extra 1kg", price: 3.50, costPrice: 2.45, stock: 180, stockMin: 30, category: "Abarrotes", barcode: "7751271001234" },
      { name: "Arroz Costeno Extra 5kg", price: 16.50, costPrice: 12.00, stock: 80, stockMin: 15, category: "Abarrotes", barcode: "7751271005678" },
      { name: "Aceite Primor 1L", price: 8.90, costPrice: 6.50, stock: 120, stockMin: 20, category: "Abarrotes", barcode: "7751271012345" },
      { name: "Azucar Rubia 1kg", price: 4.20, costPrice: 3.00, stock: 150, stockMin: 25, category: "Abarrotes", barcode: "7751271023456" },
      { name: "Sal Emsal 500g", price: 1.20, costPrice: 0.80, stock: 200, stockMin: 40, category: "Abarrotes", barcode: "7751271034567" },
      { name: "Fideos Lavaggi Spaghetti 500g", price: 2.80, costPrice: 2.00, stock: 90, stockMin: 20, category: "Abarrotes", barcode: "7751271045678" },
      { name: "Atun Florida en Agua 170g", price: 4.50, costPrice: 3.20, stock: 5, stockMin: 15, category: "Abarrotes", barcode: "7751271056789" },
      { name: "Mayonesa Alacena 100g", price: 3.20, costPrice: 2.30, stock: 60, stockMin: 15, category: "Abarrotes", barcode: "7751271067890" },
      { name: "Leche Gloria Evaporada 400g", price: 5.50, costPrice: 4.00, stock: 100, stockMin: 20, category: "Lacteos", barcode: "7751271078901" },
      { name: "Mantequilla Laive 100g", price: 5.80, costPrice: 4.20, stock: 35, stockMin: 10, category: "Lacteos", barcode: "7751271089012" },
      { name: "Yogurt Gloria Fresa 1L", price: 7.50, costPrice: 5.50, stock: 40, stockMin: 10, category: "Lacteos", barcode: "7751271090123" },
      { name: "Huevos Blancos x12", price: 9.50, costPrice: 7.00, stock: 55, stockMin: 15, category: "Lacteos", barcode: "7751271101234" },
      { name: "Inca Kola 500ml", price: 2.50, costPrice: 1.70, stock: 200, stockMin: 40, category: "Bebidas", barcode: "7751271112345" },
      { name: "Coca-Cola 500ml", price: 2.50, costPrice: 1.70, stock: 180, stockMin: 40, category: "Bebidas", barcode: "7751271123456" },
      { name: "Agua San Luis 625ml", price: 1.50, costPrice: 0.90, stock: 250, stockMin: 50, category: "Bebidas", barcode: "7751271134567" },
      { name: "Cafe Altomayo Instantaneo 50g", price: 4.80, costPrice: 3.50, stock: 45, stockMin: 10, category: "Bebidas", barcode: "7751271145678" },
      { name: "Milo 400g", price: 12.50, costPrice: 9.80, stock: 22, stockMin: 8, category: "Bebidas", barcode: "7751271156789" },
      { name: "Detergente Ariel 500g", price: 7.90, costPrice: 5.80, stock: 60, stockMin: 15, category: "Limpieza", barcode: "7751271167890" },
      { name: "Jabon Bolivar 150g", price: 1.80, costPrice: 1.20, stock: 100, stockMin: 25, category: "Limpieza", barcode: "7751271178901" },
      { name: "Papel Higienico Elite x4", price: 6.50, costPrice: 4.80, stock: 70, stockMin: 15, category: "Limpieza", barcode: "7751271189012" },
      { name: "Lejia Clorox 500ml", price: 3.50, costPrice: 2.40, stock: 80, stockMin: 20, category: "Limpieza", barcode: "7751271190123" },
      { name: "Lavavajilla Ayudin 500g", price: 4.20, costPrice: 3.00, stock: 45, stockMin: 10, category: "Limpieza", barcode: "7751271201234" },
      { name: "Galletas Oreo 36g", price: 1.50, costPrice: 1.00, stock: 150, stockMin: 30, category: "Snacks", barcode: "7751271212345" },
      { name: "Sublime 33g", price: 1.20, costPrice: 0.85, stock: 200, stockMin: 40, category: "Snacks", barcode: "7751271223456" },
      { name: "Chifles Karinto 40g", price: 1.00, costPrice: 0.65, stock: 120, stockMin: 25, category: "Snacks", barcode: "7751271234567" },
      { name: "Pan Molde Bimbo 500g", price: 6.20, costPrice: 4.50, stock: 18, stockMin: 8, category: "Panaderia", barcode: "7751271245678" },
      { name: "Pollo Entero x kg", price: 9.80, costPrice: 7.50, stock: 30, stockMin: 10, category: "Carnes", barcode: "7751271256789" },
      { name: "Carne Molida x kg", price: 15.00, costPrice: 11.50, stock: 20, stockMin: 5, category: "Carnes", barcode: "7751271267890" },
      { name: "Platano Seda x kg", price: 2.50, costPrice: 1.50, stock: 40, stockMin: 10, category: "Frutas", barcode: "7751271278901" },
      { name: "Papa Blanca x kg", price: 3.00, costPrice: 2.00, stock: 50, stockMin: 15, category: "Verduras", barcode: "7751271289012" },
    ];

    await prisma.product.createMany({
      data: PRODUCTS.map((p) => ({
        tenantId: tenant.id, name: p.name, price: p.price, costPrice: p.costPrice,
        stock: p.stock, stockMin: p.stockMin, category: p.category, barcode: p.barcode, active: true,
      })),
    });
    const products = await prisma.product.findMany({ where: { tenantId: tenant.id }, select: { id: true, name: true, price: true, costPrice: true } });
    console.log(`✅ ${products.length} productos creados`);

    // ── 10 Clientes ─────────────────────────────────────────
    const CUSTOMERS = [
      { name: "Rosa Huanca Soto", phone: "987100001", email: "rosa@demo.pe", location: "Jr. Ucayali 123, Pucallpa" },
      { name: "Carlos Rios Mendoza", phone: "987100002", email: "carlos@demo.pe", location: "Av. Centenario 456, Pucallpa" },
      { name: "Ana Vargas Lopez", phone: "987100003", email: "ana@demo.pe", location: "Jr. Tarapaca 789, Pucallpa" },
      { name: "Miguel Soto Paredes", phone: "987100004", email: "miguel@demo.pe", location: "Av. Yarinacocha km 3" },
      { name: "Lucia Paredes Torres", phone: "987100005", email: "lucia@demo.pe", location: "Jr. Padre Abad 321" },
      { name: "Pedro Ruiz Garcia", phone: "987100006", email: "pedro@demo.pe", location: "Av. Manantay 654" },
      { name: "Maria Flores Diaz", phone: "987100007", email: "maria@demo.pe", location: "Jr. Libertad 987" },
      { name: "Jose Torres Silva", phone: "987100008", email: "jose@demo.pe", location: "Av. San Martin 147" },
      { name: "Carmen Luna Reyes", phone: "987100009", email: "carmen@demo.pe", location: "Jr. Aguaytia 258" },
      { name: "Luis Gutierrez Paz", phone: "987100010", email: "luis@demo.pe", location: "Av. Colonizacion km 2" },
    ];
    await prisma.$transaction(
      CUSTOMERS.map((c) => prisma.customer.create({
        data: { tenantId: tenant.id, name: c.name, phone: c.phone, email: c.email, location: c.location },
      }))
    );
    console.log(`✅ ${CUSTOMERS.length} clientes creados`);

    // ── 4 Proveedores ───────────────────────────────────────
    const SUPPLIERS = [
      { id: `sup-demo-1`, name: "Distribuidora Lima SAC", ruc: "20512345678", phone: "014567890", email: "ventas@distrilima.pe", address: "Av. Argentina 2145, Lima" },
      { id: `sup-demo-2`, name: "Mayorista Ucayali EIRL", ruc: "20198765432", phone: "061789456", email: "pedidos@mayorucayali.pe", address: "Jr. Inmaculada 890, Pucallpa" },
      { id: `sup-demo-3`, name: "Bebidas del Oriente SA", ruc: "20345678901", phone: "061654321", email: "contacto@bebidasoriente.pe", address: "Av. Centenario km 5, Pucallpa" },
      { id: `sup-demo-4`, name: "Frigorifico Amazonia EIRL", ruc: "20456789012", phone: "061432198", email: "ventas@frigoamazonia.pe", address: "Av. Industrial 432, Pucallpa" },
    ];
    await prisma.$transaction(
      SUPPLIERS.map((s) => prisma.supplier.create({
        data: { ...s, tenantId: tenant.id, estado: "activo", tipoPersona: "juridica", tipoDocumento: "RUC", documento: s.ruc },
      }))
    );
    console.log(`✅ ${SUPPLIERS.length} proveedores creados`);

    // ── 25 Pedidos (ultimos 7 dias) ─────────────────────────
    const ORDER_STATUSES = ["entregado","entregado","entregado","entregado","entregado","entregado","entregado","entregado","entregado","entregado",
      "entregado","entregado","pendiente","pendiente","pendiente","pendiente","confirmado","confirmado","confirmado",
      "en_camino","en_camino","en_camino","cancelado","cancelado","pendiente"] as const;
    const PAYMENT_METHODS = ["cash","yape","plin","cash","yape","cash","yape","plin","cash","yape"];
    const LOCATIONS = CUSTOMERS.map((c) => c.location);

    for (let i = 0; i < 25; i++) {
      const c = CUSTOMERS[i % CUSTOMERS.length];
      const p1 = products[i % products.length];
      const p2 = products[(i + 5) % products.length];
      const p3 = products[(i + 10) % products.length];
      const q1 = (i % 3) + 1, q2 = (i % 2) + 1, q3 = i % 4 === 0 ? 1 : 0;
      const total = p1.price * q1 + p2.price * q2 + (q3 > 0 ? p3.price * q3 : 0);

      await prisma.order.create({
        data: {
          id: `demo-ord-${String(i).padStart(3, "0")}`,
          tenantId: tenant.id, customerName: c.name,
          customer: { connect: { phone: c.phone } },
          status: ORDER_STATUSES[i], total,
          paymentMethod: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
          customerLocation: LOCATIONS[i % LOCATIONS.length],
          createdAt: new Date(Date.now() - (25 - i) * 3 * 60 * 60 * 1000),
          items: {
            create: [
              { productId: p1.id, name: p1.name, price: p1.price, quantity: q1, unit: "unidad" },
              { productId: p2.id, name: p2.name, price: p2.price, quantity: q2, unit: "unidad" },
              ...(q3 > 0 ? [{ productId: p3.id, name: p3.name, price: p3.price, quantity: q3, unit: "unidad" }] : []),
            ],
          },
        },
      });
    }
    console.log("✅ 25 pedidos creados");

    // ── 15 Ventas POS (ultimos 3 dias) ──────────────────────
    for (let i = 0; i < 15; i++) {
      const p1 = products[i % products.length];
      const p2 = products[(i + 3) % products.length];
      const total = p1.price * 2 + p2.price * 3;
      await prisma.sale.create({
        data: {
          id: `demo-sale-${String(i).padStart(3, "0")}`,
          tenantId: tenant.id, total, totalCogs: total * 0.65,
          payment: PAYMENT_METHODS[i % PAYMENT_METHODS.length],
          amountPaid: Math.ceil(total / 5) * 5, change: Math.ceil(total / 5) * 5 - total,
          customer: { connect: { phone: CUSTOMERS[i % CUSTOMERS.length].phone } },
          cashierId: i % 3 === 0 ? "cajero" : "demo",
          comprobanteTipo: i % 4 === 0 ? "boleta" : "ticket",
          createdAt: new Date(Date.now() - (15 - i) * 2 * 60 * 60 * 1000),
          items: {
            create: [
              { productId: p1.id, name: p1.name, price: p1.price, quantity: 2, unit: "unidad" },
              { productId: p2.id, name: p2.name, price: p2.price, quantity: 3, unit: "unidad" },
            ],
          },
        },
      });
    }
    console.log("✅ 15 ventas POS creadas");

    // ── 6 Ordenes de Compra ─────────────────────────────────
    const PO_STATUSES = ["recibido","recibido","recibido","pendiente","parcial","pendiente"] as const;
    for (let i = 0; i < 6; i++) {
      const sup = SUPPLIERS[i % SUPPLIERS.length];
      const p1 = products[i * 2 % products.length];
      const p2 = products[(i * 2 + 1) % products.length];
      await prisma.purchaseOrder.create({
        data: {
          id: `demo-po-${String(i).padStart(3, "0")}`,
          tenantId: tenant.id, supplierId: sup.id, supplierName: sup.name,
          total: (p1.price * 0.7 * 100) + (p2.price * 0.7 * 50),
          status: PO_STATUSES[i], paymentMethod: i % 2 === 0 ? "transferencia" : "efectivo",
          deliveryDate: new Date(Date.now() + (i - 3) * 48 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - (6 - i) * 72 * 60 * 60 * 1000),
          items: {
            create: [
              { productId: p1.id, name: p1.name, quantity: 100, unitCost: p1.price * 0.7, unit: "unidad" },
              { productId: p2.id, name: p2.name, quantity: 50, unitCost: p2.price * 0.7, unit: "unidad" },
            ],
          },
        },
      });
    }
    console.log("✅ 6 ordenes de compra creadas");

    // ── 5 Fiados ────────────────────────────────────────────
    const FIADO_DATA = [
      { customerId: CUSTOMERS[0].phone, total: 85.50, saldo: 85.50, desc: "Compra semanal de abarrotes", status: "ACTIVO" as const },
      { customerId: CUSTOMERS[1].phone, total: 120.00, saldo: 45.00, desc: "Fiado bebidas y snacks quincenal", status: "ACTIVO" as const },
      { customerId: CUSTOMERS[2].phone, total: 35.80, saldo: 0, desc: "Fiado liquidado - productos limpieza", status: "PAGADO" as const },
      { customerId: CUSTOMERS[3].phone, total: 200.00, saldo: 200.00, desc: "Fiado grande - canasta basica mensual", status: "ACTIVO" as const },
      { customerId: CUSTOMERS[4].phone, total: 55.00, saldo: 15.00, desc: "Fiado parcialmente pagado", status: "ACTIVO" as const },
    ];
    for (const f of FIADO_DATA) {
      await prisma.fiado.create({
        data: {
          tenantId: tenant.id, customerId: f.customerId, total: f.total, saldo: f.saldo,
          descripcion: f.desc, status: f.status,
          fechaVence: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        },
      });
    }
    console.log("✅ 5 fiados creados");

    // ── 10 Gastos ───────────────────────────────────────────
    const EXPENSES = [
      { category: "alquiler", description: "Alquiler local marzo 2026", amount: 1200, recurring: true },
      { category: "servicios", description: "Electricidad marzo", amount: 280, recurring: true },
      { category: "servicios", description: "Agua marzo", amount: 65, recurring: true },
      { category: "servicios", description: "Internet fibra optica", amount: 120, recurring: true },
      { category: "personal", description: "Sueldo cajera quincenal", amount: 600, recurring: true },
      { category: "personal", description: "Sueldo repartidor quincenal", amount: 500, recurring: true },
      { category: "transporte", description: "Flete proveedor Lima (abarrotes)", amount: 350, recurring: false },
      { category: "marketing", description: "Publicidad Facebook e Instagram", amount: 200, recurring: true },
      { category: "limpieza", description: "Insumos limpieza del local", amount: 85, recurring: false },
      { category: "otros", description: "Mantenimiento refrigeradora", amount: 150, recurring: false },
    ];
    await prisma.$transaction(
      EXPENSES.map((e, i) => prisma.expense.create({
        data: { ...e, tenantId: tenant.id, date: new Date(Date.now() - i * 3 * 24 * 60 * 60 * 1000) },
      }))
    );
    console.log("✅ 10 gastos creados");

    // ── 6 Lotes con vencimiento ─────────────────────────────
    const BATCHES = [
      { productIdx: 6, lote: "LOTE-ATU-001", qty: 5, daysToExpiry: 3, category: "Abarrotes" },
      { productIdx: 8, lote: "LOTE-LEC-001", qty: 100, daysToExpiry: 15, category: "Lacteos" },
      { productIdx: 0, lote: "LOTE-ARR-001", qty: 200, daysToExpiry: 180, category: "Abarrotes" },
      { productIdx: 12, lote: "LOTE-INK-001", qty: 250, daysToExpiry: 365, category: "Bebidas" },
      { productIdx: 25, lote: "LOTE-PAN-001", qty: 18, daysToExpiry: 5, category: "Panaderia" },
      { productIdx: 10, lote: "LOTE-YOG-001", qty: 40, daysToExpiry: 7, category: "Lacteos" },
    ];
    for (const b of BATCHES) {
      const p = products[b.productIdx];
      await prisma.batch.create({
        data: {
          tenantId: tenant.id, lote: b.lote, productName: p.name, productCategory: b.category,
          quantity: b.qty, unit: "unidad", productId: p.id,
          entryDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          expiryDate: new Date(Date.now() + b.daysToExpiry * 24 * 60 * 60 * 1000),
          costUnit: (p.costPrice ?? p.price * 0.7) as number,
          supplierName: SUPPLIERS[b.productIdx % SUPPLIERS.length].name,
          supplierId: SUPPLIERS[b.productIdx % SUPPLIERS.length].id,
        },
      });
    }
    console.log("✅ 6 lotes creados");

    // ── 3 Promociones ───────────────────────────────────────
    await prisma.$transaction([
      prisma.promotion.create({ data: { id: "demo-promo-1", tenantId: tenant.id, name: "10% en Abarrotes", description: "Descuento en toda la seccion de abarrotes", discountPercent: 10, minPurchase: 20, active: true, expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) } }),
      prisma.promotion.create({ data: { id: "demo-promo-2", tenantId: tenant.id, name: "Delivery gratis +S/50", description: "Delivery gratis en pedidos mayores a S/50", discountPercent: 0, minPurchase: 50, message: "Delivery GRATIS +S/50", active: true, expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000) } }),
      prisma.promotion.create({ data: { id: "demo-promo-3", tenantId: tenant.id, name: "2x1 en Snacks", description: "Lleva 2 paga 1 en toda la linea de snacks", discountPercent: 50, active: true, targetType: "all", expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) } }),
    ]);
    console.log("✅ 3 promociones creadas");

    // ── Caja registradora con movimientos ───────────────────
    await prisma.cashRegister.create({
      data: {
        tenantId: tenant.id, openingAmount: 200, status: "abierta", notes: "Caja principal abierta",
        movements: {
          create: [
            { type: "ingreso", amount: 320, description: "Ventas efectivo manana", createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000) },
            { type: "ingreso", amount: 185, description: "Ventas efectivo tarde", createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000) },
            { type: "ingreso", amount: 95, description: "Cobro fiado Rosa Huanca", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
            { type: "egreso", amount: 350, description: "Pago flete proveedor Lima", createdAt: new Date(Date.now() - 1.5 * 60 * 60 * 1000) },
            { type: "egreso", amount: 65, description: "Compra bolsas plasticas", createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000) },
          ],
        },
      },
    });
    console.log("✅ Caja registradora + 5 movimientos");

    // ── 6 Reviews ───────────────────────────────────────────
    const REVIEWS = [
      { phone: CUSTOMERS[0].phone, name: CUSTOMERS[0].name, rating: 5, comment: "Excelente servicio! El delivery llego super rapido y todo completo. Recomendado 100%." },
      { phone: CUSTOMERS[1].phone, name: CUSTOMERS[1].name, rating: 4, comment: "Buenos precios y productos frescos. El unico detalle es que a veces demoran un poco." },
      { phone: CUSTOMERS[2].phone, name: CUSTOMERS[2].name, rating: 5, comment: "Me encanta poder pedir por Yape. Muy practico y seguro. Siempre pido aqui." },
      { phone: CUSTOMERS[3].phone, name: CUSTOMERS[3].name, rating: 5, comment: "La bodega del barrio pero digitalizada. Los combos son geniales y ahorras bastante." },
      { phone: CUSTOMERS[4].phone, name: CUSTOMERS[4].name, rating: 4, comment: "Buena variedad de productos. Me gustaria que tengan mas frutas y verduras." },
      { phone: CUSTOMERS[5].phone, name: CUSTOMERS[5].name, rating: 5, comment: "El sistema de fiados es lo mejor. Ya no tengo que andar apuntando en cuaderno." },
    ];
    for (let i = 0; i < REVIEWS.length; i++) {
      const r = REVIEWS[i];
      await prisma.review.create({
        data: { id: `demo-rev-${i}`, tenantId: tenant.id, phone: r.phone, name: r.name, rating: r.rating, text: r.comment, productId: products[i * 3 % products.length].id },
      });
    }
    console.log("✅ 6 reviews creadas");

    // ── 10 Registros de actividad ───────────────────────────
    const ACTIVITIES = [
      { action: "create", entity: "sale", detail: "Venta POS S/45.80 — Yape — Maria Cajera", user: "cajero" },
      { action: "create", entity: "order", detail: "Nuevo pedido #demo-ord-024 de Rosa Huanca — S/32.50", user: "sistema" },
      { action: "update", entity: "product", detail: "ALERTA: Atun Florida bajo stock (5 unidades, minimo 15)", user: "sistema" },
      { action: "create", entity: "product", detail: "Nuevo producto: Papa Blanca x kg — S/3.00", user: "demo" },
      { action: "update", entity: "purchase", detail: "Orden de compra OC-001 recibida de Distribuidora Lima SAC", user: "demo" },
      { action: "create", entity: "fiado", detail: "Nuevo fiado S/85.50 para Rosa Huanca — vence en 30 dias", user: "demo" },
      { action: "update", entity: "settings", detail: "Tema de la tienda actualizado (colores + fuente Inter)", user: "demo" },
      { action: "update", entity: "batch", detail: "LOTE-ATU-001 vence en 3 dias (5 unidades de Atun Florida)", user: "sistema" },
      { action: "create", entity: "promotion", detail: "Nueva promo: 2x1 en Snacks — activa por 3 dias", user: "demo" },
      { action: "create", entity: "cash", detail: "Ingreso caja: S/320 — Ventas efectivo manana", user: "cajero" },
    ];
    await prisma.$transaction(
      ACTIVITIES.map((a, i) => prisma.activityLog.create({
        data: { tenantId: tenant.id, action: a.action, entity: a.entity, detail: a.detail, user: a.user, createdAt: new Date(Date.now() - i * 45 * 60 * 1000) },
      }))
    );
    console.log("✅ 10 registros de actividad");

    console.log("\n🎉 DEMO PERMANENTE CREADO EXITOSAMENTE");
    console.log(`   Tenant: ${SLUG}`);
    console.log(`   Admin:  /t/${SLUG}/admin  (usuario: demo, clave: demo1234)`);
    console.log(`   Tienda: /t/${SLUG}`);
    console.log(`   Plan:   Enterprise (sin limite)`);
    console.log(`   Expira: Nunca (2099-12-31)`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("❌ Error:", err);
  process.exit(1);
});
