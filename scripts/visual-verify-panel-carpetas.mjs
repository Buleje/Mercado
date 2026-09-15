// El árbol de carpetas dentro del visor: crear, crear subcarpeta, renombrar y
// mover el documento sin cerrar nada. Deja el drive como estaba.
//
// Uso: node scripts/visual-verify-panel-carpetas.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/panel-carpetas";
const MADRE = "QA Carpetas";
const HIJA = "QA Subcarpeta";
const RENOMBRADA = "QA Carpetas (renombrada)";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 950 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();
const erroresJs = [];
page.on("pageerror", (e) => erroresJs.push(String(e)));

const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(4000);

let fallas = 0;
const decir = (ok, txt) => { if (!ok) fallas++; console.log(`${ok ? "OK  " : "MAL "} ${txt}`); };

const carpetas = () => page.evaluate(async () => {
  const r = await fetch("/api/admin/documents/folders", { credentials: "include" });
  const { folders = [] } = await r.json();
  return folders;
});
/** Limpieza PREVIA: una corrida que falló a mitad deja carpetas con estos
 *  nombres, y dos carpetas iguales hacen ambiguo cada selector. */
const borrarCarpeta = (id) => page.evaluate(async (i) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  await fetch(`/api/admin/documents/folders/${i}`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf } });
}, id);

for (const f of (await carpetas()).filter((x) => [MADRE, HIJA, RENOMBRADA].includes(x.name))) {
  await borrarCarpeta(f.id);
  await page.waitForTimeout(600);
}
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(6000);

const doc = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=5", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents[0] ?? null;
});
if (!doc) { console.error("no hay documentos"); process.exit(1); }
const carpetaOriginal = doc.folderId ?? null;

await page.getByRole("button", { name: `Ver ${doc.name}` }).first().click();
await page.waitForTimeout(5000);

// ── El panel está ────────────────────────────────────────────────────────
const panel = page.locator('aside[aria-label="Carpetas del drive"]');
const enPanel = (nombre, exacto = true) => panel.getByRole("button", { name: nombre, exact: exacto });
decir(await panel.count() > 0, "el visor muestra el árbol de carpetas al costado");
await page.screenshot({ path: `${OUT}/panel.png` });

// ── Crear una carpeta desde el visor ─────────────────────────────────────
await enPanel("Crear una carpeta").click();
await page.waitForTimeout(600);
await panel.getByPlaceholder("Nombre de la carpeta").fill(MADRE);
await page.keyboard.press("Enter");
await page.waitForTimeout(3500);
let lista = await carpetas();
const madre = lista.find((f) => f.name === MADRE);
decir(!!madre, `se creó "${MADRE}" sin cerrar el documento`);

// ── Crear una SUBcarpeta dentro de ella ──────────────────────────────────
if (madre) {
  await enPanel(`Crear una subcarpeta dentro de ${MADRE}`).click();
  await page.waitForTimeout(600);
  await panel.getByPlaceholder("Nombre de la subcarpeta").fill(HIJA);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3500);
  lista = await carpetas();
  const hija = lista.find((f) => f.name === HIJA);
  decir(!!hija && hija.parentId === madre.id, `"${HIJA}" quedó DENTRO de "${MADRE}"`);

  // ── Mover el documento a la subcarpeta ─────────────────────────────────
  if (hija) {
    // El nombre accesible del botón es su TEXTO (el nombre de la carpeta),
    // no el `title`; se lo busca dentro del panel para no confundirlo con la
    // carpeta homónima del drive de atrás.
    await enPanel(HIJA).click();
    await page.waitForTimeout(4000);
    const guardado = await page.evaluate(async (id) => {
      const r = await fetch(`/api/admin/documents/${id}`, { credentials: "include" });
      const d = await r.json();
      return d.document?.folderId ?? null;
    }, doc.id);
    decir(guardado === hija.id, `el documento se movió a la subcarpeta (${guardado === hija.id ? "ok" : guardado})`);
    await page.screenshot({ path: `${OUT}/movido.png` });
  }

  // ── Renombrar la carpeta ───────────────────────────────────────────────
  await enPanel(`Cambiar el nombre de ${MADRE}`).click();
  await page.waitForTimeout(600);
  await page.keyboard.press("Control+a");
  await page.keyboard.type(RENOMBRADA);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3500);
  lista = await carpetas();
  decir(lista.some((f) => f.name === RENOMBRADA), `se renombró a "${RENOMBRADA}"`);
}

decir(erroresJs.length === 0, `sin errores de JavaScript (${erroresJs.length})`);
if (erroresJs.length) console.log("\n" + erroresJs.join("\n"));

// ── Dejar el drive como estaba ───────────────────────────────────────────
await page.evaluate(async ({ id, folderId }) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  await fetch(`/api/admin/documents/${id}`, {
    method: "PATCH", credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify({ folderId }),
  });
}, { id: doc.id, folderId: carpetaOriginal });

for (const f of (await carpetas()).filter((x) => [MADRE, HIJA, RENOMBRADA].includes(x.name))) {
  await borrarCarpeta(f.id);
  await page.waitForTimeout(800);
}
console.log("     drive restaurado");

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
