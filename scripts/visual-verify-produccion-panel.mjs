/**
 * Las cinco cosas que se pidieron para el modal, medidas en el navegador:
 * presentación automática, código sugerido libre, cubicador pt↔m³, solapas
 * (trozas · guías y títulos · ya declarados) y medidas por producto.
 * No escribe nada.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const LOTE = process.argv[2] ?? "LA-2026-043";
const DARK = process.argv.includes("--dark");
/** Por el <label> que envuelve al control: getByLabel no resuelve estos campos. */
const sel = (scope, texto, tag = "select") => scope.locator("label").filter({ hasText: texto }).locator(tag).first();

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
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=produccion`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(7000);
try { await page.waitForLoadState("networkidle", { timeout: 15_000 }); } catch {}

// ── A · por el panel del lote (declarar una corrida nueva) ──
await page.getByText(new RegExp(LOTE)).first().click();
await page.waitForTimeout(2500);
await page.getByRole("button", { name: /^Declarar producción$/ }).last().click();
await page.waitForTimeout(2500);
let dialog = page.getByRole("dialog").last();

const codigo = sel(dialog, /^Código de paquete/, "input");
/* Dos lecturas: el primer sugerido sale sin la serie (el fetch todavía viaja) y
   tiene que ser REEMPLAZADO cuando llega. Medir sólo la primera hacía creer que
   el sugeridor ignoraba la serie de la planta. */
console.log("código al abrir:  ", await codigo.inputValue());
await page.waitForTimeout(3000);
console.log("código ya cargado:", await codigo.inputValue());
console.log("de dónde sale:  ", (await dialog.locator("text=Siguiente libre de la serie").innerText()).replace(/\s+/g, " "));

// Cubicador: m³ → pt y pt → m³
const vol = sel(dialog, /^Volumen \(m³\)/, "input");
const pt = sel(dialog, /^Pie tablar/, "input");
await vol.fill("1");
await page.waitForTimeout(200);
console.log("1 m³ →", await pt.inputValue(), "pt");
await pt.fill("424");
await page.waitForTimeout(200);
console.log("424 pt →", await vol.inputValue(), "m³");

// Solapas del panel de material
const solapas = await dialog.getByRole("button").filter({ hasText: /Trozas que entraron|Guías y títulos|Ya declarados/ }).allInnerTexts();
console.log("solapas:", solapas.map((t) => t.replace(/\s+/g, " ")).join(" | "));
await dialog.getByRole("button", { name: /Guías y títulos/ }).click();
await page.waitForTimeout(600);
console.log("tabla de guías:", (await dialog.getByText(/Guía \(GTF\)/).count()) > 0);
await page.screenshot({ path: `${OUT}/${DARK ? "14-dark" : "13"}-panel-guias.png`, fullPage: true });

// «Las de siempre» sigue al producto
const producto = sel(dialog, /^Producto/);
await producto.selectOption("MADERA ASERRADA (PAQUETERIA LARGA)");
await page.waitForTimeout(1200);
/* Sin paquetes dimensionados en la planta el bloque no se dibuja: es correcto,
   no hay plantilla que ofrecer. Se reporta, no se rompe. */
const plantillas = dialog.locator("text=/Las de siempre/");
console.log(
  "plantillas:",
  (await plantillas.count()) > 0 ? (await plantillas.first().innerText()).replace(/\s+/g, " ") : "(ninguna: no hay paquetes dimensionados)",
  "· presentación:",
  await sel(dialog, /^Presentación/).inputValue(),
);
await dialog.getByRole("button", { name: /^Cerrar$/ }).last().click();
await page.waitForTimeout(800);

// ── B · por la ampliación (corrida que ya declaró) ──
const ampliar = page.getByRole("button", { name: /Declarar lo que faltó/i }).first();
if (await ampliar.count()) {
  await ampliar.click();
  await page.waitForTimeout(3000);
  dialog = page.getByRole("dialog").last();
  await dialog.getByRole("button", { name: /Ya declarados/ }).click();
  await page.waitForTimeout(600);
  const tabla = await dialog.locator("text=/Ya declarados:/").innerText();
  console.log("solapa «ya declarados»:", tabla.replace(/\s+/g, " "));
  console.log("código sugerido al ampliar:", await sel(dialog, /^Código de paquete/, "input").inputValue());
  await page.screenshot({ path: `${OUT}/${DARK ? "16-dark" : "15"}-panel-declarados.png`, fullPage: true });
}

console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
