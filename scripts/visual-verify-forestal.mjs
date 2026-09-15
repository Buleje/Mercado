/**
 * visual-verify-forestal — captura las vistas del Libro CTP (o de cualquier
 * módulo forestal) en light/dark y desktop/mobile.
 *
 *   node scripts/visual-verify-forestal.mjs
 *   THEME=dark VIEWS=ingresos,saldos node scripts/visual-verify-forestal.mjs
 *   MOBILE=1 TAB=loth-libro-operaciones STORE_KEY=admin-last-tab-loth-libro \
 *     VIEWS=secciones,gtf node scripts/visual-verify-forestal.mjs
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = process.env.OUT || "reports/ctp-redesign/antes";
const VIEWS = (process.env.VIEWS || "ingresos,produccion,despacho,radar,saldos,cumplimiento,cierre,rentabilidad,analisis,ficha").split(",");
const THEME = process.env.THEME || "light";
const MOBILE = process.env.MOBILE === "1";
const TAB = process.env.TAB || "ctp-libro-operaciones";
const STORE_KEY = process.env.STORE_KEY || "admin-last-tab-ctp-libro";
/** Módulos que deep-linkean la vista por query (ej. cacao: ?cacaoView=beneficio). */
const VIEW_PARAM = process.env.VIEW_PARAM || "";

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: MOBILE ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
    deviceScaleFactor: 1,
    colorScheme: THEME === "dark" ? "dark" : "light",
    extraHTTPHeaders: { "x-tenant-id": SLUG },
  });
  const page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") console.log("  [console.error]", m.text().slice(0, 160)); });

  const r = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
  });
  if (r.status() !== 200) { console.error("Login fail", r.status(), await r.text()); process.exit(1); }

  await page.addInitScript((theme) => {
    try {
      localStorage.setItem("onboarding-completed-main", "1");
      localStorage.setItem("theme", theme);
      localStorage.setItem("bsm-theme", theme);
    } catch {}
  }, THEME);

  for (const view of VIEWS) {
    // Re-login por vista: la corrida larga expiraba la sesión y las últimas
    // capturas salían en la pantalla de login.
    await page.request.post(`${BASE}/api/auth/login`, {
      headers: { "content-type": "application/json", "x-tenant-id": SLUG },
      data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
    });
    if (VIEW_PARAM) {
      await page.goto(`${BASE}/admin?tab=${TAB}&${VIEW_PARAM}=${view}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    } else {
      await page.addInitScript((a) => { try { localStorage.setItem(a.k, a.v); } catch {} }, { k: STORE_KEY, v: view });
      await page.goto(`${BASE}/admin?tab=${TAB}`, { waitUntil: "domcontentloaded", timeout: 120000 });
    }
    await page.waitForTimeout(view === VIEWS[0] ? 9000 : 4500);
    if (THEME === "dark") {
      await page.evaluate(() => { document.documentElement.classList.add("dark"); document.documentElement.setAttribute("data-theme", "dark"); });
      await page.waitForTimeout(400);
    }
    const suffix = `${MOBILE ? "m-" : ""}${THEME}`;
    const file = `${OUT}/${view}-${suffix}.png`;
    await page.screenshot({ path: file, fullPage: true });
    console.log("✓", file);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
