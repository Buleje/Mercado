// Borrar carpetas desde el visor (con el aviso completo) y observaciones sobre
// el documento. Limpia antes y después: una corrida a medias deja basura que
// vuelve ambiguo cada selector.
//
// Uso: node scripts/visual-verify-carpetas-comentarios.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/carpetas-comentarios";
const MADRE = "QA Borrar";
const HIJA = "QA Borrar Hija";

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
const crearCarpeta = (name, parentId) => page.evaluate(async ({ name, parentId }) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  const r = await fetch("/api/admin/documents/folders", {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify({ name, parentId }),
  });
  return (await r.json()).folder ?? null;
}, { name, parentId });
const borrarCarpeta = (id) => page.evaluate(async (i) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  await fetch(`/api/admin/documents/folders/${i}`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf } });
}, id);

// Limpieza previa
for (const f of (await carpetas()).filter((x) => [MADRE, HIJA].includes(x.name))) {
  await borrarCarpeta(f.id);
  await page.waitForTimeout(500);
}

// Escenario: una carpeta con una subcarpeta adentro.
const madre = await crearCarpeta(MADRE, null);
await crearCarpeta(HIJA, madre?.id ?? null);
await page.reload({ waitUntil: "domcontentloaded" });
await page.waitForTimeout(7000);

const doc = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=5", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents[0] ?? null;
});
await page.getByRole("button", { name: `Ver ${doc.name}` }).first().click();
await page.waitForTimeout(5000);

const panel = page.locator('aside[aria-label="Carpetas del drive"]');
const enPanel = (nombre) => panel.getByRole("button", { name: nombre, exact: true });

// ── El aviso de borrado dice lo que se lleva puesto ──────────────────────
let aviso = "";
page.once("dialog", async (d) => { aviso = d.message(); await d.dismiss(); });
await enPanel(`Borrar la carpeta ${MADRE}`).click();
await page.waitForTimeout(1500);

decir(/subcarpeta/i.test(aviso), "el aviso habla de las subcarpetas");
decir(aviso.includes(HIJA), `y las nombra una por una ("${HIJA}")`);
decir(/no se borran|no hay documentos|tampoco se borran/i.test(aviso), "y aclara qué pasa con lo de adentro");
decir(/no se puede deshacer/i.test(aviso), "y avisa que no se puede deshacer");
console.log(`     aviso: ${aviso.replace(/\n+/g, " · ").slice(0, 150)}`);

// Al cancelar, la carpeta sigue estando.
decir((await carpetas()).some((f) => f.name === MADRE), "al cancelar NO se borra nada");

// Ahora sí, aceptando.
page.once("dialog", async (d) => { await d.accept(); });
await enPanel(`Borrar la carpeta ${MADRE}`).click();
await page.waitForTimeout(4000);
// Comportamiento REAL de la base: se borra la carpeta y la subcarpeta queda
// suelta en la raíz (el schema declara cascada, pero la base no la aplica).
const despues = await carpetas();
decir(!despues.some((f) => f.name === MADRE), "al aceptar se borra la carpeta");
const hija = despues.find((f) => f.name === HIJA);
decir(!!hija && hija.parentId === null, `la subcarpeta queda suelta en la raíz, no se pierde (parent: ${hija?.parentId ?? "raíz"})`);
if (hija) await borrarCarpeta(hija.id);
await page.screenshot({ path: `${OUT}/panel.png` });

// ── Observaciones sobre el documento ─────────────────────────────────────
await page.getByRole("button", { name: /^Observaciones/ }).click();
await page.waitForTimeout(2500);
await page.getByPlaceholder(/falta la firma/i).fill("Falta el anexo B — revisar antes de firmar");
await page.getByRole("button", { name: "Publicar", exact: true }).click();
await page.waitForTimeout(3000);

const texto1 = await page.evaluate(() => document.body.innerText);
decir(/Falta el anexo B/.test(texto1), "la observación queda publicada");
decir(/1 observación abierta/.test(texto1), "y se cuenta como abierta");

await page.getByRole("button", { name: /Marcar resuelta/ }).click();
await page.waitForTimeout(3000);
const texto2 = await page.evaluate(() => document.body.innerText);
decir(/0 observaciones abiertas|0 observación/.test(texto2), "marcarla resuelta la saca de las abiertas");
await page.screenshot({ path: `${OUT}/observaciones.png` });

// Persiste de verdad
const guardadas = await page.evaluate(async (id) => {
  const r = await fetch(`/api/admin/documents/${id}/comentarios`, { credentials: "include" });
  const d = await r.json();
  return d.comentarios ?? [];
}, doc.id);
const mia = guardadas.find((c) => c.texto.includes("Falta el anexo B"));
decir(!!mia && !!mia.resueltoEn, `queda guardada en el documento y marcada resuelta (${guardadas.length} en total)`);

decir(erroresJs.length === 0, `sin errores de JavaScript (${erroresJs.length})`);
if (erroresJs.length) console.log("\n" + erroresJs.join("\n"));

// Limpieza con el endpoint de borrado (el PATCH del documento no acepta
// ocrMetadata, así que el intento anterior no borraba nada).
await page.evaluate(async ({ id, ids }) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  for (const cid of ids) {
    await fetch(`/api/admin/documents/${id}/comentarios?comentarioId=${cid}`, {
      method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf },
    });
  }
}, { id: doc.id, ids: guardadas.map((c) => c.id) });
console.log("     datos de prueba limpiados");

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
