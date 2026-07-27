// Una carpeta de verdad (450 archivos, 60 subcarpetas): que el plan se arme
// sin trabar el modal y que avise que no entra en una sola tanda.
// NO sube nada — se queda en la vista previa y cancela.
//
// Uso: node scripts/visual-verify-import-grande.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/importar-carpeta";
const RAIZ = "Archivo 2026 QA";

// 410 subcarpetas con un archivo cada una: pasa los DOS topes de 400 (el del
// endpoint del árbol y el de archivos por tanda) en una sola prueba.
const ARBOL = [];
for (let i = 1; i <= 410; i++) {
  ARBOL.push(`${RAIZ}/expediente-${String(i).padStart(3, "0")}/doc-${i}.pdf`);
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  extraHTTPHeaders: { "x-tenant-id": SLUG },
});
await ctx.addInitScript(() => {
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
});
const page = await ctx.newPage();

const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(4000);
await page.getByRole("button", { name: /Importar carpeta/i }).click();
await page.waitForTimeout(600);

const t0 = Date.now();
await page.evaluate((rs) => {
  const input = document.querySelector("input[webkitdirectory]");
  const dt = new DataTransfer();
  for (const r of rs) {
    const f = new File([new Uint8Array(1024)], r.split("/").pop(), { type: "application/pdf" });
    Object.defineProperty(f, "webkitRelativePath", { value: r });
    dt.items.add(f);
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, ARBOL);
await page.getByText(/Importar \d+ archivos/).waitFor({ timeout: 30_000 });
const msPlan = Date.now() - t0;

await page.waitForTimeout(1500);
await page.screenshot({ path: `${OUT}/13-plan-grande.png` });

const datos = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const pie = d?.querySelector("span")?.textContent ?? "";
  return {
    filasEnDom: d?.querySelectorAll("li").length ?? 0,
    texto: (d?.innerText ?? "").split("\n").filter((l) => /archivos|tanda|carpeta/i.test(l)).slice(0, 6),
    pie,
  };
});

console.log(`archivos en el árbol: ${ARBOL.length}`);
console.log(`el plan tardó: ${msPlan} ms`);
console.log("filas en el DOM:", datos.filasEnDom);
console.log("líneas relevantes:\n  " + datos.texto.join("\n  "));

// ¿La lista scrollea fluido con tantas filas?
const scroll = await page.evaluate(() => {
  const ul = document.querySelector('[role="dialog"] ul');
  if (!ul) return null;
  const t = performance.now();
  for (let i = 0; i < 20; i++) { ul.scrollTop = i * 40; void ul.offsetHeight; }
  return Math.round(performance.now() - t);
});
console.log("20 scrolls forzados:", scroll, "ms");

// ── Import completo con la red SIMULADA ────────────────────────────────────
// 410 archivos de verdad serían 410 filas en la base y una hora de limpieza
// (borrar tiene rate limit). Con las dos rutas interceptadas se ejercita el
// cliente entero —troceo del árbol, tanda de 400, progreso— sin escribir nada.
let llamadasArbol = 0;
let rutasPorLlamada = [];
let subidas = 0;

await page.route("**/api/admin/documents/folders/tree", async (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  llamadasArbol++;
  rutasPorLlamada.push(body.rutas.length);
  const idPorRuta = Object.fromEntries(body.rutas.map((r, i) => [r, `fake-${llamadasArbol}-${i}`]));
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ idPorRuta, creadas: body.rutas.length }) });
});
await page.route("**/api/admin/documents", async (route) => {
  if (route.request().method() !== "POST") return route.continue();
  subidas++;
  await route.fulfill({
    status: 200, contentType: "application/json",
    body: JSON.stringify({ document: { id: `d-${subidas}`, name: `d-${subidas}`, size: 1024, tags: [], aiTags: [], allowedRoles: [] } }),
  });
});
await page.route("**/api/admin/documents/existing", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ porCarpeta: {} }) }));

const t1 = Date.now();
await page.getByRole("button", { name: /^Importar \d+ archivos?$/ }).click();
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}/14-progreso-grande.png` });
await page.getByText("Importación terminada").waitFor({ timeout: 180_000 });
const msImport = Date.now() - t1;
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/15-listo-grande.png` });

console.log(`\nllamadas al árbol: ${llamadasArbol} (rutas por llamada: ${rutasPorLlamada.join(" + ")})`);
console.log(`subidas hechas: ${subidas} (de ${ARBOL.length} del árbol)`);
console.log(`import simulado en: ${(msImport / 1000).toFixed(1)} s`);
const final = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return (d?.innerText ?? "").split("\n").filter((l) => /%|archivos|tanda/i.test(l)).slice(0, 5);
});
console.log("cierre:\n  " + final.join("\n  "));

await browser.close();
