/** ADR-373: del reparto de la cubicación a N corridas del libro, una por jornada. */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000", SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const DARK = process.argv.includes("--dark");
const DIAS = 2;

await mkdir(OUT, { recursive: true });
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript((d) => { try { localStorage.setItem("onboarding-completed-main", "1"); if (d) sessionStorage.setItem("buleje-theme-session-v2", "dark"); } catch {} }, DARK);
const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message.slice(0, 160)));
await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG } });
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=consumos`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(6000);
/* La vista recorre la cadena de custodia del período antes de mostrar el patio:
   actuar mientras carga mide una pantalla que todavía no existe. */
const cargo = await page
  .waitForFunction(() => !/Recorriendo la cadena de custodia/.test(document.body.innerText), null, { timeout: 180_000 })
  .then(() => true).catch(() => false);
console.log("la vista terminó de cargar:", cargo);
await page.waitForTimeout(2500);

/** Cuántas corridas de producción hay ahora, para poder contar las nuevas. */
const corridas = async () => {
  const r = await page.request.get(`${BASE}/api/admin/forestal/ctp?section=produccion`, { headers: { "x-tenant-id": SLUG } });
  const j = await r.json().catch(() => ({}));
  return (j.entries ?? []).length;
};
const antes = await corridas();
console.log("corridas de producción antes:", antes);

// El lote se elige en el desplegable «Consumir en un lote…».
const selLote = page.locator("select").filter({ hasText: /Consumir en un lote/i }).first();
if (await selLote.count()) {
  const ops = await selLote.locator("option").evaluateAll((els) => els.map((e) => ({ v: e.value, t: e.textContent?.trim() })));
  const elegido = ops.find((o) => o.v && /LA-/.test(o.t ?? ""));
  console.log("lote elegido:", elegido?.t ?? "(ninguno disponible)");
  if (elegido) { await selLote.selectOption(elegido.v); await page.waitForTimeout(3500); }
}

/* Tildar trozas: los checks viven en la tabla del patio, que sólo los ofrece
   con un lote elegido. Se excluye el de «seleccionar todo» de la cabecera. */
const checks = page.locator('input[type="checkbox"]:visible');
const n = await checks.count();
console.log("checkboxes visibles:", n);
let tildadas = 0;
for (let i = 0; i < n && tildadas < 4; i++) {
  const c = checks.nth(i);
  const enTabla = await c.evaluate((el) => Boolean(el.closest("tr") || el.closest("li")));
  if (!enTabla) continue;
  if (await c.isChecked().catch(() => true)) continue;
  await c.check().catch(() => {});
  tildadas += 1;
}
console.log("trozas tildadas:", tildadas);
await page.waitForTimeout(2000);

// El bloque de cubicación: elegir una guardada y poner los días.
const bloque = page.locator("section", { hasText: /jornada|Cubicar madera|reparto/i }).first();
const select = page.locator("select").filter({ hasText: /pieza|m³|Elegí/i }).first();
if (await select.count()) {
  const opts = await select.locator("option").evaluateAll((els) => els.map((e) => ({ v: e.value, t: e.textContent?.trim().slice(0, 40) })));
  const util = opts.find((o) => o.v);
  console.log("cubicaciones guardadas:", opts.length - 1, util ? `· usando «${util.t}»` : "· ninguna");
  if (util) { await select.selectOption(util.v); await page.waitForTimeout(2000); }
}
const campoDias = page.locator('input[type="number"]').first();
if (await campoDias.count()) { await campoDias.fill(String(DIAS)); await page.waitForTimeout(1500); }

const tabla = page.getByText(/jornadas? para el libro/i).first();
console.log("bloque de jornadas visible:", (await tabla.count()) > 0);
if (await tabla.count()) console.log("título:", (await tabla.innerText()).trim());
await page.screenshot({ path: `${OUT}/${DARK ? "61-dark" : "60"}-jornadas.png`, fullPage: false });

const boton = page.getByRole("button", { name: /Registrar \d+ corridas?/i }).first();
console.log("botón de registrar:", (await boton.count()) ? (await boton.isEnabled() ? "habilitado" : "apagado") : "no está");
if ((await boton.count()) && (await boton.isEnabled())) {
  await boton.click();
  await page.waitForFunction(() => !/Registrando \d+ de/.test(document.body.innerText), null, { timeout: 180_000 }).catch(() => {});
  await page.waitForTimeout(3000);
  const resumen = await page.getByText(/jornadas? declaradas?|de \d+ jornada/i).first().innerText().catch(() => "(sin resumen)");
  console.log("resultado:", resumen.replace(/\s+/g, " ").slice(0, 200));
  const detalle = await page.locator("li", { hasText: /Día \d+ \(/ }).allInnerTexts().catch(() => []);
  for (const d of detalle) console.log("   ·", d.replace(/\s+/g, " ").slice(0, 120));
  await page.screenshot({ path: `${OUT}/${DARK ? "63-dark" : "62"}-jornadas-registradas.png`, fullPage: false });
}

const despues = await corridas();
console.log(`corridas de producción después: ${despues} (nuevas: ${despues - antes})`);
console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
