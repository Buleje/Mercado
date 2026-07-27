// El editor de planillas del drive sigue abriendo bien después de compartir el
// lector y el manejo de errores con la vista previa: un .xlsx CON formato y un
// .csv. Verifica que la grilla se dibuje con los valores formateados y que un
// 429 salga como aviso con reintento en vez de "no se pudo abrir (HTTP 429)".
//
// Uso: node scripts/visual-verify-hoja-editor.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import ExcelJS from "exceljs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/hoja-preview";

async function planilla() {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Precios");
  ws.columns = [{ width: 28 }, { width: 14 }];
  const cab = ws.addRow(["Producto", "Precio"]);
  cab.eachCell((c) => { c.font = { bold: true }; });
  for (const [p, v] of [["Arroz Costeño 5 kg", 24.9], ["Aceite Primor 1 L", 11.5], ["Azúcar rubia 1 kg", 4.2]]) {
    ws.addRow([p, v]).getCell(2).numFmt = '"S/ "#,##0.00';
  }
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

const xlsx = await planilla();
await page.evaluate(async (bytes) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(bytes)], "precios-qa.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  }));
  dt.items.add(new File([new TextEncoder().encode("Cliente,Deuda\nJuana,45.50\nMiguel,120\n")], "fiado-qa.csv", { type: "text/csv" }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, [...xlsx]);
await page.waitForTimeout(7000);

const docs = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=500", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name }));
});
const mios = docs.filter((d) => d.name === "precios-qa.xlsx" || d.name === "fiado-qa.csv");
if (mios.length < 2) { console.error("MAL: no se subieron los archivos", mios); await browser.close(); process.exit(1); }

console.log("\n=== EDITOR ===");
for (const doc of mios) {
  await page.goto(`${BASE}/t/${SLUG}/admin/documentos/${doc.id}/editar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForFunction(() => !!document.querySelector("table tbody td") || /No se pudo abrir/i.test(document.body.textContent ?? ""),
    { timeout: 90_000 }).catch(() => {});
  await page.waitForTimeout(600);
  const visto = await page.evaluate(() => {
    const tds = [...document.querySelectorAll("table tbody td")];
    return {
      celdas: tds.slice(0, 6).map((t) => t.textContent?.trim()).filter(Boolean),
      error: /No se pudo abrir/i.test(document.body.textContent ?? ""),
    };
  });
  console.log(`  ${visto.celdas.length > 0 && !visto.error ? "ok " : "MAL"} ${doc.name.padEnd(16)} ${visto.celdas.join(" | ") || "(vacío)"}`);
}
await page.screenshot({ path: `${OUT}/04-editor.png` });

// Resaltar por regla sobre la columna de precios (lo que se hace con un
// inventario: marcar lo que está por debajo de un valor).
await page.goto(`${BASE}/t/${SLUG}/admin/documentos/${mios.find((d) => d.name === "precios-qa.xlsx").id}/editar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForFunction(() => !!document.querySelector("table tbody td"), { timeout: 90_000 }).catch(() => {});
await page.waitForTimeout(800);
// Seleccionar la columna B (precios) desde su encabezado.
await page.evaluate(() => {
  const ths = [...document.querySelectorAll("thead th")];
  const b = ths.find((t) => t.textContent?.trim() === "B");
  b?.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
});
await page.waitForTimeout(300);
await page.getByRole("button", { name: /Resaltar por regla/ }).click();
await page.waitForTimeout(500);
await page.getByLabel("Valor de la regla").fill("12");
await page.waitForTimeout(400);
const previa = await page.evaluate(() => (document.body.textContent ?? "").match(/(\d+) celdas? menor que 12/)?.[0] ?? null);
await page.getByRole("button", { name: /^Resaltar/ }).last().click();
await page.waitForTimeout(700);
const pintadas = await page.evaluate(() => {
  const tds = [...document.querySelectorAll("table tbody td")];
  return tds.filter((td) => /rgb\(254, 202, 202\)/.test(getComputedStyle(td).backgroundColor)).map((td) => td.textContent?.trim());
});
await page.screenshot({ path: `${OUT}/06-regla-resaltado.png` });
console.log("\n=== RESALTAR POR REGLA ===");
console.log(`  ${previa ? "ok " : "MAL"} avisa cuántas caen antes de aplicar: ${previa ?? "(no lo dice)"}`);
console.log(`  ${pintadas.length > 0 ? "ok " : "MAL"} celdas pintadas: ${pintadas.join(" | ") || "(ninguna)"}`);

// El 429 al abrir el editor: aviso con reintento, no un HTTP crudo.
await page.route("**/api/admin/documents/*/raw*", (route) =>
  route.fulfill({
    status: 429, contentType: "application/json", headers: { "retry-after": "9" },
    body: JSON.stringify({ error: "Too many requests", retryAfter: 9 }),
  }));
await page.goto(`${BASE}/t/${SLUG}/admin/documentos/${mios[0].id}/editar`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.waitForFunction(() => /Reintent|No se pudo/i.test(document.body.textContent ?? ""), { timeout: 60_000 }).catch(() => {});
const limite = await page.evaluate(() => {
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  return {
    json: txt.includes("Too many requests"),
    cuenta: txt.match(/Reintento automático en \d+s/)?.[0] ?? null,
    boton: [...document.querySelectorAll("button")].some((b) => /Reintentar ahora/i.test(b.textContent ?? "")),
  };
});
await page.screenshot({ path: `${OUT}/05-editor-limite.png` });
console.log(`  ${limite.json ? "MAL" : "ok "} el editor no muestra el JSON del error`);
console.log(`  ${limite.cuenta ? "ok " : "MAL"} cuenta regresiva   ${limite.cuenta ?? "(no aparece)"}`);
console.log(`  ${limite.boton ? "ok " : "MAL"} botón de reintento`);
await page.unroute("**/api/admin/documents/*/raw*");

await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 60_000 });
const borrados = await page.evaluate(async (ids) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
  let ok = 0;
  for (const id of ids) {
    const r = await fetch(`/api/admin/documents/${id}?purge=1`, {
      method: "DELETE", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") },
    });
    if (r.status === 200) ok++;
  }
  return ok;
}, mios.map((d) => d.id));
console.log(`\nlimpieza: ${borrados} de ${mios.length}`);
await browser.close();
