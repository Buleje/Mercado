// Capturas light+dark del panel admin que ESPERAN a que el módulo monte de verdad
// (el h1 de la banda [data-admin-tabbar]) hasta 180 s, reintentan si el shell rebota
// a ?tab=inicio y nombran el archivo con el viewport (400 no pisa 1366).
// Hermano de admin-tabs-screenshots.mjs para pestañas con módulo dinámico pesado
// (libros forestales, cacao, editor creativo) — ése espera 40 s y captura igual.
//
// Uso: SLUG=<tenant> node scripts/dev-helpers/admin-tabs-capturar.mjs <outDir> "<tab1,tab2>" "light,dark" 1366x768 ["Texto de botón a clickear"]
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
const BASE = "http://localhost:3000", SLUG = process.env.SLUG || "main", USER = "qaadmin", PASS = "Qa-admin-1234";
const [OUT, TABS_ARG, THEMES_ARG, SIZE, CLICK = ""] = process.argv.slice(2);
const TABS = (TABS_ARG || "inicio").split(","), THEMES = (THEMES_ARG || "light,dark").split(",");
const [W, H] = (SIZE || "1366x768").split("x").map(Number);
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
const page = await ctx.newPage();
const errores = [];
page.on("console", (m) => { if (m.type() === "error" && !/favicon|posthog|sentry|vercel|hydration|net::ERR_|preload|status of 4/i.test(m.text())) errores.push(m.text().slice(0, 140)); });
page.on("pageerror", (e) => errores.push("pageerror: " + String(e.message).slice(0, 140)));
const login = await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: USER, password: PASS, tenantSlug: SLUG } });
if (login.status() !== 200) { console.error("login", login.status(), await login.text()); process.exit(1); }
for (const theme of THEMES) for (const tab of TABS) {
  const url = `${BASE}/t/${SLUG}/admin?tab=${tab}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await page.evaluate(({ t, slug }) => { try { localStorage.setItem(`onboarding-completed-${slug}`, "1"); localStorage.setItem("active-tenant-slug", slug); localStorage.setItem("buleje-tour-marketplace-2026-04", "1"); sessionStorage.setItem("buleje-theme-session-v2", t); } catch {} }, { t: theme, slug: SLUG });
  await page.reload({ waitUntil: "domcontentloaded", timeout: 240_000 });
  const t0 = Date.now(); let banda = "-";
  while (Date.now() - t0 < 180_000) {
    banda = await page.evaluate(() => (document.querySelector("[data-admin-tabbar] h1, [data-admin-tabbar] h2, main h1")?.textContent || "-").trim().slice(0, 40));
    if (banda !== "-" && !(banda === "Inicio" && !/^inicio/.test(tab))) break;
    if (/tab=inicio/.test(page.url()) && !/^inicio/.test(tab)) { await page.goto(url, { waitUntil: "domcontentloaded", timeout: 240_000 }); }
    await page.waitForTimeout(1500);
  }
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.getByRole("button", { name: /^Saltar$/ }).first().click({ timeout: 800 }).catch(() => {});
  await page.evaluate(() => { document.querySelectorAll('[role="dialog"]').forEach((el) => { if (/Configura tu (bodega|tienda)/.test(el.textContent ?? "")) el.remove(); }); document.body.style.overflow = ""; });
  if (CLICK) { const b = page.locator('button, [role="tab"], a').filter({ hasText: new RegExp(`^\\s*${CLICK}\\s*$`, "i") }).first(); const ok = await b.waitFor({ state: "visible", timeout: 120_000 }).then(() => true).catch(() => false); if (ok) { await b.click().catch(() => {}); await page.waitForTimeout(3000); } else console.log(`  (botón «${CLICK}» no apareció en 120 s)`); }
  await page.waitForTimeout(600);
  const file = `${OUT}/${tab.replace(/[&=]/g, "_")}-${theme}-${W}${CLICK ? "-" + CLICK.toLowerCase().replace(/\s+/g, "-") : ""}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`${theme.padEnd(5)} ${tab.padEnd(30)} banda="${banda}" en ${Math.round((Date.now() - t0) / 1000)} s · ${page.url().replace(BASE, "")}`);
}
console.log("errores consola:", errores.length, errores.slice(0, 4));
await browser.close();
console.log("DONE", OUT);
