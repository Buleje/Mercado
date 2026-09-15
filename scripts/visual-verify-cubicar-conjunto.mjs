/**
 * ADR-369: tildar varios registros de Productos disponibles, cubicar el conjunto
 * y ver el cuadre ESPECIE POR ESPECIE. Con `--guardar` escribe de verdad.
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

// ── Tildar tres filas ──
const checks = page.locator('tbody input[type="checkbox"]');
console.log("filas con check:", await checks.count());
for (const i of [0, 1, 2]) await checks.nth(i).check();
await page.waitForTimeout(900);
const barra = page.locator("text=/Registros/").first();
console.log("barra de selección:", (await barra.count()) ? (await barra.locator("xpath=../..").innerText()).replace(/\s+/g, " ").slice(0, 170) : "(no aparece)");
await page.screenshot({ path: `${OUT}/${DARK ? "45-dark" : "44"}-seleccion.png`, fullPage: false });

// ── Cubicar el conjunto ──
await page.getByRole("button", { name: /Cubicar madera/i }).first().click();
await page.waitForTimeout(2500);
const d = page.getByRole("dialog").last();
console.log("modal:", (await d.innerText()).split("\n").slice(0, 2).join(" · "));

/* Reusar una cubicación ya guardada: es el flujo de «medí ayer, hoy elijo
   contra qué paquetes cuadra». */
const reusar = d.getByLabel(/Usar una cubicación ya guardada/i).first();
if (await reusar.count()) {
  const opciones = await reusar.locator("option").allInnerTexts();
  console.log("cubicaciones guardadas ofrecidas:", opciones.length - 1);
  console.log("  ej:", opciones[1]?.replace(/\s+/g, " ").slice(0, 90) ?? "(ninguna)");
}
await d.getByLabel(/Cantidad fila 1/i).first().fill("30");
await d.getByLabel(/espesor fila 1/i).first().fill("2");
await d.getByLabel(/ancho fila 1/i).first().fill("8");
await d.getByLabel(/largo fila 1/i).first().fill("10");
await page.waitForTimeout(1000);

const filasCuadre = await d.locator("tbody tr").allInnerTexts();
console.log("cuadre por especie:");
for (const f of filasCuadre.slice(0, 6)) console.log("  ·", f.replace(/\s+/g, " ").slice(0, 120));
const avisos = await d.locator("ul li").allInnerTexts();
for (const a of avisos.slice(0, 4)) console.log("  aviso:", a.replace(/\s+/g, " ").slice(0, 140));
await page.screenshot({ path: `${OUT}/${DARK ? "47-dark" : "46"}-cuadre-conjunto.png`, fullPage: false });

if (GUARDAR) {
  await d.getByRole("button", { name: /Guardar cubicación/i }).first().click();
  await page.waitForTimeout(1000);
  await d.getByRole("button", { name: /Guardar igual|Guardar cubicación/i }).first().click();
  await page.waitForTimeout(4000);
  const cuerpo = await page.locator("body").innerText();
  console.log("guardada:", /Cubicación guardada/i.test(cuerpo));
  console.log("aviso:", cuerpo.split("\n").find((l) => /Cubicación guardada/i.test(l)) ?? "(sin aviso)");
}

console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
