// El diálogo tipo Explorador: "ya existe un archivo con ese nombre y otro
// contenido". Prueba los TRES caminos contra el drive real (reemplazar como
// versión, conservar los dos renombrando, y omitir) y limpia al terminar.
//
// Uso: node scripts/visual-verify-conflictos.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/importar-carpeta";
const RAIZ = "Conflictos QA";

/** Primero se sube el "viejo"; después el mismo nombre con OTRO peso. */
const VIEJO = 2048;
const NUEVO = 5120;
const NOMBRES = ["contrato.pdf", "boleta.pdf"];

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
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);

async function abrirYElegir(peso) {
  await page.getByRole("button", { name: /Importar carpeta/i }).click();
  await page.waitForTimeout(600);
  await page.evaluate(({ raiz, nombres, peso }) => {
    const input = document.querySelector("input[webkitdirectory]");
    const dt = new DataTransfer();
    for (const n of nombres) {
      const f = new File([new Uint8Array(peso)], n, { type: "application/pdf" });
      Object.defineProperty(f, "webkitRelativePath", { value: `${raiz}/${n}` });
      dt.items.add(f);
    }
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, { raiz: RAIZ, nombres: NOMBRES, peso });
  await page.getByText(/Importar \d+ archivos?|Ya está todo subido/).waitFor({ timeout: 30_000 });
  // Esperar a que TERMINE la consulta de conflictos: si se clickea una opción
  // antes, el diálogo todavía no existe y la elección se pierde en silencio.
  await page.waitForFunction(() => {
    const d = document.querySelector('[role="dialog"]');
    if (!d) return false;
    const txt = d.textContent ?? "";
    return /ya existen? con otro contenido/.test(txt) || /ya estaban? en el drive|Ya está todo subido/.test(txt) || /Importar \d+ archivo/.test(txt);
  }, { timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(1200);
}

async function importarYEsperar() {
  await page.getByRole("button", { name: /^Importar \d+ archivos?$/ }).click();
  await page.getByText(/en el drive|Subieron|No se subió/).waitFor({ timeout: 120_000 });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll("button")].find((x) => x.getAttribute("aria-label") === "Cerrar el panel de importación");
    b?.click();
  });
  await page.waitForTimeout(2000);
}

/** Los documentos que hay ahora en la carpeta de prueba, con versiones. */
async function estado() {
  return page.evaluate(async (raiz) => {
    const { folders = [] } = await (await fetch("/api/admin/documents/folders", { credentials: "include" })).json();
    const f = folders.find((x) => x.name === raiz && !x.parentId);
    if (!f) return [];
    // cache-buster: el listado se cachea y devolvía el estado ANTERIOR al
    // versionado, haciendo parecer que reemplazar no había hecho nada.
    const { documents = [] } = await (await fetch(`/api/admin/documents?folderId=${f.id}&limit=100&_=${Date.now()}`, { credentials: "include", cache: "no-store" })).json();
    return documents.map((d) => ({ id: d.id, name: d.name, size: d.size, versiones: d.versionCount ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, RAIZ);
}

/** Clickea una de las tres opciones del diálogo, asegurando que exista. */
async function elegirOpcion(patron) {
  await page.waitForFunction(() => document.querySelectorAll('button[aria-pressed]').length >= 3, { timeout: 20_000 });
  const ok = await page.evaluate((p) => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => new RegExp(p).test(x.textContent ?? ""));
    b?.click();
    return Boolean(b);
  }, patron);
  await page.waitForTimeout(500);
  if (!ok) console.log(`    ⚠️ no encontré la opción ${patron}`);
}

// ── Base: subir los "viejos" ────────────────────────────────────────────────
await abrirYElegir(VIEJO);
await importarYEsperar();
console.log("base:", (await estado()).map((d) => `${d.name} ${d.size}B v${d.versiones}`).join(" · "));

// ── 1 · Mismo contenido: no debe haber conflicto, se omite solo ─────────────
await abrirYElegir(VIEJO);
const sinConflicto = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return { hayDialogo: /ya existen? con otro contenido/.test(d?.textContent ?? ""), boton: [...d.querySelectorAll("button")].map((b) => b.textContent?.trim()).find((x) => /Ya está todo|Importar/.test(x ?? "")) };
});
console.log(`\n1 · mismo contenido → conflicto: ${sinConflicto.hayDialogo} (esperado false) · botón: "${sinConflicto.boton}"`);
await page.getByRole("button", { name: "Cancelar" }).click();
await page.waitForTimeout(800);

// ── 2 · Otro contenido → aparece el diálogo ─────────────────────────────────
await abrirYElegir(NUEVO);
const conDialogo = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  const txt = (d?.textContent ?? "").replace(/\s+/g, " ");
  return {
    hay: /ya existen? con otro contenido/.test(txt),
    opciones: [...d.querySelectorAll('button[aria-pressed]')].map((b) => `${b.textContent?.trim().split(".")[0]}${b.getAttribute("aria-pressed") === "true" ? " ←" : ""}`),
  };
});
console.log(`\n2 · otro contenido → diálogo: ${conDialogo.hay}\n    opciones: ${conDialogo.opciones.join(" | ")}`);
await page.screenshot({ path: `${OUT}/25-conflictos.png` });

// ── 3 · Reemplazar (default) → versión nueva, NO documento nuevo ────────────
await importarYEsperar();
// El versionado va documento por documento: leer apenas cierra el panel puede
// agarrar el primero listo y el segundo todavía en curso.
let trasReemplazar = await estado();
for (let i = 0; i < 10 && trasReemplazar.some((d) => d.size === VIEJO); i++) {
  await page.waitForTimeout(1000);
  trasReemplazar = await estado();
}
console.log(`\n3 · reemplazar → ${trasReemplazar.length} documentos (esperado ${NOMBRES.length}):`);
for (const d of trasReemplazar) console.log(`    ${d.name} ${d.size}B · ${d.versiones} versiones`);

// ── 4 · Conservar los dos → aparece "(2)" ───────────────────────────────────
await abrirYElegir(NUEVO * 2);
await elegirOpcion("Conservar");
await importarYEsperar();
const trasConservar = await estado();
console.log(`\n4 · conservar los dos → ${trasConservar.length} documentos:`);
for (const d of trasConservar) console.log(`    ${d.name} ${d.size}B · ${d.versiones} versiones`);

// ── 5 · Omitir → no cambia nada ─────────────────────────────────────────────
await abrirYElegir(NUEVO * 3);
await elegirOpcion("Omitir");
const botonTrasOmitir = await page.evaluate(() => {
  const d = document.querySelector('[role="dialog"]');
  return [...d.querySelectorAll("button")].map((b) => b.textContent?.trim()).find((x) => /Ya está todo|Importar \d/.test(x ?? ""));
});
console.log(`\n5 · omitir → el botón dice: "${botonTrasOmitir}"`);
await page.screenshot({ path: `${OUT}/26-omitir.png` });
await page.getByRole("button", { name: "Cancelar" }).click();
await page.waitForTimeout(600);

// ── Limpieza ────────────────────────────────────────────────────────────────
const finales = await estado();
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let borrados = 0;
for (const d of finales) {
  const st = await page.evaluate(async (id) => {
    const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`/api/admin/documents/${id}?purge=1`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") } });
      if (r.status !== 429) return r.status;
      const { retryAfter = 8 } = await r.json().catch(() => ({}));
      await new Promise((res) => setTimeout(res, (retryAfter + 2) * 1000));
    }
    return 429;
  }, d.id);
  if (st === 200) borrados++;
  await dormir(300);
}
await page.evaluate(async (raiz) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
  const { folders = [] } = await (await fetch("/api/admin/documents/folders", { credentials: "include" })).json();
  const f = folders.find((x) => x.name === raiz && !x.parentId);
  if (f) await fetch(`/api/admin/documents/folders/${f.id}`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") } });
}, RAIZ);
console.log(`\nlimpieza: ${borrados} de ${finales.length} documentos + la carpeta`);

await browser.close();
