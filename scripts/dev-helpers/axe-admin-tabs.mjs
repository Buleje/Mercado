// Auditoría de accesibilidad REAL del panel admin: axe-core (WCAG 2.1 A/AA)
// corrido sobre cada pestaña ya montada, en el navegador, con sesión de QA.
//
// Por qué además del censo estático: el censo cuenta tags en el código; axe
// mide lo que el lector de pantalla recibe (nombre accesible calculado, rol,
// contraste del píxel). Un `title` o un `<Field>` que asocia el id se ven
// «sin label» en el código y están bien en el DOM — y al revés.
//
// Uso (desde el repo, dev server en :3000):
//   node scripts/dev-helpers/axe-admin-tabs.mjs <out.json> <tab1,tab2,…> [light|dark]
//   SLUG=<tenant> node … para otro tenant.
// Salida: JSON { tab: { reglaId: { impact, nodes, muestras[] } } } + tabla resumen.
import { chromium } from "playwright";
import { AxeBuilder } from "@axe-core/playwright";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3000", SLUG = process.env.SLUG || "main";
const OUT = process.argv[2] || "reports/a11y/axe-admin.json";
const TABS = (process.argv[3] || "dashboard,pedidos,inventario").split(",");
const THEME = process.argv[4] || "light";

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login", login.status()); process.exit(1); }

const out = {};
const totales = new Map();
for (const tab of TABS) {
  try {
    await page.goto(`${BASE}/t/${SLUG}/admin?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.evaluate(({ t, slug }) => {
      try {
        localStorage.setItem(`onboarding-completed-${slug}`, "1");
        localStorage.setItem("buleje-tour-marketplace-2026-04", "1");
        sessionStorage.setItem("buleje-theme-session-v2", t);
      } catch {}
    }, { t: THEME, slug: SLUG });
    await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
    await page.waitForSelector("main h1, [data-admin-tabbar], [role=\"tabpanel\"]", { timeout: 45_000 }).catch(() => {});
    await page.waitForTimeout(1500);
    try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
    const saltar = page.getByRole("button", { name: /^Saltar$/ }).first();
    if (await saltar.isVisible().catch(() => false)) await saltar.click().catch(() => {});
    await page.evaluate(() => {
      document.querySelectorAll('[role="dialog"]').forEach((el) => {
        if (/Configura tu (bodega|tienda)/.test(el.textContent ?? "")) el.remove();
      });
    });
    // Sólo el contenido del módulo: el shell (sidebar/topbar) se mide una vez aparte.
    const scope = tab === "__shell" ? "body" : "main";
    const r = await new AxeBuilder({ page }).include(scope).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    out[tab] = {};
    let n = 0;
    for (const v of r.violations) {
      out[tab][v.id] = {
        impact: v.impact,
        nodes: v.nodes.length,
        muestras: v.nodes.slice(0, 4).map((x) => ({ target: x.target.join(" "), html: x.html.slice(0, 180) })),
        // AXE_FULL=1: cada nodo de contraste con sus colores medidos, para
        // agrupar por causa (par fg/bg + clase) en vez de por pantalla.
        ...(process.env.AXE_FULL && v.id === "color-contrast"
          ? { todos: v.nodes.map((x) => ({ html: x.html.slice(0, 260), data: x.any[0]?.data ?? null })) }
          : {}),
      };
      n += v.nodes.length;
      totales.set(v.id, (totales.get(v.id) ?? 0) + v.nodes.length);
    }
    console.log(`${tab.padEnd(28)} ${String(n).padStart(4)} nodos · ${Object.keys(out[tab]).join(", ") || "✅"}`);
  } catch (e) {
    console.log(`${tab.padEnd(28)} ERROR ${String(e.message).slice(0, 80)}`);
    out[tab] = { __error: String(e.message) };
  }
}
await browser.close();
writeFileSync(OUT, JSON.stringify({ theme: THEME, slug: SLUG, fecha: new Date().toISOString(), out }, null, 2));
console.log("\nTotales por regla (nodos):");
for (const [id, c] of [...totales.entries()].sort((a, b) => b[1] - a[1])) console.log(`  ${String(c).padStart(5)}  ${id}`);
console.log(`\n→ ${OUT}`);
