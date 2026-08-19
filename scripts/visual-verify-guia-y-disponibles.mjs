/**
 * ADR-367: la guía compacta con padrón (SUNAT/RENIEC) y las acciones de la fila
 * en Productos disponibles. Mide alturas reales; no escribe en el libro.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const DARK = process.argv.includes("--dark");
const RUC = process.argv[2] && /^\d{11}$/.test(process.argv[2]) ? process.argv[2] : "20100070970";

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
const padron = [];
page.on("response", (r) => { if (r.url().includes("/api/documento/lookup")) padron.push(`${r.status()} ${r.url().split("numero=")[1]}`); });
await mkdir(OUT, { recursive: true });
await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});

// ── A · Productos disponibles: la columna de acciones ──
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=disponibles`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(7000);
/* La lectura de la planta tarda: se espera a que la tabla tenga filas de verdad
   antes de contar botones — medir mientras dice «Leyendo la planta…» da 0. */
await page.getByTitle(/Reprocesar/i).first().waitFor({ timeout: 60_000 }).catch(() => {});
const acciones = ["Ficha de", "ANEXO N° 04", "Reprocesar"].map((t) => page.getByTitle(new RegExp(t, "i")));
for (const [i, loc] of acciones.entries()) console.log(`acción ${i + 1} en la fila:`, await loc.count());
await page.screenshot({ path: `${OUT}/${DARK ? "25-dark" : "24"}-disponibles-acciones.png`, fullPage: false });

// El modal de reproceso, sin guardar.
const rep = page.getByTitle(/Reprocesar/i).first();
if (await rep.count()) {
  await rep.click();
  await page.waitForTimeout(1500);
  const d = page.getByRole("dialog").last();
  console.log("modal reproceso:", (await d.innerText()).replace(/\n+/g, " · ").slice(0, 260));
  await page.screenshot({ path: `${OUT}/${DARK ? "27-dark" : "26"}-reproceso.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}

// El anexo 04 con las medidas del paquete ya cargadas.
const filaDim = page.locator("tr", { hasText: /PQ-DIM-/ }).first();
const cub = (await filaDim.count())
  ? filaDim.getByTitle(/ANEXO N° 04/i).first()
  : page.getByTitle(/ANEXO N° 04/i).first();
if (await cub.count()) {
  await cub.click();
  await page.waitForTimeout(2500);
  const d = page.getByRole("dialog").last();
  console.log("modal anexo 04:", (await d.innerText()).replace(/\n+/g, " · ").slice(0, 200));
  await page.screenshot({ path: `${OUT}/${DARK ? "29-dark" : "28"}-anexo04.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(600);
}

// ── B · La guía: alto del formulario + padrón ──
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=despacho`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(6000);
await page.waitForTimeout(4000);
const guia = page.locator("tbody tr").first().getByRole("button").first();
console.log("botones de cadena en despacho:", await guia.count());
if (await guia.count()) {
  await guia.click();
  await page.waitForTimeout(6000);
  const d = (await page.getByRole("dialog").count())
    ? page.getByRole("dialog").last()
    : page.locator(".modal-backdrop, [aria-modal=true]").last();
  console.log("modal abierto:", await d.count());

  await page.screenshot({ path: `${OUT}/${DARK ? "31-dark" : "30"}-guia.png`, fullPage: false });
  const alto = await d.evaluate((el) => {
    const f = el.querySelector("[data-gtf-form]") ?? el;
    return { formulario: Math.round(f.getBoundingClientRect().height), scrollDelModal: Math.round(el.scrollHeight) };
  });
  console.log("alto:", alto);
  console.log("secciones:", (await d.getByRole("button").allInnerTexts()).filter((t) => /Propietario|Destinatario|Transportista|Traslado/.test(t)).join(" | "));

  // El padrón: se escribe el RUC y se rellena solo.
  const dest = d.getByRole("button", { name: /^Destinatario$/ }).first();
  if (await dest.count()) {
    await dest.click();
    await page.waitForTimeout(800);
    /* Sólo se dibuja la sección activa, así que el único input numérico del
   panel es el del documento de esa parte. */
const num = d.locator('input[inputmode="numeric"]').first();
    const nombrePrevio = d.locator('input[type="text"]').first();
    await nombrePrevio.fill("");
    await num.fill(RUC);
    await page.waitForTimeout(4000);
    const nombre = d.locator('input[type="text"]').first();
    console.log("RUC", RUC, "→ nombre:", await nombre.inputValue());
    const linea = d.locator("text=/SUNAT|RENIEC|padrón|demostración/i").first();
    console.log("dijo:", (await linea.count()) ? (await linea.innerText()).replace(/\s+/g, " ").slice(0, 160) : "(nada)");
    await page.screenshot({ path: `${OUT}/${DARK ? "33-dark" : "32"}-padron.png`, fullPage: false });
  }
}

console.log("llamadas al padrón:", padron.length ? padron : "NINGUNA");
console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
