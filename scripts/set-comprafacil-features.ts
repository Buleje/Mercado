// Prende los bloques PRO en CompraFácil (solo esa tienda) mergeando en
// settings.storeThemeJson.features. Uso:
// DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/set-comprafacil-features.ts
import { prisma } from "../lib/prisma";

const FEATURES = ["trust", "urgency", "content", "capture"];

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "comprafacil" }, select: { id: true } });
  if (!tenant) throw new Error("comprafacil no existe");
  const s = await prisma.settings.findFirst({ where: { tenantId: tenant.id }, select: { id: true, storeThemeJson: true } });
  if (!s) throw new Error("Settings de comprafacil no existe");

  let theme: Record<string, unknown> = {};
  if (s.storeThemeJson) { try { theme = JSON.parse(s.storeThemeJson); } catch { theme = {}; } }
  theme.features = FEATURES;

  await prisma.settings.update({ where: { id: s.id }, data: { storeThemeJson: JSON.stringify(theme) } });
  console.log("✅ CompraFácil features =", FEATURES);
  console.log("Storefront: http://localhost:3000/t/comprafacil");
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
