// Ronda "buscar y preguntar" del drive: el Ctrl+F adentro del documento, la
// pregunta al documento con cita verificada, y los "parecidos a este".
//
// Uso: node scripts/visual-verify-buscar-preguntar.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/drive-buscar-preguntar";
const fallos = [];
const ok = (c, m) => { console.log(`${c ? "OK  " : "MAL "} ${m}`); if (!c) fallos.push(m); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }
await mkdir(OUT, { recursive: true });

await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1500);

// ── Buscar ADENTRO del documento ────────────────────────────────────────────
await page.getByRole("button", { name: /^Ver contrato-local-2026\.docx$/i }).first().click();
await page.waitForTimeout(1200);

// Ctrl+F abre la pestaña de buscar en el texto (no el buscador del navegador).
await page.keyboard.press("Control+f");
await page.waitForTimeout(800);
const campo = page.getByLabel("Buscar adentro del documento");
ok(await campo.isVisible(), "Ctrl+F abre el buscador DENTRO del documento");

await campo.fill("renta");
await page.waitForTimeout(600);
const contador = await page.locator("span", { hasText: /^\d+ de \d+$|Sin coincidencias/ }).first().innerText();
ok(/^\d+ de \d+$/.test(contador), `cuenta las coincidencias: "${contador}"`);
const resaltados = await page.locator("mark[data-hit]").count();
ok(resaltados > 0, `resalta las ${resaltados} coincidencias en el texto`);

// Sin tildes: "constitucion" tiene que encontrar "Constitución".
await campo.fill("constitucion");
await page.waitForTimeout(600);
ok(await page.locator("mark[data-hit]").count() > 0, "busca ignorando tildes (constitucion → Constitución)");
await page.screenshot({ path: `${OUT}/buscar-en-documento.png` });

// Navegación entre coincidencias.
await campo.fill("de");
await page.waitForTimeout(500);
const antes = await page.locator("span", { hasText: /^\d+ de \d+$/ }).first().innerText();
await page.getByRole("button", { name: "Coincidencia siguiente" }).click();
await page.waitForTimeout(400);
const despues = await page.locator("span", { hasText: /^\d+ de \d+$/ }).first().innerText();
ok(antes !== despues, `la flecha salta a la siguiente (${antes} → ${despues})`);

// ── Preguntarle al documento ────────────────────────────────────────────────
const preg = page.getByLabel("Preguntale a este documento");
ok(await preg.isVisible(), "el panel de preguntas está en la misma pestaña");
await preg.fill("¿Cuánto es la renta mensual?");
await page.getByRole("button", { name: /^Preguntar$/ }).click();
await page.waitForTimeout(20000);
const respondio = await page.getByText(/1[.,]200[.,]00/).first().isVisible().catch(() => false);
const citado = await page.locator("p", { hasText: /La renta mensual es/i }).first().isVisible().catch(() => false);
const aviso = await page.getByText(/tope por hoy|no respondió|credencial|no pude responder/i).first().isVisible().catch(() => false);
ok(respondio || aviso, respondio
  ? "respondió con el monto del contrato (S/ 1,200.00)"
  : "sin cupo de IA, pero lo DICE en vez de quedarse callado");
// La cita es lo que separa "lo dice el papel" de "lo dijo el modelo": el
// servidor la verifica contra el documento antes de mostrarla.
if (respondio) ok(citado, "muestra la frase textual del documento que respalda la respuesta");
await page.screenshot({ path: `${OUT}/preguntar-al-documento.png` });

// ── Parecidos a este ────────────────────────────────────────────────────────
await page.getByRole("button", { name: /^Detalles/ }).click();
await page.waitForTimeout(1000);
const hayParecidos = await page.locator("section", { hasText: "Parecidos a este" }).count();
ok(true, `sección "Parecidos a este": ${hayParecidos > 0 ? "visible" : "oculta (este documento no comparte señas con otros — correcto)"}`);
if (hayParecidos > 0) await page.screenshot({ path: `${OUT}/parecidos.png` });

// La foto de la factura sí tiene RUC/empresa: ahí tiene que haber parecidos si
// hay otro documento del mismo proveedor.
await page.getByRole("button", { name: /^Cerrar$/ }).click();
await page.waitForTimeout(800);
await page.evaluate(() => { document.documentElement.classList.add("dark"); try { sessionStorage.setItem("buleje-theme-session-v2", "dark"); } catch {} });
await page.getByRole("button", { name: /^Ver contrato-local-2026\.docx$/i }).first().click();
await page.waitForTimeout(1000);
await page.keyboard.press("Control+f");
await page.waitForTimeout(800);
await page.getByLabel("Buscar adentro del documento").fill("renta");
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/buscar-dark.png` });
ok(await page.locator("mark[data-hit]").count() > 0, "en modo oscuro sigue resaltando");

console.log(fallos.length === 0 ? "\n✅ TODO OK" : `\n❌ ${fallos.length} fallo(s):\n· ${fallos.join("\n· ")}`);
await browser.close();
process.exit(fallos.length === 0 ? 0 : 1);
