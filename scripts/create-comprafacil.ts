// Fase 1 — Crea la tienda standalone "CompraFácil" (white-label, dominio propio
// a futuro), fuera del grid del marketplace (Store.isPublished=false), gestionada
// desde el mismo panel admin. Idempotente. Uso: npx tsx -r dotenv/config scripts/create-comprafacil.ts
// Usa prisma directo (replica tenant-onboarding.db.ts, que no corre fuera de Next por `server-only`).
import { prisma } from "../lib/prisma";
import { hash } from "bcryptjs";

const SLUG = "comprafacil";
const STORE_NAME = "CompraFácil";
const OWNER_EMAIL = "bulejebrandonluis7575@gmail.com";
const ADMIN_USER = "comprafacil";
const ADMIN_PASS = "Compra-facil-1234";
const CATEGORIES = ["Tecnología", "Hogar", "Accesorios"];

const DEMO_PRODUCTS = [
  { name: "Reloj inteligente deportivo", category: "Tecnología", price: 89.9 },
  { name: "Auriculares Bluetooth TWS", category: "Tecnología", price: 49.9 },
  { name: "Lámpara LED de escritorio plegable", category: "Hogar", price: 34.9 },
  { name: "Botella térmica acero inoxidable 750ml", category: "Hogar", price: 29.9 },
  { name: "Organizador de cables magnético (set x6)", category: "Accesorios", price: 19.9 },
];

async function main() {
  let tenantId: string;
  const existing = await prisma.tenant.findUnique({ where: { slug: SLUG }, select: { id: true } });

  if (existing) {
    tenantId = existing.id;
    console.log(`• Tenant '${SLUG}' ya existe (${tenantId}) — actualizo branding/productos.`);
  } else {
    const t = await prisma.$transaction(async (tx) => {
      const created = await tx.tenant.create({
        data: {
          slug: SLUG, name: STORE_NAME, plan: "enterprise", type: "store", active: true,
          ownerEmail: OWNER_EMAIL, industry: "otro",
          primaryColor: "#FF6B35", secondaryColor: "#1F2A44",
          trialEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      await tx.store.create({ data: { tenantId: created.id, slug: SLUG, name: STORE_NAME, isPublished: false } });
      return created;
    });
    tenantId = t.id;
    console.log(`✅ Tenant + Store creados: ${t.slug} (${t.id}) · isPublished=false`);
  }

  // Admin + Settings (idempotente)
  const hasAdmin = (await prisma.adminUser.count({ where: { tenantId } })) > 0;
  if (!hasAdmin) {
    const passwordHash = await hash(ADMIN_PASS, 12);
    await prisma.$transaction([
      prisma.adminUser.create({
        data: { tenantId, username: ADMIN_USER, passwordHash, role: "admin", name: "Brandon", active: true },
      }),
      prisma.settings.create({
        data: {
          tenantId, businessName: STORE_NAME, mode: "checkout", cashEnabled: true, yapeEnabled: false,
          productCategoriesJson: JSON.stringify(CATEGORIES),
        },
      }),
    ]);
    console.log(`✅ AdminUser + Settings creados: ${ADMIN_USER} / ${ADMIN_PASS}`);
  } else {
    console.log("• AdminUser ya existía.");
  }

  // Branding (re-aplica por idempotencia)
  await prisma.tenant.update({
    where: { id: tenantId },
    data: { name: STORE_NAME, primaryColor: "#FF6B35", secondaryColor: "#1F2A44", industry: "otro" },
  });

  // Productos demo (solo si no hay)
  const count = await prisma.product.count({ where: { tenantId } });
  if (count === 0) {
    await prisma.product.createMany({
      data: DEMO_PRODUCTS.map((p) => ({ tenantId, name: p.name, category: p.category, price: p.price, stock: 50, active: true })),
    });
    console.log(`✅ ${DEMO_PRODUCTS.length} productos demo creados.`);
  } else {
    console.log(`• Ya hay ${count} productos — no se agregan demo.`);
  }

  console.log("\n──────── RESUMEN ────────");
  console.log(`Tienda:     ${STORE_NAME}  (slug: ${SLUG})`);
  console.log(`Storefront: http://localhost:3000/marketplace/${SLUG}`);
  console.log(`Admin:      ${ADMIN_USER} / ${ADMIN_PASS}`);
  console.log(`Estado:     standalone (isPublished=false → NO en el grid del marketplace)`);
  console.log(`Dominio:    pendiente — Tenant.customDomain='comprafacil.com' + DNS`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌ Error:", e); process.exit(1); });
