// Aplica la paleta de marca de CompraFácil (naranja) en settings.storeThemeJson.
// Solo esa tienda. Mergea sin pisar otras keys (features). Uso:
// DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/set-comprafacil-theme.ts
import { prisma } from "../lib/prisma";

// Paleta CompraFácil (literales hex → el storefront los aplica como override).
const THEME = {
  primaryColor: "#FF6B35",   // naranja de marca
  secondaryColor: "#1F2A44", // navy para contraste
  accentColor: "#FF9F1C",    // ámbar (ofertas/badges)
};

async function main() {
  const tenant = await prisma.tenant.findUnique({ where: { slug: "comprafacil" }, select: { id: true } });
  if (!tenant) throw new Error("comprafacil no existe");
  const s = await prisma.settings.findFirst({ where: { tenantId: tenant.id }, select: { id: true, storeThemeJson: true } });
  if (!s) throw new Error("Settings de comprafacil no existe");

  let theme: Record<string, unknown> = {};
  if (s.storeThemeJson) { try { theme = JSON.parse(s.storeThemeJson); } catch { theme = {}; } }
  Object.assign(theme, THEME);

  await prisma.settings.update({ where: { id: s.id }, data: { storeThemeJson: JSON.stringify(theme) } });
  console.log("✅ CompraFácil theme =", THEME);
  console.log("Keys en storeTheme:", Object.keys(theme).join(", "));
}

main().then(() => process.exit(0)).catch((e) => { console.error("❌", e); process.exit(1); });
