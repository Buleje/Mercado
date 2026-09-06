// Comparar dos versiones por CONTENIDO (no por tamaño): sube una planilla,
// sube una v2 con un precio cambiado y una fila nueva, y verifica que la ficha
// diga exactamente qué celda cambió.
//
// Uso: node scripts/visual-verify-comparar-versiones.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/comparar-versiones";
const NOMBRE = `precios-qa-${process.pid}.xlsx`;

async function planilla(precioAceite, extra) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Precios");
  ws.addRow(["Producto", "Precio"]);
  ws.addRow(["Arroz Costeño 5 kg", 24.9]);
  ws.addRow(["Aceite Primor 1 L", precioAceite]);
  ws.addRow(["Azúcar rubia 1 kg", 4.2]);
  if (extra) ws.addRow(["Leche Gloria 400 g", 4.9]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);

// v1
await page.evaluate(async (a) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(a.datos)], a.nombre, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, { datos: [...(await planilla(11.5, false))], nombre: NOMBRE });
await page.waitForTimeout(6000);

const docs = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=500", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name }));
});
const mio = docs.find((d) => d.name === NOMBRE);
if (!mio) { console.error("MAL: no se subió la planilla"); await browser.close(); process.exit(1); }

// v2: sube una versión con el aceite más caro y un producto nuevo.
const v2 = await planilla(13.9, true);
const subida = await page.evaluate(async (a) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
  const fd = new FormData();
  fd.append("file", new File([Uint8Array.from(a.datos)], a.nombre, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  fd.append("changeNote", "Precios de agosto");
  const r = await fetch(`/api/admin/documents/${a.id}/versions`, {
    method: "POST", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") }, body: fd,
  });
  return r.status;
}, { datos: [...v2], nombre: NOMBRE, id: mio.id });
console.log(`\nversión nueva: ${subida === 201 || subida === 200 ? "ok" : `MAL (${subida})`}`);

// Ficha → pestaña Versiones → comparar la v1 con la actual.
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.getByRole("button", { name: `Ver ${NOMBRE}` }).first().click();
await page.getByRole("button", { name: /^Versiones/ }).click();
await page.waitForTimeout(1200);
await page.getByRole("button", { name: /Comparar/ }).click();
await page.waitForTimeout(400);

const cajas = page.locator('input[type="checkbox"][aria-label^="Comparar v"]');
console.log(`versiones comparables: ${await cajas.count()}`);
// Se re-consulta en cada paso: al marcar la primera, React redibuja la lista y
// el handle de la segunda queda viejo.
// Click en el DOM: con `.check()` de Playwright el panel de arriba crece entre
// el scroll y el clic, y el segundo tilde caía en otro lado.
// La ACTUAL contra la PRIMERA versión: comparar las dos últimas no prueba nada
// (la actual y la última guardada son el mismo archivo).
for (const cual of ["primera", "ultima"]) {
  await page.evaluate((q) => {
    const cajas = [...document.querySelectorAll('input[type="checkbox"][aria-label^="Comparar v"]')];
    (q === "primera" ? cajas[0] : cajas[cajas.length - 1])?.click();
  }, cual);
  await page.waitForTimeout(500);
}
await page.screenshot({ path: `${OUT}/00-picks.png` });
const estadoPicks = await page.evaluate(() => {
  const cajas = [...document.querySelectorAll('input[type="checkbox"][aria-label^="Comparar v"]')];
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  return { marcadas: cajas.filter((c) => c.checked).length, contador: txt.match(/\(\d\/2\)/)?.[0] ?? null, hayBoton: /Ver qué cambió/.test(txt) };
});
console.log("picks:", JSON.stringify(estadoPicks));
await page.getByRole("button", { name: /Ver qué cambió/ }).click();
await page.waitForFunction(() => {
  const txt = document.body.textContent ?? "";
  return /celdas|mismo contenido|No se pudieron|filas/.test(txt) && !/Leyendo las dos versiones/.test(txt);
}, { timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(600);

const diff = await page.evaluate(() => {
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  return {
    celda: txt.match(/B3[^\d]*11\.5[^\d]*13\.9/)?.[0] ?? null,
    filaNueva: /\+1 filas/.test(txt),
    hoja: /Precios/.test(txt),
  };
});
await page.screenshot({ path: `${OUT}/01-diff-planilla.png` });
console.log("\n=== DIFF DE CONTENIDO ===");
console.log(`  ${diff.celda ? "ok " : "MAL"} celda cambiada: ${diff.celda ?? "(no la lista)"}`);
console.log(`  ${diff.filaNueva ? "ok " : "MAL"} detecta la fila agregada`);
console.log(`  ${diff.hoja ? "ok " : "MAL"} nombra la hoja`);

const st = await page.evaluate(async (id) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
  const r = await fetch(`/api/admin/documents/${id}?purge=1`, {
    method: "DELETE", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") },
  });
  return r.status;
}, mio.id);
console.log(`\nlimpieza: ${st === 200 ? "ok" : `MAL (${st})`}`);
await browser.close();
