import { NextRequest, NextResponse } from "next/server";
import { hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import { toErrorPayload, newTraceId } from "@/lib/api-error";

export const dynamic = "force-dynamic";

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
        name: "Bodega Demo",
        plan: "free",
        type: "store",
        active: true,
        ownerEmail: `demo-${slug}@demo.internal`,
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
          businessName: "Bodega Demo",
          mode: "checkout",
          cashEnabled: true,
          yapeEnabled: false,
        },
      }),
      prisma.store.create({
        data: {
          tenantId: tenant.id,
          slug,
          name: "Bodega Demo",
          isPublished: false,
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

    // ── Seed 10 pedidos de ejemplo ────────────────────────
    const products = await prisma.product.findMany({
      where: { tenantId: tenant.id },
      select: { id: true, name: true, price: true },
    });

    for (let i = 0; i < 10; i++) {
      const customer = customers[i % customers.length];
      const p1 = products[i * 2 % products.length];
      const p2 = products[(i * 2 + 1) % products.length];
      const qty1 = (i % 3) + 1;
      const qty2 = (i % 2) + 1;
      const total = p1.price * qty1 + p2.price * qty2;

      // OrderStatus enum: pendiente | confirmado | en_camino | entregado | cancelado
      const statusList = ["entregado", "entregado", "entregado", "entregado",
                          "entregado", "entregado", "pendiente", "pendiente",
                          "confirmado", "confirmado"] as const;

      await prisma.order.create({
        data: {
          id: `demo-${slug}-ord-${i}`,
          tenantId: tenant.id,
          customerPhone: customer.phone,
          customerName: customer.name,
          status: statusList[i],
          total,
          paymentMethod: i % 2 === 0 ? "cash" : "yape",
          createdAt: new Date(Date.now() - (10 - i) * 60 * 60 * 1000),
          items: {
            create: [
              { productId: p1.id, name: p1.name, price: p1.price, quantity: qty1, unit: "unidad" },
              { productId: p2.id, name: p2.name, price: p2.price, quantity: qty2, unit: "unidad" },
            ],
          },
        },
      });
    }

    return NextResponse.json(
      {
        slug,
        username: "demo",
        password: "demo1234",
        expiresIn: "24 horas",
        adminUrl: `/t/${slug}/admin`,
        trialEndsAt: trialEndsAt.toISOString(),
      },
      { status: 201 }
    );
  } catch (err) {
    const { payload, status } = toErrorPayload(err, traceId);
    return NextResponse.json(payload, { status });
  }
}
