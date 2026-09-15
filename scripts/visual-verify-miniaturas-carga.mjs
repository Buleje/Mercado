// Miniaturas de Excel/Word y carga de la vista previa.
//
// Comprueba tres cosas que se veían mal:
//   1. La miniatura de una planilla y de un documento tiene TEXTO de verdad y
//      no cuadraditos (sin fuente registrada, el canvas dibuja tofu).
//   2. Mientras se lee el archivo, el visor muestra la miniatura de fondo en
//      vez de una pantalla vacía.
//   3. Pasar el mouse por una tarjeta adelanta el visor, así que abrirla tarda
//      menos que sin pasar el mouse.
//
// Uso: node scripts/visual-verify-miniaturas-carga.mjs
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/miniaturas-carga";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 950 },
  extraHTTPHeaders: { "x-tenant-id": SLUG },
});
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
await page.waitForTimeout(4000);

let fallas = 0;
const decir = (ok, txt) => { if (!ok) fallas++; console.log(`${ok ? "OK  " : "MAL "} ${txt}`); };

// ── 1. Las miniaturas de la grilla tienen contenido ────────────────────────
const docs = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=50", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name, mime: d.mimeType }));
});
const planilla = docs.find((d) => d.name.endsWith(".xlsx"));
const documento = docs.find((d) => d.name.endsWith(".docx"));

/** Una miniatura de tofu es casi toda del mismo gris: pocos tonos distintos. */
async function tonosDeLaMiniatura(id) {
  return await page.evaluate(async (docId) => {
    const r = await fetch(`/api/admin/documents/${docId}/thumbnail?r=2`, { credentials: "include" });
    if (!r.ok) return { estado: r.status, tonos: 0, bytes: 0 };
    const blob = await r.blob();
    const bmp = await createImageBitmap(blob);
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const cx = cv.getContext("2d");
    cx.drawImage(bmp, 0, 0);
    const { data } = cx.getImageData(0, 0, bmp.width, bmp.height);
    const vistos = new Set();
    for (let i = 0; i < data.length; i += 4 * 37) vistos.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
    return { estado: r.status, tonos: vistos.size, bytes: blob.size };
  }, id);
}

if (planilla) {
  const m = await tonosDeLaMiniatura(planilla.id);
  decir(m.estado === 200 && m.bytes > 4_000, `miniatura de planilla: ${m.estado}, ${m.bytes} bytes (tofu pesaba ~1.4 KB)`);
  decir(m.tonos > 20, `miniatura de planilla con ${m.tonos} tonos distintos (texto real, no cuadraditos)`);
}
if (documento) {
  const m = await tonosDeLaMiniatura(documento.id);
  decir(m.estado === 200 && m.bytes > 4_000, `miniatura de documento: ${m.estado}, ${m.bytes} bytes`);
  decir(m.tonos > 20, `miniatura de documento con ${m.tonos} tonos distintos`);
}

await page.screenshot({ path: `${OUT}/grilla.png` });

// ── 2. La miniatura se ve mientras el archivo se lee ───────────────────────
if (planilla) {
  let ralentizar = true;
  await page.route("**/api/admin/documents/*/raw*", async (route) => {
    if (ralentizar) await new Promise((r) => setTimeout(r, 5000));
    await route.continue().catch(() => {});
  });
  await page.getByRole("button", { name: `Ver ${planilla.name}` }).first().click();
  // en un navegador recién abierto la miniatura no está cacheada: se espera a
  // que cargue (en el uso real ya viene de la caché de la grilla).
  await page.waitForFunction(() => {
    const m = document.querySelector('[class*="fixed inset-0 z-50"]');
    const img = m?.querySelector('img[aria-hidden="true"]');
    return img && img.complete && img.naturalWidth > 0;
  }, { timeout: 8000 }).catch(() => {});
  const fondo = await page.evaluate(() => {
    const m = document.querySelector('[class*="fixed inset-0 z-50"]');
    const img = m?.querySelector('img[aria-hidden="true"]');
    return { hay: !!img, src: img?.getAttribute("src") ?? null, cargada: img?.complete && img.naturalWidth > 0 };
  });
  decir(fondo.hay && fondo.cargada, `mientras carga se ve la miniatura de fondo (${fondo.src ?? "sin img"})`);
  await page.screenshot({ path: `${OUT}/cargando.png` });
  ralentizar = false;
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
}

// ── 3. El hover adelanta el visor ──────────────────────────────────────────
// Se comprueba el MECANISMO, no el reloj: que al pasar el mouse el navegador
// ya pida el chunk del visor, antes de que haya un clic. Comparar tiempos de
// dos aperturas seguidas no sirve — la segunda encuentra el chunk en memoria.
{
  const ctx2 = await browser.newContext({
    viewport: { width: 1440, height: 950 },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
    storageState: await ctx.storageState(),
  });
  await ctx2.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
  const p2 = await ctx2.newPage();

  const chunks = [];
  p2.on("request", (r) => {
    const u = r.url();
    if (/\.js(\?|$)/.test(u) && /HojaPreview|xlsx-formato|exceljs/i.test(u)) chunks.push(u.split("/").pop());
  });

  await p2.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await p2.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 60_000 });
  await p2.waitForTimeout(4000);

  const antesDelHover = chunks.length;
  const planillaHover = docs.find((d) => d.name.endsWith(".xlsx"));
  if (planillaHover) {
    await p2.getByRole("button", { name: `Ver ${planillaHover.name}` }).first().hover();
    await p2.waitForTimeout(2500);
    const trasHover = chunks.length;
    decir(trasHover > antesDelHover, `pasar el mouse ya pide el visor: ${trasHover - antesDelHover} chunk(s) sin haber hecho clic`);
  }
  await ctx2.close();
}

await writeFile(`${OUT}/resumen.txt`, `fallas: ${fallas}\n`, "utf8");
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
