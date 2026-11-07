/**
 * El producto pone la presentación, y las trozas se miran sin salir del modal.
 * No escribe nada: abre, mide y cierra.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const LOTE = process.argv[2] ?? "LA-2026-043";
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
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=produccion`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(7000);
try { await page.waitForLoadState("networkidle", { timeout: 15_000 }); } catch {}

await page.getByText(new RegExp(LOTE)).first().click();
await page.waitForTimeout(2500);
const ctas = page.getByRole("button", { name: /^Declarar producción$/ });
console.log("CTAs «Declarar producción»:", await ctas.count());
await ctas.last().click();
await page.waitForTimeout(2500);
console.log("diálogos abiertos:", await page.getByRole("dialog").count());
await page.screenshot({ path: `${OUT}/diag-modal.png`, fullPage: false });
const dialog = page.getByRole("dialog").last();
console.log("labels del modal:", (await dialog.locator("label").allInnerTexts()).map((t) => t.split("\n")[0]).join(" | "));
/* Por el <label> que envuelve al control: `getByLabel` no resuelve estos campos
   (el nombre accesible se arma con el hint que va dentro del mismo label). */
const campo = (texto) => dialog.locator("label").filter({ hasText: texto }).locator("select").first();
const producto = campo(/^Producto/);
const presentacion = campo(/^Presentación/);

// El producto pone la presentación (paquetería → PAQUETES, el resto → PIEZAS).
const casos = [
  ["MADERA ASERRADA (PAQUETERIA LARGA)", "PAQUETES"],
  ["MADERA ASERRADA (PAQUETERIA CORTA)", "PAQUETES"],
  ["MADERA ASERRADA (COMERCIAL)", "PIEZAS"],
  ["MADERA ASERRADA (TABLA)", "PIEZAS"],
  ["MADERA ASERRADA (CORTA)", "PIEZAS"],
  ["MADERA ASERRADA (LARGA ANGOSTA)", "PIEZAS"],
  ["MADERA ASERRADA (BLOQUES)", "PIEZAS"],
  ["MADERA ASERRADA (LISTONES)", "PIEZAS"],
  ["MADERA ASERRADA (POSTE)", "PIEZAS"],
];
let ok = 0;
for (const [valor, esperada] of casos) {
  await producto.selectOption(valor);
  await page.waitForTimeout(150);
  const real = await presentacion.inputValue();
  const bien = real === esperada;
  if (bien) ok += 1;
  console.log(`${bien ? "OK " : "MAL"} ${valor.padEnd(38)} → ${real}${bien ? "" : ` (esperaba ${esperada})`}`);
}
console.log(`presentación automática: ${ok}/${casos.length}`);

// Cambiarla a mano gana sobre la automática y no se revierte sola.
await presentacion.selectOption("UNIDADES");
await page.waitForTimeout(200);
console.log("elegida a mano se respeta:", (await presentacion.inputValue()) === "UNIDADES");

// El botón de las trozas, dentro del modal.
const verTrozas = dialog.getByRole("button", { name: /troza/i }).first();
console.log("botón de trozas:", (await verTrozas.innerText()).replace(/\s+/g, " "));
await verTrozas.click();
await page.waitForTimeout(700);
const tabla = dialog.getByText(/Madera que entró a la sierra/i);
console.log("tabla desplegada:", (await tabla.count()) > 0);
await page.screenshot({ path: `${OUT}/${DARK ? "12-dark" : "11"}-modal-trozas.png`, fullPage: true });
console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
