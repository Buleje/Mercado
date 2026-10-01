/**
 * El círculo del paquete (ADR-366): del código en la pila a su corrida y a la
 * madera con la que se hizo, por las dos puertas — el buscador del libro y la
 * vista de Productos disponibles. No escribe nada.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const CODIGO = process.argv[2] ?? "PQ-0290";
const DARK = process.argv.includes("--dark");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript((dark) => {
  try {
    localStorage.setItem("onboarding-completed-main", "1");
    if (dark) sessionStorage.setItem("buleje-theme-session-v2", "dark");
  } catch {}
}, DARK);
const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message.slice(0, 160)));
await mkdir(OUT, { recursive: true });
await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});

// ── Puerta A · el buscador del libro (tecla `b`) ──
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=produccion`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(7000);
try { await page.waitForLoadState("networkidle", { timeout: 15_000 }); } catch {}
await page.getByText(/Buscar guía/i).first().click();
await page.waitForTimeout(800);
const buscador = page.getByRole("dialog", { name: /Buscar en el libro/i });
await buscador.getByRole("textbox").fill(CODIGO);
await buscador.getByRole("textbox").press("Enter");
await page.waitForTimeout(3000);
await page.screenshot({ path: `${OUT}/${DARK ? "18-dark" : "17"}-buscador-paquete.png` });
const seccion = buscador.getByText(/Paquetes con ese código/i);
console.log("sección de paquetes en el buscador:", (await seccion.count()) > 0 ? (await seccion.innerText()).replace(/\s+/g, " ") : "NO APARECE");

await buscador.getByRole("button", { name: new RegExp(CODIGO) }).first().click();
await page.waitForTimeout(3000);
const ficha = page.getByRole("dialog").last();
const texto = (await ficha.innerText()).replace(/\n+/g, " · ");
console.log("ficha:", texto.slice(0, 620));
await page.screenshot({ path: `${OUT}/${DARK ? "19-dark" : "20"}-ficha-paquete.png`, fullPage: true });
/* Lo que tiene que poder contestar: de qué corrida, de qué lote, de qué guía. */
for (const q of [/Salió de esta corrida/i, /La madera que lo formó/i, /Guías de transporte/i, /Lote de aserrío/i, /Disponible/i]) {
  console.log(`  ${q.source}:`, (await ficha.getByText(q).count()) > 0);
}
await ficha.getByRole("button", { name: /^Cerrar$/ }).last().click().catch(() => {});
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// ── Puerta B · el código en Productos disponibles ──
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=disponibles`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(6000);
const enTabla = page.getByRole("button", { name: new RegExp(`^${CODIGO}$`) }).first();
console.log("código clickeable en disponibles:", (await enTabla.count()) > 0);
if (await enTabla.count()) {
  await enTabla.click();
  await page.waitForTimeout(3000);
  const f2 = page.getByRole("dialog").last();
  console.log("abre la ficha:", (await f2.getByText(/Salió de esta corrida/i).count()) > 0);
  await page.screenshot({ path: `${OUT}/${DARK ? "21-dark" : "22"}-disponibles-ficha.png`, fullPage: true });
}

console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
