// ¿Una clase de utilidad existe en el CSS que el admin carga de verdad? Inyecta un div con la clase
// y lee el estilo computado. Uso: node scripts/dev-helpers/admin-css-probe.mjs z-modal z-modal-2 z-dropdown z-system
import { chromium } from "playwright";
const BASE = "http://localhost:3000", SLUG = "main"; const CLASES = process.argv.slice(2);
const browser = await chromium.launch(); const page = await (await browser.newContext()).newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG } });
if (login.status() !== 200) { console.error("login", login.status()); process.exit(1); }
await page.goto(`${BASE}/admin?tab=pedidos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForSelector("main h1, [data-admin-tabbar]", { timeout: 40_000 }).catch(() => {});
const r = await page.evaluate((clases) => {
  const out = {};
  for (const c of clases) { const d = document.createElement("div"); d.className = `fixed inset-0 ${c}`; document.body.appendChild(d); out[c] = getComputedStyle(d).zIndex; d.remove(); }
  const hojas = [...document.styleSheets].map((s) => s.href).filter(Boolean);
  const vars = getComputedStyle(document.documentElement).getPropertyValue("--z-modal").trim();
  return { out, hojas: hojas.length, varZModal: vars || "(sin var)" };
}, CLASES);
console.log(`hojas de estilo: ${r.hojas} · --z-modal en :root = ${r.varZModal}`);
for (const [c, z] of Object.entries(r.out)) console.log(`  .${c.padEnd(11)} → z-index computado: ${z}`);
await browser.close();
