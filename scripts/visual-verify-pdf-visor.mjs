// El PDF tiene que verse SIEMPRE, sin "Este contenido está bloqueado".
//
// Sube un PDF de 3 páginas, lo abre en la vista previa y comprueba que se ve el
// documento — no el cartel de bloqueo del navegador. Registra además las
// violaciones de CSP, que son la causa de ese cartel cuando aparece.
//
// Uso: node scripts/visual-verify-pdf-visor.mjs
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/pdf-visor";
const NOMBRE = "contrato-visor-qa.pdf";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();

const violacionesCsp = [];
const erroresJs = [];
page.on("console", (m) => {
  const t = m.text();
  if (/Content Security Policy|Refused to frame|Refused to load/i.test(t)) violacionesCsp.push(t.slice(0, 200));
});
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

// ── Subir el PDF ───────────────────────────────────────────────────────────
const bytes = [...(await readFile("/tmp/contrato-qa.pdf"))];
await page.evaluate(async ({ nombre, datos }) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(datos)], nombre, { type: "application/pdf" }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, { nombre: NOMBRE, datos: bytes });
await page.waitForTimeout(7000);

const doc = await page.evaluate(async (n) => {
  const r = await fetch("/api/admin/documents?limit=200", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.find((d) => d.name === n) ?? null;
}, NOMBRE);
if (!doc) { console.error("no se subió el PDF"); await browser.close(); process.exit(1); }

// ── Abrir la vista previa ──────────────────────────────────────────────────
await page.getByRole("button", { name: `Ver ${NOMBRE}` }).first().click();
// esperar a que aparezca ALGO: el visor nativo (iframe) o la 1ª página dibujada
await page.waitForFunction(() => {
  const m = document.querySelector('[class*="fixed inset-0 z-50"]');
  if (!m) return false;
  const img = m.querySelector("img[data-pagina]");
  return m.querySelector("iframe") || (img && img.complete && img.naturalWidth > 0);
}, { timeout: 40_000 }).catch(() => {});
await page.waitForTimeout(2500);
await page.screenshot({ path: `${OUT}/preview.png` });

const visto = await page.evaluate(() => {
  const m = document.querySelector('[class*="fixed inset-0 z-50"]');
  if (!m) return null;
  const iframe = m.querySelector("iframe");
  const paginas = m.querySelectorAll('img[data-pagina]');
  return {
    texto: m.innerText.replace(/\n+/g, " · ").slice(0, 240),
    hayIframe: !!iframe,
    srcIframe: iframe?.getAttribute("src")?.slice(0, 40) ?? null,
    paginasDibujadas: paginas.length,
    // ¿alguna imagen de página cargó de verdad?
    paginasCargadas: [...paginas].filter((i) => i.complete && i.naturalWidth > 0).length,
  };
});

decir(!!visto, "el modal de vista previa abre");
decir(violacionesCsp.length === 0, `sin bloqueos de CSP (${violacionesCsp.length})`);
decir(erroresJs.length === 0, `sin errores de JavaScript (${erroresJs.length})`);
if (visto) {
  const seVe = visto.paginasCargadas > 0 || visto.hayIframe;
  decir(seVe, `el documento se ve (${visto.paginasCargadas} página(s) dibujadas${visto.hayIframe ? " · iframe presente" : ""})`);
  decir(!/bloqueado|no se pudo mostrar/i.test(visto.texto), `sin cartel de bloqueo → "${visto.texto.slice(0, 90)}"`);
}

// ── Que además se LEA: una página en tofu tiene muy pocos tonos ────────────
const legible = await page.evaluate(async (id) => {
  const r = await fetch(`/api/admin/documents/${id}/thumbnail?page=1&r=99`, { credentials: "include" });
  if (!r.ok) return { estado: r.status, tonos: 0, bytes: 0 };
  const blob = await r.blob();
  const bmp = await createImageBitmap(blob);
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const cx = cv.getContext("2d");
  cx.drawImage(bmp, 0, 0);
  const { data } = cx.getImageData(0, 0, bmp.width, bmp.height);
  const vistos = new Set();
  for (let i = 0; i < data.length; i += 4 * 29) vistos.add(`${data[i]},${data[i + 1]},${data[i + 2]}`);
  return { estado: r.status, tonos: vistos.size, bytes: blob.size };
}, doc.id);
// El peso es el que discrimina: los cuadraditos comprimen muchísimo mejor que
// las curvas de las letras. Mismo PDF: ~6.5 KB en tofu, ~16.8 KB legible.
decir(legible.bytes > 11_000, `la página se lee: ${legible.bytes} bytes, ${legible.tonos} tonos (en tofu pesa ~6.5 KB)`);

// ── Herramientas y zoom dentro del modal ──────────────────────────────────
// Nombre EXACTO: el sidebar tiene "Herramientas Forestales" y un regex laxo
// clickeaba ese, que está tapado por el modal.
const herr = page.getByRole("button", { name: "Herramientas", exact: true });
decir(await herr.count() > 0, "el modal ofrece el menú de Herramientas");
if (await herr.count()) {
  await herr.first().click();
  await page.waitForTimeout(900);
  const items = await page.evaluate(() => {
    const m = document.querySelector('[class*="fixed inset-0 z-50"]');
    return [...(m?.querySelectorAll("button") ?? [])].map((b) => b.textContent?.trim()).filter(Boolean);
  });
  const esperadas = ["Analizar con IA", "Sellar", "Rotar 90°", "Editar páginas", "Dividir en páginas"];
  const faltan = esperadas.filter((e) => !items.some((i) => i?.includes(e)));
  decir(faltan.length === 0, `las herramientas están en el modal${faltan.length ? " — faltan: " + faltan.join(", ") : ""}`);
  decir(items.some((i) => i?.includes("Está bien")), "y se puede marcar el estado desde el modal");
  // Escape cerraría el MODAL entero; el backdrop del menú tapa la pantalla
  // mientras está abierto, así que se cierra con el propio botón (toggle).
  await page.getByRole("button", { name: "Cerrar el menú" }).click();
  await page.waitForTimeout(900);
}

// El click va por DOM: el backdrop del menú que se acaba de cerrar puede
// seguir un instante y hacer fallar el hit-testing de Playwright. Que el botón
// sea alcanzable se comprueba aparte, con elementFromPoint.
const zoom = await page.evaluate(async () => {
  const btn = document.querySelector('button[aria-label="Acercar"]');
  if (!btn) return { hay: false };
  const r = btn.getBoundingClientRect();
  const encima = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const antes = document.querySelector('img[data-pagina="1"]')?.getBoundingClientRect().width ?? 0;
  btn.click();
  await new Promise((res) => setTimeout(res, 700));
  const despues = document.querySelector('img[data-pagina="1"]')?.getBoundingClientRect().width ?? 0;
  return { hay: true, alcanzable: btn === encima || btn.contains(encima), antes, despues };
});
decir(zoom.hay, "el visor tiene control de zoom");
if (zoom.hay) {
  decir(zoom.alcanzable, "el botón de zoom no está tapado por nada");
  decir(zoom.despues > zoom.antes, `el zoom amplía de verdad: ${Math.round(zoom.antes)} → ${Math.round(zoom.despues)} px`);
}

if (violacionesCsp.length) console.log("\nCSP:\n" + violacionesCsp.join("\n"));
if (erroresJs.length) console.log("\nJS:\n" + erroresJs.join("\n"));

// ── Limpiar ────────────────────────────────────────────────────────────────
await page.keyboard.press("Escape");
await page.waitForTimeout(1200);
await page.evaluate(async (id) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  await fetch(`/api/admin/documents/${id}?purge=1`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf } });
}, doc.id);

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
