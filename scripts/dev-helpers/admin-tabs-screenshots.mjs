// Capturas light+dark del panel admin a la resolución de una laptop (1366x768
// por defecto) con métricas de la cabecera: cuántos <h1> hay (tiene que ser 1),
// qué banda [data-admin-tabbar] lleva el título, cuántos encabezados compactos
// (anidados) y completos se dibujan, y a qué altura empieza el primer tabpanel.
//
// Uso:
//   node scripts/dev-helpers/admin-tabs-screenshots.mjs <outDir> <tab1,tab2,…> <light,dark> [anchoxalto]
//   node scripts/dev-helpers/admin-tabs-screenshots.mjs reports/visual-verify/hoy "plata,compras" light 1366x768
//   SLUG=<tenant> node … para otro tenant (los libros forestales viven en otro).
//
// Necesita el dev server en :3000 y el usuario QA (qaadmin / tenant main).
// Se ejecuta DESDE el repo (resuelve `playwright` de node_modules): copiarlo al
// scratchpad y correrlo desde ahí falla con ERR_MODULE_NOT_FOUND.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const BASE = "http://localhost:3000", SLUG = process.env.SLUG || "main", USER = "qaadmin", PASS = "Qa-admin-1234";
const OUT = process.argv[2] || "reports/visual-verify/2026-09-07-banda";
const TABS = (process.argv[3] || "analytics-pro,plata,inventario,vendor-dashboard,marketplace,delivery-partners,recetas,canales,compras,clientes,ventas-caja,productos,pedidos,adelantos,socio-members").split(",");
const THEMES = (process.argv[4] || "light,dark").split(",");
await mkdir(OUT, { recursive: true });
const [W, H] = (process.argv[5] || "1366x768").split("x").map(Number);
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: USER, password: PASS, tenantSlug: SLUG } });
if (login.status() !== 200) { console.error("login", login.status(), await login.text()); process.exit(1); }
const rows = [];
for (const theme of THEMES) for (const tab of TABS) {
  const url = `${BASE}/t/${SLUG}/admin?tab=${tab}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate(({ t, slug }) => { try { localStorage.setItem(`onboarding-completed-${slug}`, "1"); localStorage.setItem("buleje-tour-marketplace-2026-04", "1"); sessionStorage.setItem("buleje-theme-session-v2", t); } catch {} }, { t: theme, slug: SLUG });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForTimeout(2500);
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  // El asistente de onboarding («Configura tu tienda/bodega») tapa la pantalla
  // en tenants que no lo completaron: se salta por su propio botón (robusto
  // ante la clave de localStorage que use cada tenant) y, si queda, se quita.
  for (let i = 0; i < 2; i++) {
    const saltar = page.getByRole("button", { name: /^Saltar$/ }).first();
    if (await saltar.isVisible().catch(() => false)) { await saltar.click().catch(() => {}); await page.waitForTimeout(600); }
  }
  await page.evaluate(() => { document.querySelectorAll('[role="dialog"]').forEach((el) => { if (/Configura tu (bodega|tienda)/.test(el.textContent ?? "")) el.remove(); }); document.body.style.overflow = ""; });
  await page.waitForTimeout(400);
  const m = await page.evaluate(() => {
    const main = document.querySelector("main") ?? document.body;
    const top = main.getBoundingClientRect().top;
    const h1 = document.querySelectorAll("h1").length;
    const banda = document.querySelector("[data-admin-tabbar] h1, [data-admin-tabbar] h2");
    const compacto = document.querySelectorAll("header[data-admin-module-header].border-l-2").length;
    const headerFull = document.querySelectorAll("header[data-admin-module-header]:not(.border-l-2)").length;
    const panel = document.querySelector('[role="tabpanel"]');
    const fase = document.querySelector('[aria-label="Fase del libro"]');
    const dark = document.documentElement.classList.contains("dark") || document.documentElement.dataset.theme === "dark";
    const bg = getComputedStyle(document.body).backgroundColor;
    return { h1, banda: banda ? banda.textContent.trim().slice(0, 30) : "-", compacto, headerFull, panelY: panel ? Math.round(panel.getBoundingClientRect().top - top) : -1, dark, bg, title: document.title.slice(0, 40), faseY: fase ? Math.round(fase.getBoundingClientRect().top - top) : -1 };
  });
  const file = `${OUT}/${tab}-${theme}.png`;
  await page.screenshot({ path: file, fullPage: false });
  rows.push({ tab, theme, ...m });
  console.log(`${theme.padEnd(5)} ${tab.padEnd(18)} h1=${m.h1} banda="${m.banda}" compacto=${m.compacto} full=${m.headerFull} panelY=${m.panelY} faseY=${m.faseY} dark=${m.dark} bg=${m.bg}`);
}
await browser.close();
console.log("DONE", OUT);
