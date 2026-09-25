/**
 * La herramienta de cubicación desde Productos disponibles (ADR-368): medir,
 * ver el cuadre contra el libro y GUARDAR de verdad.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const DARK = process.argv.includes("--dark");
const GUARDAR = process.argv.includes("--guardar");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript((d) => {
  try {
    localStorage.setItem("onboarding-completed-main", "1");
    if (d) sessionStorage.setItem("buleje-theme-session-v2", "dark");
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
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=disponibles`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(7000);
await page.getByTitle(/Cubicar/i).first().waitFor({ timeout: 60_000 });

/* Se cubica la fila del paquete dimensionado: es la que tiene un declarado real
   contra el que cuadrar. */
const fila = page.locator("tr", { hasText: /PQ-DIM-/ }).first();
const boton = (await fila.count()) ? fila.getByTitle(/Cubicar/i).first() : page.getByTitle(/Cubicar/i).first();
await boton.click();
await page.waitForTimeout(2500);
const d = page.getByRole("dialog").last();
console.log("modal:", (await d.innerText()).split("\n").slice(0, 2).join(" · "));

const num = (etiqueta, valor) => d.getByLabel(new RegExp(etiqueta, "i")).first().fill(valor);
// Una medición que NO cuadra: 12 piezas declaradas, se miden 14.
await num("Cantidad fila 1", "14");
await num("espesor fila 1", "2.5");
await num("ancho fila 1", "20");
await num("largo fila 1", "2.8");
await d.getByLabel(/Unidad de espesor, fila 1/i).selectOption("cm");
await d.getByLabel(/Unidad de ancho, fila 1/i).selectOption("cm");
await d.getByLabel(/Unidad de largo, fila 1/i).selectOption("m");
await page.waitForTimeout(900);

const avisos = await d.locator("ul li").allInnerTexts();
console.log("cuadre:");
for (const a of avisos.slice(0, 6)) console.log("  ·", a.replace(/\s+/g, " ").slice(0, 150));
await page.screenshot({ path: `${OUT}/${DARK ? "41-dark" : "40"}-cubicar.png`, fullPage: false });

if (GUARDAR) {
  const guardar = d.getByRole("button", { name: /Guardar cubicación/i }).first();
  await guardar.click();
  await page.waitForTimeout(1200);
  console.log("1er clic (debe pedir confirmación):", (await d.innerText()).includes("volvé a apretar"));
  await d.getByRole("button", { name: /Guardar igual|Guardar cubicación/i }).first().click();
  await page.waitForTimeout(4000);
  const cuerpo = await page.locator("body").innerText();
  console.log("guardada:", /Cubicación guardada/i.test(cuerpo));
  const linea = cuerpo.split("\n").find((l) => /Cubicación guardada/i.test(l));
  console.log("aviso:", linea ?? "(sin aviso)");
  await page.screenshot({ path: `${OUT}/${DARK ? "43-dark" : "42"}-cubicar-guardada.png`, fullPage: false });
}

console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
