// Recorre pestañas del admin en light+dark y reporta, por pestaña:
//   · errores de consola y pageerror (filtrando ruido de terceros)
//   · cuántas fechas/horas/montos con el formato canónico se ven en pantalla
//   · tokens que delatan un formateo roto: «Invalid Date», «NaN», «S/undefined», «S/NaN»
// Uso: node scripts/dev-helpers/admin-consola-check.mjs "pedidos,ventas-caja" [light,dark] [SLUG]
import { chromium } from "playwright";
const BASE = "http://localhost:3000", SLUG = process.argv[4] || process.env.SLUG || "main";
const TABS = (process.argv[2] || "pedidos,ventas-caja,plata,compras,adelantos,clientes").split(",");
const THEMES = (process.argv[3] || "light,dark").split(",");
const RUIDO = /favicon|posthog|sentry|vercel|hydration|Warning: |Download the React DevTools|net::ERR_|third-party|preload|Failed to load resource: the server responded with a status of 4/i;
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG } });
if (login.status() !== 200) { console.error("login", login.status(), await login.text()); process.exit(1); }
const filas = [];
for (const tab of TABS) for (const theme of THEMES) {
  const errores = [];
  const onConsole = (m) => { if (m.type() === "error" && !RUIDO.test(m.text())) errores.push(m.text().slice(0, 160)); };
  const onPageErr = (e) => errores.push("pageerror: " + String(e.message).slice(0, 160));
  page.on("console", onConsole); page.on("pageerror", onPageErr);
  await page.goto(`${BASE}/admin?tab=${tab}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate(({ t, slug }) => { try { localStorage.setItem(`onboarding-completed-${slug}`, "1"); localStorage.setItem("buleje-tour-marketplace-2026-04", "1"); sessionStorage.setItem("buleje-theme-session-v2", t); } catch {} }, { t: theme, slug: SLUG });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("main h1, [data-admin-tabbar], [role=\"tabpanel\"]", { timeout: 40_000 }).catch(() => {});
  await page.getByRole("button", { name: /^Saltar$/ }).first().click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(2500);
  const txt = await page.evaluate(() => document.querySelector("main")?.innerText || document.body.innerText);
  const cuenta = (re) => (txt.match(re) || []).length;
  filas.push({
    tab, theme,
    fechasCanon: cuenta(/\b\d{2} [a-z]{3,4}\.(?: \d{4})?(?![\w])/g),  // 22 set. / 22 set. 2026 (sin exigir \b tras el punto)
    fechasGuion: cuenta(/\b\d{2}-[a-z]{3,4}\./g),                    // 22-set. (ICU crudo: no debería quedar)
    horas24: cuenta(/\b([01]\d|2[0-3]):[0-5]\d\b/g),
    horas12: cuenta(/\d{1,2}:\d{2} [ap]\. m\./g),                       // 07:30 p. m. (viejo)
    montosCanon: cuenta(/S\/ \d{1,3}(,\d{3})*\.\d{2}\b/g),           // S/ 12,345.50
    montosSinMiles: cuenta(/S\/ ?\d{4,}\.\d{2}\b/g),                 // S/12345.50 (viejo)
    rotos: cuenta(/Invalid Date|NaN|S\/ ?undefined|S\/ ?null|undefined/g),
    errores,
  });
  page.off("console", onConsole); page.off("pageerror", onPageErr);
}
await browser.close();
console.log("tab            tema   fechas✓ fechas-guion  h24  h12  montos✓ sinMiles  ROTOS  errores");
for (const f of filas) console.log(`${f.tab.padEnd(14)} ${f.theme.padEnd(6)} ${String(f.fechasCanon).padStart(7)} ${String(f.fechasGuion).padStart(12)} ${String(f.horas24).padStart(4)} ${String(f.horas12).padStart(4)} ${String(f.montosCanon).padStart(8)} ${String(f.montosSinMiles).padStart(8)} ${String(f.rotos).padStart(6)}  ${f.errores.length}`);
for (const f of filas) for (const e of f.errores) console.log(`   ✗ ${f.tab}/${f.theme}: ${e}`);
