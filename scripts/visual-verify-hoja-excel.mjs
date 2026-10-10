// La planilla del drive tiene que comportarse como Excel:
//  1. cuadrícula completa (celdas vacías hasta el borde, no sólo el rango usado)
//  2. se puede escribir en una celda que el archivo no tenía
//  3. combinar celdas funciona
//  4. lo escrito fuera del rango SOBREVIVE al guardado
//
// Uso: node scripts/visual-verify-hoja-excel.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/hoja-excel";
const NOMBRE = `excel-qa-${process.pid}.xlsx`;

async function planilla() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Hoja1");
  ws.addRow(["Producto", "Precio"]);
  ws.addRow(["Arroz", 24.9]);
  ws.addRow(["Aceite", 11.5]);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
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
await page.waitForTimeout(1200);
await page.evaluate(async (a) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(a.datos)], a.nombre, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, { datos: [...(await planilla())], nombre: NOMBRE });
await page.waitForTimeout(6000);

const docs = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=200", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name }));
});
const mio = docs.find((d) => d.name === NOMBRE);
if (!mio) { console.error("MAL: no se subió"); await browser.close(); process.exit(1); }

const URL_EDITOR = `${BASE}/t/${SLUG}/admin/documentos/${mio.id}/editar`;
await page.goto(URL_EDITOR, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForFunction(() => !!document.querySelector("table tbody td"), { timeout: 90_000 }).catch(() => {});
await page.waitForTimeout(1000);

// ── 1 · La cuadrícula llena la pantalla ─────────────────────────────────────
const grilla = await page.evaluate(() => {
  const cont = document.querySelector("table")?.parentElement;
  return {
    filas: document.querySelectorAll("table tbody tr").length,
    columnas: document.querySelectorAll("table thead th").length - 1,
    anchoTabla: Math.round(document.querySelector("table")?.getBoundingClientRect().width ?? 0),
    anchoCaja: cont?.clientWidth ?? 0,
    celdasVacias: [...document.querySelectorAll("table tbody td")].filter((td) => (td.textContent ?? "").trim() === "").length,
  };
});
await page.screenshot({ path: `${OUT}/01-cuadricula.png` });
console.log("\n=== CUADRÍCULA COMO EXCEL ===");
console.log(`  ${grilla.filas >= 25 ? "ok " : "MAL"} filas dibujadas: ${grilla.filas} (el archivo tiene 3)`);
console.log(`  ${grilla.columnas >= 12 ? "ok " : "MAL"} columnas dibujadas: ${grilla.columnas} (el archivo tiene 2)`);
console.log(`  ${grilla.anchoTabla >= grilla.anchoCaja ? "ok " : "MAL"} la cuadrícula llega al borde: tabla ${grilla.anchoTabla}px vs caja ${grilla.anchoCaja}px`);
console.log(`  ${grilla.celdasVacias > 100 ? "ok " : "MAL"} hay ${grilla.celdasVacias} celdas vacías donde escribir`);

/** Clic en la celda (fila, columna) base 0 de la grilla dibujada. */
async function celda(f, c) {
  await page.evaluate(({ f, c }) => {
    const filas = [...document.querySelectorAll("table tbody tr")];
    const tds = [...(filas[f]?.querySelectorAll("td") ?? [])];
    tds[c]?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
  }, { f, c });
  await page.waitForTimeout(200);
}

// ── 2 · Escribir en una celda que el archivo NO tenía ───────────────────────
await celda(9, 5);            // F10, fuera del rango del archivo
await page.keyboard.type("Escrito fuera del rango");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
const escrito = await page.evaluate(() =>
  [...document.querySelectorAll("table tbody td")].some((td) => (td.textContent ?? "").includes("Escrito fuera del rango")));
console.log("\n=== ESCRIBIR EN LA HOJA VACÍA ===");
console.log(`  ${escrito ? "ok " : "MAL"} se puede escribir en F10 (el archivo llegaba a B3)`);

// ── 3 · Combinar celdas ─────────────────────────────────────────────────────
await celda(12, 0);
await page.evaluate(() => {
  const filas = [...document.querySelectorAll("table tbody tr")];
  const tds = [...(filas[12]?.querySelectorAll("td") ?? [])];
  tds[2]?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, shiftKey: true }));
});
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Combinar o separar celdas/ }).click();
await page.waitForTimeout(500);
const combinada = await page.evaluate(() => {
  const filas = [...document.querySelectorAll("table tbody tr")];
  const td = filas[12]?.querySelector("td");
  return Number(td?.getAttribute("colspan") ?? 1);
});
await page.screenshot({ path: `${OUT}/02-combinada.png` });
console.log("\n=== COMBINAR CELDAS ===");
console.log(`  ${combinada >= 3 ? "ok " : "MAL"} A13:C13 quedó combinada (colspan=${combinada})`);

// ── 4 · Guardar y reabrir: lo de afuera del rango sobrevive ─────────────────
await page.getByRole("button", { name: /Guardar/ }).click();
await page.waitForFunction(() => /Guardado|Sin cambios/i.test(document.body.textContent ?? ""), { timeout: 60_000 }).catch(() => {});
await page.waitForTimeout(1500);
await page.goto(URL_EDITOR, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForFunction(() => !!document.querySelector("table tbody td"), { timeout: 90_000 }).catch(() => {});
await page.waitForTimeout(1200);
const persistio = await page.evaluate(() => {
  const tds = [...document.querySelectorAll("table tbody td")];
  return {
    texto: tds.some((td) => (td.textContent ?? "").includes("Escrito fuera del rango")),
    combinada: [...document.querySelectorAll("table tbody tr")].some((tr) => Number(tr.querySelector("td")?.getAttribute("colspan") ?? 1) >= 3),
  };
});
await page.screenshot({ path: `${OUT}/03-reabierto.png` });
console.log("\n=== SOBREVIVE AL GUARDADO ===");
console.log(`  ${persistio.texto ? "ok " : "MAL"} el texto de F10 sigue ahí al reabrir`);
console.log(`  ${persistio.combinada ? "ok " : "MAL"} la celda combinada sigue combinada`);

const st = await page.evaluate(async (id) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
  const r = await fetch(`/api/admin/documents/${id}?purge=1`, {
    method: "DELETE", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") },
  });
  return r.status;
}, mio.id);
console.log(`\nlimpieza: ${st === 200 ? "ok" : `MAL (${st})`}`);
await browser.close();
