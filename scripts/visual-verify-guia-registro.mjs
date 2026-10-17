/**
 * El modal «Registro de guía de transporte forestal» (alta de despacho):
 * cuánto mide, cuántas filas ocupa cada bloque y si el RUC trae los datos.
 * No registra nada — cierra sin guardar.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const RUC = "20100070970";
const DARK = process.argv.includes("--dark");

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
const padron = [];
page.on("pageerror", (e) => errores.push(e.message.slice(0, 160)));
page.on("response", (r) => { if (r.url().includes("/api/documento/lookup")) padron.push(r.status()); });
await mkdir(OUT, { recursive: true });
await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=despacho`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(8000);
await page.getByRole("button", { name: /Nuevo despacho/i }).first().click();
await page.waitForTimeout(3500);

const d = page.getByRole("dialog").last();
console.log("modal:", (await d.innerText()).split("\n")[0]);
await page.screenshot({ path: `${OUT}/${DARK ? "37-dark" : "36"}-registro-guia.png`, fullPage: false });

/* El alto real del contenido: es lo que decide cuánto hay que scrollear. */
const medida = await d.evaluate((el) => {
  const cuerpo = el.querySelector("[class*=overflow-y]") ?? el;
  const bloques = [...el.querySelectorAll("section")].map((s) => ({
    titulo: s.querySelector("h3")?.textContent?.trim().slice(0, 34) ?? "?",
    alto: Math.round(s.getBoundingClientRect().height),
  }));
  return { contenido: Math.round(cuerpo.scrollHeight), visible: Math.round(cuerpo.clientHeight), bloques };
});
console.log(`contenido ${medida.contenido}px en un alto visible de ${medida.visible}px → ${(medida.contenido / medida.visible).toFixed(2)} pantallas`);
for (const b of medida.bloques) console.log(`  ${String(b.alto).padStart(4)}px  ${b.titulo}`);

// El padrón, en el casillero «Nro RUC» del destinatario.
const rucs = d.locator('input[inputmode="numeric"]');
console.log("casilleros numéricos:", await rucs.count());
const destinatario = d.locator("section", { hasText: /Destinatario/ }).first();
const rucDest = destinatario.locator('input[inputmode="numeric"]').last();
await rucDest.fill(RUC);
await page.waitForTimeout(4500);
const linea = destinatario.locator("text=/SUNAT|RENIEC|no tiene/i").first();
console.log("padrón dijo:", (await linea.count()) ? (await linea.innerText()).replace(/\s+/g, " ").slice(0, 150) : "(nada)");
const nombreDest = destinatario.locator('input[type="text"]').first();
console.log("nombre del destinatario:", await nombreDest.inputValue());
await page.screenshot({ path: `${OUT}/${DARK ? "39-dark" : "38"}-registro-padron.png`, fullPage: false });

console.log("llamadas al padrón:", padron.length ? padron : "ninguna");
console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
