import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";
import { toNumOrZero } from "@/lib/decimal-utils";

// Rate limit: 1 demo por IP cada 30 minutos
const demoLimiter = createRateLimiter({ maxRequests: 1, windowMs: 30 * 60 * 1000 });

// ── Productos de ejemplo (abarrotes peruanos) ─────────────
const DEMO_PRODUCTS = [
  { name: "Arroz Costeño Extra 1kg",       price: 3.50,  stock: 80,  category: "Abarrotes" },
  { name: "Aceite Primor 1L",              price: 8.90,  stock: 40,  category: "Abarrotes" },
  { name: "Azúcar Rubia 1kg",              price: 4.20,  stock: 60,  category: "Abarrotes" },
  { name: "Leche Gloria Evaporada 400g",   price: 5.50,  stock: 50,  category: "Lácteos"   },
  { name: "Fideos Lavaggi Spaghetti 500g", price: 2.80,  stock: 90,  category: "Abarrotes" },
  { name: "Atún Florida en Agua 170g",     price: 4.50,  stock: 35,  category: "Abarrotes" },
  { name: "Inca Kola 500ml",               price: 2.50,  stock: 120, category: "Bebidas"   },
  { name: "Coca-Cola 500ml",               price: 2.50,  stock: 100, category: "Bebidas"   },
  { name: "Detergente Ariel 500g",         price: 7.90,  stock: 25,  category: "Limpieza"  },
  { name: "Jabón Bolivar 150g",            price: 1.80,  stock: 45,  category: "Limpieza"  },
  { name: "Papel Higiénico Elite x4",      price: 6.50,  stock: 30,  category: "Limpieza"  },
  { name: "Sal Marina Emsal 500g",         price: 1.20,  stock: 70,  category: "Abarrotes" },
  { name: "Mayonesa Alacena 100g",         price: 3.20,  stock: 40,  category: "Abarrotes" },
  { name: "Mantequilla Laive 100g",        price: 5.80,  stock: 20,  category: "Lácteos"   },
  { name: "Huevos Blancos x6",             price: 7.50,  stock: 55,  category: "Abarrotes" },
  { name: "Pan Molde Bimbo 500g",          price: 6.20,  stock: 18,  category: "Abarrotes" },
  { name: "Galletas Oreo 36g",             price: 1.50,  stock: 80,  category: "Snacks"    },
  { name: "Sublime 33g",                   price: 1.20,  stock: 100, category: "Snacks"    },
  { name: "Café Altomayo Instante 50g",    price: 4.80,  stock: 30,  category: "Bebidas"   },
  { name: "Milo 400g",                     price: 12.50, stock: 22,  category: "Bebidas"   },
];

// ── Clientes de ejemplo ───────────────────────────────────
const DEMO_CUSTOMERS = [
  { name: "Rosa Huanca",    phone: "987111001", email: "rosa.h@demo.pe"    },
  { name: "Carlos Ríos",   phone: "987111002", email: "carlos.r@demo.pe"  },
  { name: "Ana Vargas",    phone: "987111003", email: "ana.v@demo.pe"      },
  { name: "Miguel Soto",   phone: "987111004", email: "miguel.s@demo.pe"  },
  { name: "Lucía Paredes", phone: "987111005", email: "lucia.p@demo.pe"   },
];

/** Genera un slug random tipo "demo-a1b2c3" */
function randomDemoSlug(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let suffix = "";
  for (let i = 0; i < 6; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
  return `demo-${suffix}`;
}

export async function POST(req: NextRequest) {
  const _rl = await applyRateLimit(req, "STRICT", "demo-create"); if (_rl) return _rl;
  const traceId = newTraceId();

  // ── Rate limit: 1 demo / IP / 30 min ─────────────────────
  const ip = getClientIp(req);
  if (!demoLimiter.check(ip)) {
    return NextResponse.json(
      { error: "Solo se permite 1 demo por IP cada 30 minutos. Intenta más tarde." },
      { status: 429 }
    );
  }

  try {
    // ── Generar slug único ────────────────────────────────
    let slug = randomDemoSlug();
    for (let attempts = 0; attempts < 5; attempts++) {
      const exists = await prisma.tenant.findUnique({ where: { slug } });
      if (!exists) break;
      slug = randomDemoSlug();
    }

    // ── Expiración: 24 horas ──────────────────────────────
    const trialEndsAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

    // ── Crear Tenant ──────────────────────────────────────
    const tenant = await prisma.tenant.create({
      data: {
        slug,
        name: "Bodega Demo Enterprise",
        plan: "enterprise",
        type: "store",
        active: true,
        ownerEmail: `demo-${slug}@demo.internal`,
        ownerPhone: "999888777",
        trialEndsAt,
      },
    });

    // ── Crear AdminUser + Settings + Store ────────────────
    const passwordHash = await hash("demo1234", 10);
    await prisma.$transaction([
      prisma.adminUser.create({
        data: {
          tenantId: tenant.id,
          username: "demo",
          passwordHash,
          role: "admin",
          name: "Usuario Demo",
          active: true,
        },
      }),
      prisma.settings.create({
        data: {
          tenantId: tenant.id,
          businessName: "Bodega Demo Enterprise",
          mode: "checkout",
          cashEnabled: true,
          yapeEnabled: true,
          businessPhone: "999888777",
          businessAddress: "Jr. Ucayali 456, Pucallpa",
          primaryColor: "var(--accent)",
          secondaryColor: "#f97316",
          slogan: "Tu bodega digital de confianza",
          storeThemeJson: JSON.stringify({
            primaryColor: "var(--accent)",
            secondaryColor: "#f97316",
            accentColor: "var(--accent)",
            name: "Bodega Demo Enterprise",
            slogan: "Tu bodega digital de confianza",
            description: "Tienda demo con todos los modulos activos. Explora el sistema completo.",
            heroTitle: "Todo lo que necesitas, en tu puerta",
            heroSubtitle: "Delivery rapido en Pucallpa. Paga con Yape o efectivo.",
            heroCTA: "Ver productos",
            whatsapp: "999888777",
            phone: "999888777",
            address: "Jr. Ucayali 456, Pucallpa",
            fontFamily: "inter",
            sections: ["announcement", "hero", "categories", "popular", "deals", "combos", "recipes", "testimonials", "faq", "contact", "delivery_map"],
            sectionOrder: ["announcement", "hero", "categories", "popular", "deals", "combos", "recipes", "testimonials", "faq", "contact", "delivery_map"],
          }),
        },
      }),
      prisma.store.create({
        data: {
          tenantId: tenant.id,
          slug,
          name: "Bodega Demo Enterprise",
          isPublished: true,
        },
      }),
    ]);

    // ── Seed 20 productos ─────────────────────────────────
    await prisma.product.createMany({
      data: DEMO_PRODUCTS.map((p) => ({
        tenantId: tenant.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
        category: p.category,   // campo correcto del schema
        active: true,
      })),
    });

    // ── Seed 5 clientes ───────────────────────────────────
    // Customer usa phone como PK, agregar sufijo del tenant para evitar colisiones entre demos
    const suffix = slug.slice(-4); // últimos 4 chars del slug, ej "a1b2"
    await prisma.$transaction(
      DEMO_CUSTOMERS.map((c) =>
        prisma.customer.create({
          data: {
            tenantId: tenant.id,
            name: c.name,
            phone: `${c.phone}${suffix}`,   // phone es PK — hacerlo único por demo
            email: c.email,
          },
        })
      )
    );

    const customers = await prisma.customer.findMany({
      where: { tenantId: tenant.id },
      select: { phone: true, name: true },
    });

    // ── Seed 15 pedidos variados ────────────────────────
    // TD-018: price es Decimal en DB — convertir a number para aritmética en seeds
    const productsRaw = await prisma.product.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, price: true },
    });
    const products = productsRaw.map((p) => ({
      ...p,
      price: toNumOrZero(p.price),
    }));

    const orderStatuses = ["entregado", "entregado", "entregado", "entregado", "entregado",
      "entregado", "entregado", "pendiente", "pendiente", "pendiente",
      "confirmado", "confirmado", "en_camino", "en_camino", "cancelado"] as const;

    for (let i = 0; i < 15; i++) {
      const customer = customers[i % customers.length];
      const p1 = products[i * 2 % products.length];
      const p2 = products[(i * 2 + 1) % products.length];
      const p3 = products[(i * 3) % products.length];
      const qty1 = (i % 3) + 1;
      const qty2 = (i % 2) + 1;
      const qty3 = i % 4 === 0 ? 2 : 0;
      const total = p1.price * qty1 + p2.price * qty2 + (qty3 > 0 ? p3.price * qty3 : 0);

      await prisma.order.create({
        data: {
          id: `demo-${slug}-ord-${i}`,
          tenantId: tenant.id,
          customerPhone: customer.phone,
          customerName: customer.name,
          status: orderStatuses[i],
          total,
          paymentMethod: ["cash", "yape", "plin", "cash", "yape"][i % 5],
          customerLocation: ["Jr. Ucayali 123", "Av. Centenario 456", "Jr. Tarapaca 789", "Av. Yarinacocha km 3", "Jr. Padre Abad 321"][i % 5],
          createdAt: new Date(Date.now() - (15 - i) * 3 * 60 * 60 * 1000),
          items: {
            create: [
              { productId: p1.id, name: p1.name, price: p1.price, quantity: qty1, unit: "unidad" },
              { productId: p2.id, name: p2.name, price: p2.price, quantity: qty2, unit: "unidad" },
              ...(qty3 > 0 ? [{ productId: p3.id, name: p3.name, price: p3.price, quantity: qty3, unit: "unidad" }] : []),
            ],
          },
        },
      });
    }

    // ── Seed 3 proveedores ───────────────────────────────
    const DEMO_SUPPLIERS = [
      { id: `sup-${slug}-1`, name: "Distribuidora Lima SAC", ruc: "20512345678", phone: "014567890", email: "ventas@distrilima.pe", address: "Av. Argentina 2145, Lima" },
      { id: `sup-${slug}-2`, name: "Mayorista Ucayali EIRL", ruc: "20198765432", phone: "061789456", email: "pedidos@mayorucayali.pe", address: "Jr. Inmaculada 890, Pucallpa" },
      { id: `sup-${slug}-3`, name: "Bebidas del Oriente SA", ruc: "20345678901", phone: "061654321", email: "contacto@bebidasoriente.pe", address: "Av. Centenario km 5, Pucallpa" },
    ];
    await prisma.$transaction(
      DEMO_SUPPLIERS.map((s) => prisma.supplier.create({
        data: { ...s, tenantId: tenant.id, estado: "activo", tipoPersona: "juridica", tipoDocumento: "RUC", documento: s.ruc },
      }))
    );

    // ── Seed 5 ordenes de compra a proveedores ──────────
    for (let i = 0; i < 5; i++) {
      const sup = DEMO_SUPPLIERS[i % 3];
      const p1 = products[i % products.length];
      const p2 = products[(i + 3) % products.length];
      const purchaseStatuses = ["recibido", "recibido", "recibido", "pendiente", "parcial"] as const;
      await prisma.purchaseOrder.create({
        data: {
          id: `demo-${slug}-po-${i}`,
          tenantId: tenant.id,
          supplierId: sup.id,
          supplierName: sup.name,
          total: (p1.price * 50) + (p2.price * 30),
          status: purchaseStatuses[i],
          paymentMethod: i % 2 === 0 ? "transferencia" : "efectivo",
          deliveryDate: new Date(Date.now() + (i - 2) * 24 * 60 * 60 * 1000),
          createdAt: new Date(Date.now() - (5 - i) * 48 * 60 * 60 * 1000),
          items: {
            create: [
              { productId: p1.id, name: p1.name, quantity: 50, unitCost: p1.price * 0.7, unit: "unidad" },
              { productId: p2.id, name: p2.name, quantity: 30, unitCost: p2.price * 0.7, unit: "unidad" },
            ],
          },
        },
      });
    }

    // ── Seed 8 ventas POS (registros de caja) ───────────
    for (let i = 0; i < 8; i++) {
      const p1 = products[i % products.length];
      const p2 = products[(i + 1) % products.length];
      const saleTotal = p1.price * 2 + p2.price;
      await prisma.sale.create({
        data: {
          id: `demo-${slug}-sale-${i}`,
          tenantId: tenant.id,
          total: saleTotal,
          totalCogs: saleTotal * 0.65,
          payment: ["efectivo", "yape", "plin", "efectivo"][i % 4],
          amountPaid: i % 3 === 0 ? Math.ceil(saleTotal / 10) * 10 : saleTotal,
          change: i % 3 === 0 ? Math.ceil(saleTotal / 10) * 10 - saleTotal : 0,
          customerPhone: customers[i % customers.length].phone,
          cashierId: "demo",
          comprobanteTipo: i % 3 === 0 ? "boleta" : "ticket",
          createdAt: new Date(Date.now() - (8 - i) * 2 * 60 * 60 * 1000),
          items: {
            create: [
              { productId: p1.id, name: p1.name, quantity: 2, price: p1.price, unit: "unidad" },
              { productId: p2.id, name: p2.name, quantity: 1, price: p2.price, unit: "unidad" },
            ],
          },
        },
      });
    }

    // ── Seed 3 fiados ────────────────────────────────────
    for (let i = 0; i < 3; i++) {
      const c = customers[i];
      const montos = [45.50, 82.00, 23.80];
      const saldos = [45.50, 32.00, 0];
      const estados = ["ACTIVO", "ACTIVO", "PAGADO"] as const;
      await prisma.fiado.create({
        data: {
          tenantId: tenant.id,
          customerId: c.phone,
          total: montos[i],
          saldo: saldos[i],
          descripcion: [`Fiado de abarrotes semana`, `Fiado de bebidas y snacks`, `Fiado liquidado completo`][i],
          status: estados[i],
          fechaVence: new Date(Date.now() + (i + 1) * 7 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // ── Seed 6 gastos operativos ─────────────────────────
    const DEMO_EXPENSES = [
      { category: "alquiler", description: "Alquiler local mes de marzo", amount: 1200 },
      { category: "servicios", description: "Luz + agua marzo", amount: 350 },
      { category: "personal", description: "Sueldo cajero quincenal", amount: 600 },
      { category: "transporte", description: "Flete proveedor Lima", amount: 180 },
      { category: "limpieza", description: "Productos de limpieza tienda", amount: 85 },
      { category: "marketing", description: "Publicidad Facebook/Instagram", amount: 150 },
    ];
    await prisma.$transaction(
      DEMO_EXPENSES.map((e, i) => prisma.expense.create({
        data: {
          ...e,
          tenantId: tenant.id,
          date: new Date(Date.now() - i * 4 * 24 * 60 * 60 * 1000),
          recurring: i < 3,
        },
      }))
    );

    // ── Seed 4 lotes con fechas de vencimiento ──────────
    for (let i = 0; i < 4; i++) {
      const p = products[i];
      await prisma.batch.create({
        data: {
          tenantId: tenant.id,
          lote: `LOTE-${slug}-${i + 1}`,
          productName: p.name,
          productCategory: ["Abarrotes", "Lacteos", "Bebidas", "Snacks"][i],
          quantity: [100, 50, 80, 60][i],
          unit: "unidad",
          entryDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000),
          expiryDate: new Date(Date.now() + [3, 30, 90, 180][i] * 24 * 60 * 60 * 1000),
          costUnit: p.price * 0.7,
          productId: p.id,
          supplierName: DEMO_SUPPLIERS[i % 3].name,
          supplierId: DEMO_SUPPLIERS[i % 3].id,
        },
      });
    }

    // ── Seed 2 promociones activas ──────────────────────
    await prisma.$transaction([
      prisma.promotion.create({
        data: {
          id: `demo-${slug}-promo-1`,
          tenantId: tenant.id,
          name: "10% en Abarrotes",
          description: "Descuento en toda la seccion de abarrotes esta semana",
          discountPercent: 10,
          minPurchase: 20,
          active: true,
          targetType: "all",
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      }),
      prisma.promotion.create({
        data: {
          id: `demo-${slug}-promo-2`,
          tenantId: tenant.id,
          name: "Delivery gratis +S/50",
          description: "Delivery gratis en pedidos mayores a S/50",
          discountPercent: 0,
          minPurchase: 50,
          message: "Delivery GRATIS en compras mayores a S/50",
          active: true,
          targetType: "all",
          expiresAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
        },
      }),
    ]);

    // ── Seed 1 caja registradora abierta ────────────────
    await prisma.cashRegister.create({
      data: {
        tenantId: tenant.id,
        openingAmount: 200,
        status: "abierta",
        notes: "Caja demo abierta con S/200 de fondo",
        movements: {
          create: [
            { type: "ingreso", amount: 150, description: "Ventas efectivo manana", createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000) },
            { type: "ingreso", amount: 85, description: "Ventas efectivo tarde", createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) },
            { type: "egreso", amount: 50, description: "Pago flete proveedor", createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000) },
          ],
        },
      },
    });

    // ── Seed 3 reviews de clientes ──────────────────────
    for (let i = 0; i < 3; i++) {
      const c = customers[i];
      await prisma.review.create({
        data: {
          id: `demo-${slug}-review-${i}`,
          tenantId: tenant.id,
          phone: c.phone,
          name: c.name,
          rating: [5, 4, 5][i],
          text: [
            "Excelente servicio, el delivery llego rapido y todo completo",
            "Buenos precios y productos frescos. Recomendado.",
            "Me encanta poder pedir por Yape. Muy practico!",
          ][i],
          productId: products[i].id,
        },
      });
    }

    // ── Seed 5 registros de actividad ───────────────────
    const DEMO_ACTIVITIES = [
      { action: "product_created", entity: "product", detail: "Se agrego Arroz Costeno Extra 1kg", user: "demo" },
      { action: "order_created", entity: "order", detail: "Nuevo pedido #1845 de Rosa Huanca", user: "sistema" },
      { action: "sale_completed", entity: "sale", detail: "Venta POS S/45.80 - Yape", user: "demo" },
      { action: "settings_updated", entity: "settings", detail: "Se actualizo el tema de la tienda", user: "demo" },
      { action: "stock_alert", entity: "product", detail: "Atun Florida bajo stock (2 unidades)", user: "sistema" },
    ];
    await prisma.$transaction(
      DEMO_ACTIVITIES.map((a, i) => prisma.activityLog.create({
        data: {
          tenantId: tenant.id,
          action: a.action,
          entity: a.entity,
          detail: a.detail,
          user: a.user,
          createdAt: new Date(Date.now() - i * 60 * 60 * 1000),
        },
      }))
    );

    return NextResponse.json(
      {
        slug,
        username: "demo",
        password: "demo1234",
        expiresIn: "24 horas",
        adminUrl: `/t/${slug}/admin`,
        storeUrl: `/t/${slug}`,
        trialEndsAt: trialEndsAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
