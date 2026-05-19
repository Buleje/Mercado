#!/usr/bin/env node
/**
 * scripts/e2e/seed-e2e.mjs
 *
 * Seed de datos E2E para Playwright.
 * Crea fixtures idempotentes (upsert) en la DB local.
 *
 * Uso:
 *   node -r dotenv/config scripts/e2e/seed-e2e.mjs --env-file=.env.test
 *   # o con dotenv-cli:
 *   npx dotenv -e .env.test -- node scripts/e2e/seed-e2e.mjs
 *
 * Al terminar imprime los IDs que Brandon debe copiar al .env.test:
 *   TENANT_ID=<uuid>
 *   DELIVERY_ORDER_ID=<id>
 *
 * IDEMPOTENTE: puede correrse multiples veces sin duplicar datos.
 * El cliente RTBF (dni=99999999) se recrea en cada run (DELETE + INSERT).
 * NO borra datos existentes de produccion ni otros tenants.
 */

import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";

// -- Config -------------------------------------------------------------------

const TENANT_MAIN_SLUG = "main";
const TENANT_B_SLUG = "mi-pollo";

const CUSTOMER_PHONE = "987654321";
const CUSTOMER_DNI = "12345678";
const CUSTOMER_NAME = "Cliente E2E Test";

const RTBF_PHONE = "999000001"; // telefono unico para el cliente descartable
const RTBF_DNI = "99999999";
const RTBF_NAME = "RTBF Descartable E2E";

const DELIVERY_USERNAME = "delivery_e2e";
const DELIVERY_PASSWORD = "Delivery-2026-E2E";
const DELIVERY_NAME = "Repartidor E2E Test";

// -- Main ---------------------------------------------------------------------

const prisma = new PrismaClient({
  log: ["error"],
});

async function main() {
  console.log("\n[seed-e2e] Iniciando seed de fixtures E2E...\n");

  // 1. Tenant "main" ----------------------------------------------------------
  const tenantMain = await prisma.tenant.upsert({
    where: { slug: TENANT_MAIN_SLUG },
    update: {
      active: true,
      plan: "pro",
    },
    create: {
      id: randomUUID(),
      slug: TENANT_MAIN_SLUG,
      name: "Buleje - Main E2E",
      plan: "pro",
      active: true,
      industry: "bodega",
      primaryColor: "#00B4A6",
      secondaryColor: "#f4a261",
    },
  });
  console.log(`[1/6] Tenant "main":   ${tenantMain.id}`);

  // 2. Tenant "mi-pollo" (tenant B para tests de aislamiento) -----------------
  const tenantB = await prisma.tenant.upsert({
    where: { slug: TENANT_B_SLUG },
    update: { active: true },
    create: {
      id: randomUUID(),
      slug: TENANT_B_SLUG,
      name: "Mi Pollo E2E",
      plan: "free",
      active: true,
      industry: "restaurante",
      primaryColor: "#FF6B35",
      secondaryColor: "#FFD166",
    },
  });
  console.log(`[2/6] Tenant "mi-pollo": ${tenantB.id}`);

  // 3. Cliente principal (phone=987654321, DNI=12345678) ----------------------
  // Customer usa phone como PK temporal (TD-040 Phase 1)
  const customer = await prisma.customer.upsert({
    where: { phone: CUSTOMER_PHONE },
    update: {
      name: CUSTOMER_NAME,
      documento: CUSTOMER_DNI,
      tipoDocumento: "DNI",
      estado: "activo",
    },
    create: {
      phone: CUSTOMER_PHONE,
      name: CUSTOMER_NAME,
      location: "Jr. E2E 123, Pucallpa",
      documento: CUSTOMER_DNI,
      tipoDocumento: "DNI",
      tipoPersona: "natural",
      estado: "activo",
    },
  });
  console.log(`[3/6] Customer principal: ${customer.id} (phone: ${customer.phone})`);

  // 4. Cliente RTBF descartable (phone unico, dni=99999999) -------------------
  // DELETE + INSERT para garantizar estado limpio en cada run
  await prisma.customer.deleteMany({ where: { phone: RTBF_PHONE } });
  const rtbfCustomer = await prisma.customer.create({
    data: {
      phone: RTBF_PHONE,
      name: RTBF_NAME,
      location: "Jr. RTBF 999, Pucallpa",
      documento: RTBF_DNI,
      tipoDocumento: "DNI",
      tipoPersona: "natural",
      estado: "activo",
      email: "rtbf-e2e@test.local",
    },
  });
  console.log(`[4/6] Customer RTBF:  ${rtbfCustomer.id} (DNI: ${RTBF_DNI}) -- recreado`);

  // 5. AdminUser repartidor en tenant "main" ----------------------------------
  const passwordHash = await bcrypt.hash(DELIVERY_PASSWORD, 10);
  const deliveryUser = await prisma.adminUser.upsert({
    where: {
      tenantId_username: {
        tenantId: tenantMain.id,
        username: DELIVERY_USERNAME,
      },
    },
    update: {
      passwordHash,
      active: true,
      name: DELIVERY_NAME,
    },
    create: {
      tenantId: tenantMain.id,
      username: DELIVERY_USERNAME,
      passwordHash,
      role: "repartidor",
      name: DELIVERY_NAME,
      active: true,
    },
  });
  console.log(`[5/6] AdminUser repartidor: ${deliveryUser.id} (username: ${DELIVERY_USERNAME})`);

  // 6. Orden asignada al repartidor (status=confirmado) -----------------------
  const orderId = `E2E-DELIVERY-${Date.now()}`;
  const deliveryOrder = await prisma.order.create({
    data: {
      id: orderId,
      tenantId: tenantMain.id,
      customerName: CUSTOMER_NAME,
      customerPhone: CUSTOMER_PHONE,
      total: 25.0,
      status: "confirmado",
      paymentMethod: "efectivo",
      source: "direct",
      deliveryStatus: "preparing",
      driverId: deliveryUser.id,
      notes: "Orden E2E para tests de repartidor -- safe to delete",
      items: {
        create: [
          {
            productId: null,
            productName: "Producto E2E Test",
            qty: 1,
            unitPrice: 25.0,
            total: 25.0,
          },
        ],
      },
    },
  });
  console.log(`[6/6] Order delivery:  ${deliveryOrder.id} (status: confirmado)`);

  // -- Output final -----------------------------------------------------------
  console.log("\n" + "-".repeat(60));
  console.log("COPIAR estas lineas al .env.test:\n");
  console.log(`E2E_TENANT_ID=${tenantMain.id}`);
  console.log(`E2E_DELIVERY_ORDER_ID=${deliveryOrder.id}`);
  console.log(`E2E_CUSTOMER_PHONE=${CUSTOMER_PHONE}`);
  console.log(`E2E_CUSTOMER_DNI=${CUSTOMER_DNI}`);
  console.log(`E2E_RTBF_CUSTOMER_DNI=${RTBF_DNI}`);
  console.log(`E2E_DELIVERY_USER=${DELIVERY_USERNAME}`);
  console.log(`E2E_DELIVERY_PASSWORD=${DELIVERY_PASSWORD}`);
  console.log("-".repeat(60) + "\n");
  console.log("[seed-e2e] Listo. Ejecuta: npx playwright test\n");
}

main()
  .catch((e) => {
    console.error("[seed-e2e] ERROR:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
