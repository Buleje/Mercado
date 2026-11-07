// El modal: ubicación del archivo a la vista, mover desde ahí, y que las otras
// secciones se lean bien en un modal de 1400 px.
//
// Uso: node scripts/visual-verify-modal-secciones.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/modal-secciones";

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
await page.waitForTimeout(4000);

let fallas = 0;
const decir = (ok, txt) => { if (!ok) fallas++; console.log(`${ok ? "OK  " : "MAL "} ${txt}`); };

/** El documento con el que se prueba, y su carpeta original para restaurarla. */
const doc = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=50", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents[0] ?? null;
});
if (!doc) { console.error("no hay documentos"); process.exit(1); }
const carpetas = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents/folders", { credentials: "include" });
  const { folders = [] } = await r.json();
  return folders;
});

await page.getByRole("button", { name: `Ver ${doc.name}` }).first().click();
await page.waitForTimeout(5000);

// ── 1. La ubicación se ve en el encabezado ────────────────────────────────
// El nombre accesible del botón es su TEXTO (la ruta o "Sin carpeta"), no el
// title. Se lo busca dentro del encabezado del modal.
const ubic = page.locator('[class*="fixed inset-0 z-50"] header button[title*="carpeta"]');
const textoUbic = await page.evaluate(() => {
  const b = document.querySelector('[class*="fixed inset-0 z-50"] header button[title*="carpeta"]');
  return b?.textContent?.trim() ?? null;
});
decir(await ubic.count() > 0, `la carpeta del archivo se ve en el encabezado: "${textoUbic ?? "no está"}"`);
await page.screenshot({ path: `${OUT}/encabezado.png` });

// ── 2. Se puede mover desde ahí ───────────────────────────────────────────
if (await ubic.count() && carpetas.length > 0) {
  await ubic.first().click();
  await page.waitForTimeout(800);
  const opciones = await page.evaluate(() => {
    const menu = [...document.querySelectorAll("div")].find((d) => d.textContent?.trim().startsWith("Guardar en"));
    return [...(menu?.querySelectorAll("button") ?? [])].map((b) => b.textContent?.trim()).filter(Boolean);
  });
  decir(opciones.some((o) => o?.includes("Sin carpeta")), "el selector ofrece la raíz");
  decir(opciones.some((o) => o?.includes(carpetas[0].name)), `y las carpetas del drive (${carpetas[0].name})`);
  await page.screenshot({ path: `${OUT}/selector.png` });

  await page.getByRole("button", { name: carpetas[0].name, exact: false }).last().click();
  await page.waitForTimeout(4000);
  const guardado = await page.evaluate(async (id) => {
    const r = await fetch(`/api/admin/documents/${id}`, { credentials: "include" });
    const d = await r.json();
    return d.document?.folderId ?? null;
  }, doc.id);
  decir(guardado === carpetas[0].id, `moverlo desde el modal lo guarda de verdad (folderId=${guardado === carpetas[0].id ? "ok" : guardado})`);

  // dejarlo donde estaba
  await page.evaluate(async ({ id, folderId }) => {
    const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
    await fetch(`/api/admin/documents/${id}`, {
      method: "PATCH", credentials: "include",
      headers: { "content-type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ folderId }),
    });
  }, { id: doc.id, folderId: doc.folderId ?? null });
}

// ── 3. Las secciones se leen bien (no líneas de 1400 px) ──────────────────
for (const [pestania, etiqueta] of [["Detalles", "detalles"], ["Versiones", "versiones"], ["Compartir", "compartir"], ["Auditoría", "auditoria"]]) {
  const tab = page.getByRole("button", { name: new RegExp(`^${pestania}`) });
  if (await tab.count() === 0) { decir(false, `no se encontró la pestaña ${pestania}`); continue; }
  await tab.first().click();
  await page.waitForTimeout(2200);
  const ancho = await page.evaluate(() => {
    // Se busca el contenedor con ancho de lectura sin depender del ORDEN de
    // las clases de Tailwind (antes era "mx-auto max-w-" literal y dejó de
    // matchear cuando la sección pasó a grid).
    const cont = [...document.querySelectorAll('[class*="fixed inset-0 z-50"] div')]
      .find((d) => /max-w-\d?xl/.test(d.className) && /mx-auto/.test(d.className));
    if (!cont) return null;
    const r = cont.getBoundingClientRect();
    return { contenido: Math.round(r.width), ventana: window.innerWidth };
  });
  decir(!!ancho && ancho.contenido < ancho.ventana * 0.85,
    `${pestania}: el contenido se lee en ${ancho?.contenido ?? "?"}px, no estirado a ${ancho?.ventana ?? "?"}px`);
  await page.screenshot({ path: `${OUT}/${etiqueta}.png` });
}

decir(erroresJs.length === 0, `sin errores de JavaScript (${erroresJs.length})`);
if (erroresJs.length) console.log("\n" + erroresJs.join("\n"));

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
