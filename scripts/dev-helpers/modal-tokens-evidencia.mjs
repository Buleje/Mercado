// Evidencia: ¿el modal (portal a <body>) usa los tokens del PANEL o los de la tienda?
// Abre la hoja de atajos (tecla «?», es un AdminModal) y compara estilos calculados
// del diálogo contra el panel de atrás, en claro y oscuro. Captura el diálogo.
// Uso: node scripts/dev-helpers/modal-tokens-evidencia.mjs <etiqueta> [outDir]
import { chromium } from "playwright";
const BASE = "http://localhost:3000", SLUG = process.env.SLUG || "main";
const TAG = process.argv[2] || "antes", OUT = process.argv[3] || "reports/visual-verify/2026-09-12-modal-tokens";
// TAB + BTN (regex del nombre del botón) para abrir un AdminModal real en vez de la hoja de atajos.
const TAB = process.env.TAB || "productos", BTN = process.env.BTN || "";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1366, height: 768 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
const page = await ctx.newPage();
await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG } });
for (const tema of ["light", "dark"]) {
  await page.goto(`${BASE}/t/${SLUG}/admin?tab=${TAB}`, { waitUntil: "domcontentloaded", timeout: 90000 });
  await page.evaluate((t) => { sessionStorage.setItem("buleje-theme-session-v2", t); localStorage.setItem("onboarding-completed-main", "1"); }, tema);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90000 });
  await page.waitForSelector("main", { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  if (BTN) {
    const boton = page.getByRole("button", { name: new RegExp(BTN, "i") }).first();
    await boton.waitFor({ timeout: 30000 }).catch(() => {});
    await boton.click().catch((e) => console.log("click:", e.message));
  } else {
    await page.locator("main").click({ position: { x: 5, y: 5 } }).catch(() => {});
    await page.keyboard.press("?");
  }
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.waitFor({ timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(600);
  const m = await page.evaluate(() => {
    const d = [...document.querySelectorAll('[role="dialog"]')].pop();
    const panel = document.querySelector('[data-area="admin"]') ?? document.querySelector("main");
    if (!d || !panel) return { error: "sin diálogo o panel" };
    const vars = ["--accent", "--text-secondary", "--text-tertiary", "--surface-raised", "--rule-base", "--data-warning-500", "--data-success-500", "--ts-sm"];
    const leer = (el) => Object.fromEntries(vars.map((v) => [v, getComputedStyle(el).getPropertyValue(v).trim()]));
    const tituloDlg = d.querySelector("h2, [id*=title]") ?? d;
    const iguales = vars.filter((v) => getComputedStyle(d).getPropertyValue(v).trim() === getComputedStyle(panel).getPropertyValue(v).trim());
    return {
      fuentePanel: getComputedStyle(panel).fontFamily.slice(0, 40),
      fuenteDialogo: getComputedStyle(tituloDlg).fontFamily.slice(0, 40),
      fuenteCuerpoDialogo: getComputedStyle(d).fontFamily.slice(0, 40),
      tokensIguales: `${iguales.length}/${vars.length}`,
      panel: leer(panel), dialogo: leer(d),
    };
  });
  console.log(`\n[${TAG}] ${tema}`, JSON.stringify(m, null, 1));
  await dlg.screenshot({ path: `${OUT}/${TAG}-${tema}.png` }).catch((e) => console.log("captura:", e.message));
  await page.keyboard.press("Escape");
}
await b.close();
