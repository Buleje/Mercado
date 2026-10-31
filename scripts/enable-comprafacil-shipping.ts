// Prende el flag "shipping" (barra de envío gratis) + umbral en CompraFácil.
// Idempotente. Uso: DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/enable-comprafacil-shipping.ts
import { prisma } from "../lib/prisma";

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "comprafacil" }, select: { id: true } });
  if (!tenant) throw new Error("comprafacil no existe");
  const s = await prisma.settings.findFirst({ where: { tenantId: tenant.id }, select: { id: true, storeThemeJson: true } });
  if (!s) throw new Error("Settings de comprafacil no existe");

  let theme: Record<string, unknown> = {};
  if (s.storeThemeJson) { try { theme = JSON.parse(s.storeThemeJson); } catch { theme = {}; } }

  const features = new Set(Array.isArray(theme.features) ? (theme.features as string[]) : []);
  features.add("shipping");
  theme.features = Array.from(features);
  theme.freeShippingThreshold = 99;

  await prisma.settings.update({ where: { id: s.id }, data: { storeThemeJson: JSON.stringify(theme) } });
  console.log("✅ features =", theme.features, "| freeShippingThreshold =", theme.freeShippingThreshold);
}
main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
