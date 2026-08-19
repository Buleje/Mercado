/**
 * El camino del usuario, entero: entrar a Producción, elegir el lote de ayer y
 * declarar lo que faltó SIN tocar una troza. Escribe de verdad (ADR-365).
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const LOTE = process.argv[2] ?? "LA-2026-041";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  extraHTTPHeaders: { "x-tenant-id": SLUG },
});
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("onboarding-completed-main", "1");
    localStorage.setItem("buleje-tour-marketplace-2026-04", "1");
  } catch {}
});
const page = await ctx.newPage();
const errores = [];
page.on("console", (m) => { if (m.type() === "error") errores.push(m.text().slice(0, 200)); });
page.on("pageerror", (e) => errores.push(`PAGEERROR ${e.message}`.slice(0, 200)));

await mkdir(OUT, { recursive: true });
const r = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (r.status() !== 200) { console.error("login", r.status()); process.exit(1); }

await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=produccion`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(6000);
try { await page.waitForLoadState("networkidle", { timeout: 20_000 }); } catch {}

await page.screenshot({ path: `${OUT}/00-landing.png`, fullPage: false });
console.log("url:", page.url());
console.log("botones:", (await page.getByRole("button").allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, 40).join(" | "));

// 1 · elegir el lote: la tira de «lotes que entran a la sierra» lo ofrece
await page.screenshot({ path: `${OUT}/01-menu-lotes.png` });
await page.getByText(new RegExp(LOTE)).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/02-panel-lote.png`, fullPage: true });

// 2 · el bloque nuevo: la corrida de ayer, con su margen
const bloque = page.getByText(/a medio declarar/i).first();
const hayBloque = await bloque.count();
console.log("bloque «a medio declarar» visible:", hayBloque > 0);
const textoBloque = hayBloque > 0
  ? await page.locator("section", { hasText: /a medio declarar/i }).last().innerText()
  : "(no está)";
console.log("---- bloque ----\n" + textoBloque + "\n----------------");

// 3 · declarar lo que faltó, sin tocar una troza
await page.getByRole("button", { name: /Declarar lo que faltó/i }).first().click();
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/03-modal-ampliar.png`, fullPage: true });

const dialog = page.getByRole("dialog").last();
console.log("título del modal:", (await dialog.innerText()).split("\n").slice(0, 4).join(" | "));

// código sugerido (debería continuar la serie PQ-001 → PQ-002)
const codigo = dialog.getByLabel(/Código de paquete/i).first();
console.log("código sugerido:", await codigo.inputValue());
await dialog.getByLabel(/^Volumen \(m³\)$/i).first().fill("0.3");
await dialog.getByLabel(/Cantidad \(piezas\)/i).first().fill("6");
await page.waitForTimeout(400);
await dialog.getByRole("button", { name: /Añadir/i }).first().click();
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/04-paquete-cargado.png`, fullPage: true });

await dialog.getByRole("button", { name: /Agregar a la corrida/i }).first().click();
await page.waitForTimeout(6000);
await page.screenshot({ path: `${OUT}/05-despues.png`, fullPage: true });
const cuerpo = await page.locator("body").innerText();
console.log("toast/ampliada:", /ampliada/i.test(cuerpo));
const linea = cuerpo.split("\n").find((l) => /ampliada|declara ahora/i.test(l));
console.log("aviso:", linea ?? "(sin aviso visible)");

// 4 · dark
await page.evaluate(() => { try { sessionStorage.setItem("buleje-theme-session-v2", "dark"); } catch {} });
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(5000);
await page.screenshot({ path: `${OUT}/06-dark.png`, fullPage: true });

console.log("errores de consola:", errores.length ? errores.slice(0, 5) : "ninguno");
await browser.close();
