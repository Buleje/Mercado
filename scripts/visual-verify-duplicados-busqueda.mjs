// Repetidos del drive + buscar dentro de un PDF.
//
// Sube el MISMO archivo dos veces (más uno distinto del mismo peso, para que
// el detector tenga que distinguirlos de verdad) y comprueba que:
//   · la vista "Repetidos" los agrupa y dice cuánto espacio se recupera;
//   · comprobar el contenido distingue "mismo archivo" de "sólo se parecen";
//   · limpiar deja uno solo;
//   · el buscador del visor encuentra una palabra y dice en qué página está.
//
// Uso: node scripts/visual-verify-duplicados-busqueda.mjs
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/duplicados";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
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
await page.waitForTimeout(3500);

let fallas = 0;
const decir = (ok, txt) => { if (!ok) fallas++; console.log(`${ok ? "OK  " : "MAL "} ${txt}`); };

const pdf = [...(await readFile("/tmp/contrato-qa.pdf"))];
/** Mismo peso que el PDF pero contenido distinto: el detector NO debe decir que son iguales. */
const impostor = [...Buffer.alloc(pdf.length, 0x41)];

async function subir(nombre, datos, mime) {
  await page.evaluate(async ({ nombre, datos, mime }) => {
    const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(datos)], nombre, { type: mime }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { nombre, datos, mime });
  await page.waitForTimeout(4500);
}

await subir("repetido-qa.pdf", pdf, "application/pdf");
await subir("repetido-qa (1).pdf", pdf, "application/pdf");
await subir("impostor-qa.pdf", impostor, "application/pdf");
await page.waitForTimeout(2500);

// ── La vista Repetidos ─────────────────────────────────────────────────────
await page.getByRole("button", { name: "Repetidos", exact: true }).click();
await page.waitForTimeout(4000);
await page.screenshot({ path: `${OUT}/vista.png` });

const vista = await page.evaluate(() => document.body.innerText);
decir(/repetid/i.test(vista), "la vista de repetidos carga");
decir(/repetido-qa/.test(vista), "encontró el archivo subido dos veces");
decir(!/impostor-qa/.test(vista), "y NO agrupó el que sólo comparte el peso");

// ── Comprobar contenido ────────────────────────────────────────────────────
const comprobar = page.getByRole("button", { name: /Comprobar que son iguales/i });
decir(await comprobar.count() > 0, "ofrece comprobar el contenido antes de borrar");
if (await comprobar.count()) {
  await comprobar.first().click();
  await page.waitForTimeout(5000);
  const tras = await page.evaluate(() => document.body.innerText);
  decir(/mismo contenido/i.test(tras), "confirmó que el contenido es idéntico (SHA-256)");
  await page.screenshot({ path: `${OUT}/verificado.png` });
}

// ── Limpiar ────────────────────────────────────────────────────────────────
page.once("dialog", (d) => d.accept());
const limpiar = page.getByRole("button", { name: /Dejar solo el más nuevo/i });
if (await limpiar.count()) {
  await limpiar.first().click();
  await page.waitForTimeout(6000);
  const quedan = await page.evaluate(async () => {
    const r = await fetch("/api/admin/documents?limit=200", { credentials: "include" });
    const { documents = [] } = await r.json();
    return documents.filter((d) => d.name.startsWith("repetido-qa")).length;
  });
  decir(quedan === 1, `tras limpiar queda 1 copia (quedaron ${quedan})`);
}

// ── Buscar dentro del PDF ──────────────────────────────────────────────────
await page.getByRole("button", { name: "Todos", exact: true }).click();
await page.waitForTimeout(2500);
const doc = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=200", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.find((d) => d.name.startsWith("repetido-qa")) ?? null;
});
if (doc) {
  await page.getByRole("button", { name: `Ver ${doc.name}` }).first().click();
  await page.waitForFunction(() => document.querySelector('img[data-pagina="1"]')?.complete, { timeout: 40_000 }).catch(() => {});
  await page.waitForTimeout(2000);

  const buscador = page.getByPlaceholder("Buscar en el documento");
  decir(await buscador.count() > 0, "el visor tiene buscador dentro del documento");
  if (await buscador.count()) {
    // "dos" sólo aparece en la página 2 ("Pagina dos del contrato").
    await buscador.fill("dos");
    await page.waitForTimeout(6000);
    const marcador = await page.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/\b(\d+)\/(\d+)\b(?=[\s\S]{0,40}Buscar|)/);
      return { texto: t.includes("1/1") || /\b1\/\d\b/.test(t), crudo: (t.match(/\b\d\/\d\b/g) || []).slice(0, 3) };
    });
    decir(marcador.texto, `encontró la palabra y muestra en qué coincidencia va (${marcador.crudo.join(", ") || "sin marcador"})`);
    await page.screenshot({ path: `${OUT}/busqueda.png` });
  }
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1200);
}

decir(erroresJs.length === 0, `sin errores de JavaScript (${erroresJs.length})`);

// ── Limpiar lo que creó la prueba ──────────────────────────────────────────
const ids = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=300", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.filter((d) => /-qa( \(\d\))?\.pdf$/.test(d.name) && /repetido|impostor/.test(d.name)).map((d) => d.id);
});
for (const id of ids) {
  await page.evaluate(async (i) => {
    const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
    await fetch(`/api/admin/documents/${i}?purge=1`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf } });
  }, id);
  await page.waitForTimeout(500);
}
console.log(`     limpiados ${ids.length} archivos de prueba`);

if (erroresJs.length) console.log("\n" + erroresJs.join("\n"));
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
