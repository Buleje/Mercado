#!/usr/bin/env node
/**
 * scripts/setup-stripe-plans.mjs
 *
 * Crea (o reusa si ya existen por nombre) los 3 productos de pago de Buleje
 * en Stripe + sus precios mensuales recurrentes en PEN. Devuelve los Price IDs
 * para pegarlos en `lib/billing/plan-tiers.ts`.
 *
 * Uso:
 *   node -r dotenv/config scripts/setup-stripe-plans.mjs dotenv_config_path=.env.local
 */

import Stripe from "stripe";

const sk = process.env.STRIPE_SECRET_KEY;
if (!sk || !sk.startsWith("sk_")) {
  console.error("❌ Falta STRIPE_SECRET_KEY en el entorno.");
  process.exit(1);
}

const stripe = new Stripe(sk, { apiVersion: "2024-12-18.acacia" });

const PLANS = [
  {
    tier: "pro",
    name: "Buleje Pro",
    description: "Crece sin frenos. SUNAT, compras, analytics, marketplace y delivery integrado.",
    amount: 4900, // S/ 49.00 — Stripe usa céntimos
  },
  {
    tier: "enterprise",
    name: "Buleje Enterprise",
    description: "Para cadenas. IA Command, forecasting, multi-sucursal, subscriptions y socio.",
    amount: 14900, // S/ 149.00
  },
  {
    tier: "max",
    name: "Buleje Max",
    description: "Todo desbloqueado. Lives streaming, white-label, soporte 24/7 e IA premium.",
    amount: 29900, // S/ 299.00
  },
];

console.log(`\n🛍  Setup Stripe — modo: ${sk.startsWith("sk_test") ? "TEST" : "LIVE"}\n`);

const results = {};

for (const plan of PLANS) {
  // 1. Producto: buscar por nombre o crear
  const existing = await stripe.products.list({ limit: 100 });
  let product = existing.data.find((p) => p.name === plan.name);

  if (product) {
    console.log(`✓ Producto existente: ${plan.name} (${product.id})`);
  } else {
    product = await stripe.products.create({
      name: plan.name,
      description: plan.description,
      metadata: { tier: plan.tier, source: "buleje-setup-script" },
    });
    console.log(`+ Producto creado: ${plan.name} (${product.id})`);
  }

  // 2. Precio: buscar el precio activo en PEN/mensual del producto, o crear
  const prices = await stripe.prices.list({ product: product.id, active: true, limit: 100 });
  let price = prices.data.find(
    (p) =>
      p.currency === "pen" &&
      p.recurring?.interval === "month" &&
      p.unit_amount === plan.amount,
  );

  if (price) {
    console.log(`  ✓ Precio existente: S/${plan.amount / 100}/mes → ${price.id}`);
  } else {
    price = await stripe.prices.create({
      product: product.id,
      currency: "pen",
      unit_amount: plan.amount,
      recurring: { interval: "month" },
      metadata: { tier: plan.tier },
    });
    console.log(`  + Precio creado: S/${plan.amount / 100}/mes → ${price.id}`);
  }

  results[plan.tier] = { productId: product.id, priceId: price.id };
}

console.log("\n✅ Listo. Pegá esto en lib/billing/plan-tiers.ts:\n");
console.log("export const STRIPE_PRICE_IDS = {");
for (const [tier, ids] of Object.entries(results)) {
  console.log(`  ${tier}: "${ids.priceId}",`);
}
console.log("};\n");

console.log("📋 Resumen completo:");
console.table(
  Object.fromEntries(
    Object.entries(results).map(([k, v]) => [k, { productId: v.productId, priceId: v.priceId }]),
  ),
);
