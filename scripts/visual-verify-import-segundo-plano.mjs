// El import tiene que seguir corriendo aunque cierres el modal Y te vayas a
// otra pestaña del panel. Con la red interceptada: 0 escrituras en la base.
//
// Uso: node scripts/visual-verify-import-segundo-plano.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/importar-carpeta";
const RAIZ = "Segundo plano QA";

const ARBOL = Array.from({ length: 60 }, (_, i) =>
  `${RAIZ}/caja-${String(Math.floor(i / 10) + 1)}/doc-${i + 1}.pdf`);

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

let subidas = 0;
await page.route("**/api/admin/documents/folders/tree", (route) => {
  const body = JSON.parse(route.request().postData() ?? "{}");
  const idPorRuta = Object.fromEntries(body.rutas.map((r, i) => [r, `fake-${i}`]));
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ idPorRuta, creadas: body.rutas.length }) });
});
await page.route("**/api/admin/documents", async (route) => {
  if (route.request().method() !== "POST") return route.continue();
  subidas++;
  await new Promise((r) => setTimeout(r, 250)); // lento a propósito: da tiempo a navegar
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ document: { id: `d-${subidas}`, name: "x", size: 1024, tags: [], aiTags: [], allowedRoles: [] } }) });
});
await page.route("**/api/admin/documents/existing", (route) =>
  route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ porCarpeta: {} }) }));

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.waitForTimeout(4000);
await page.getByRole("button", { name: /Importar carpeta/i }).click();
await page.waitForTimeout(600);
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
await page.getByRole("button", { name: /^Importar \d+ archivos?$/ }).click();

// El modal tiene que haberse cerrado solo y el panel flotante tomado la posta.
await page.waitForTimeout(1200);
const modalCerrado = (await page.locator('[role="dialog"]').count()) === 0;
const panel = await page.evaluate(() => {
  const p = [...document.querySelectorAll("div")].find((d) => /Importando en|Importando \d+%/.test(d.textContent ?? "") && d.className.includes("fixed"));
  return p?.innerText.split("\n").slice(0, 4).join(" · ") ?? "(sin panel)";
});
console.log("modal cerrado solo:", modalCerrado);
console.log("panel flotante:", panel);
await page.screenshot({ path: `${OUT}/18-flotante-en-drive.png` });

// ── Irse a otra pestaña del panel ──────────────────────────────────────────
const antes = subidas;
// OJO: navegar con page.goto RECARGA la página y mata el import (los File viven
// en memoria). Un usuario no hace eso: clickea el sidebar, que es navegación
// SPA. La prueba tiene que hacer lo mismo.
await page.getByRole("button", { name: /^Inventario/ }).first().click();
await page.waitForTimeout(3000);
const sigueVisible = await page.evaluate(() =>
  [...document.querySelectorAll("div,button")].some((d) => /Importando/.test(d.textContent ?? "") && d.className.includes("fixed")));
console.log(`\ncambié a Inventario · panel visible: ${sigueVisible} · subidas ${antes} → ${subidas}`);
await page.screenshot({ path: `${OUT}/19-flotante-otra-pestana.png` });

// Encogerlo a pastilla
await page.evaluate(() => {
  const btn = [...document.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Encoger el panel de importación");
  btn?.click();
});
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/20-pastilla.png` });
const pastilla = await page.evaluate(() => {
  const b = [...document.querySelectorAll("button")].find((x) => /Importando \d+%/.test(x.textContent ?? ""));
  return b?.innerText.replace(/\n/g, " ") ?? "(sin pastilla)";
});
console.log("pastilla:", pastilla);

// Esperar el final desde la otra pestaña — encogido, el aviso vive en la
// pastilla; hay que desplegar para ver el cierre completo.
await page.getByText(/Importación lista/).waitFor({ timeout: 180_000 });
await page.getByText(/Importación lista/).click();
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/21-terminado-otra-pestana.png` });
const cierre = await page.evaluate(() => {
  const p = [...document.querySelectorAll("div")].find((d) => d.className.includes("fixed") && /archivos? en el drive|Subieron/.test(d.textContent ?? ""));
  return p?.innerText.split("\n").filter(Boolean).slice(-3).join(" · ") ?? "(sin cierre)";
});
console.log(`\nterminó con ${subidas} subidas · cierre: ${cierre}`);

await browser.close();
