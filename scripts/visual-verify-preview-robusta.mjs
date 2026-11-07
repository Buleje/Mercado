// La vista previa no puede romperse con NINGÚN archivo.
//
// Sube a propósito archivos que rompen: un .xlsx que no es un xlsx, un tipo
// desconocido y uno vacío. En los tres casos la vista previa tiene que mostrar
// un aviso legible (nunca una pantalla en blanco, un error de React ni el
// cuerpo de la respuesta dibujado como si fuera el archivo).
//
// Uso: node scripts/visual-verify-preview-robusta.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/preview-robusta";

/** Archivos rotos a propósito. */
const CASOS = [
  {
    nombre: "roto-qa.xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    bytes: [...Buffer.from("esto no es una planilla, es texto suelto".repeat(20))],
    espera: /no se pudo|no se puede|descarg/i,
  },
  {
    // Un archivo de 0 bytes ni siquiera llega: lo frena la validación previa de
    // la subida (upload-limits), que es lo correcto. Acá se prueba el caso
    // siguiente: un archivo que sí sube pero no tiene nada que mostrar.
    nombre: "casi-vacio-qa.csv",
    mime: "text/csv",
    bytes: [...Buffer.from("\n")],
    espera: /vac|sin datos|no se pudo|Hoja/i,
  },
  {
    nombre: "raro-qa.docx",
    mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    bytes: [0x00, 0x01, 0x02, 0x03, 0xff, 0xfe, 0x00, 0x00],
    espera: /no se pudo|vac|descarg/i,
  },
];

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();

const erroresConsola = [];
page.on("pageerror", (e) => erroresConsola.push(String(e)));

const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(3000);

let fallas = 0;
const decir = (ok, txt) => { if (!ok) fallas++; console.log(`${ok ? "OK  " : "MAL "} ${txt}`); };

// ── Subir los archivos rotos ───────────────────────────────────────────────
for (const caso of CASOS) {
  await page.evaluate(async ({ nombre, mime, bytes }) => {
    const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
    const dt = new DataTransfer();
    dt.items.add(new File([Uint8Array.from(bytes)], nombre, { type: mime }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }, caso);
  await page.waitForTimeout(4000);
}
await page.waitForTimeout(3000);

const subidos = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=200", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name }));
});

// ── Abrir la vista previa de cada uno ──────────────────────────────────────
for (const caso of CASOS) {
  const doc = subidos.find((d) => d.name === caso.nombre);
  if (!doc) { decir(false, `${caso.nombre}: no se subió (¿lo rechazó la validación? eso también es válido, pero hay que mirarlo)`); continue; }

  const antes = erroresConsola.length;
  await page.getByRole("button", { name: `Ver ${caso.nombre}` }).first().click();
  await page.waitForTimeout(6000);

  const visto = await page.evaluate(() => {
    const m = document.querySelector('[class*="fixed inset-0 z-50"]');
    if (!m) return { hayModal: false, texto: "" };
    return { hayModal: true, texto: m.innerText.replace(/\n+/g, " · ") };
  });

  decir(visto.hayModal, `${caso.nombre}: el modal abre`);
  decir(caso.espera.test(visto.texto), `${caso.nombre}: muestra un aviso legible → "${(visto.texto.match(caso.espera) || ["(no se encontró)"])[0]}"`);
  decir(erroresConsola.length === antes, `${caso.nombre}: sin errores de JavaScript (${erroresConsola.length - antes})`);
  // Nunca debe verse el JSON de un error dibujado como si fuera el archivo.
  decir(!/\{"error"|password_required|rate_limit/i.test(visto.texto), `${caso.nombre}: no dibuja el cuerpo de un error como contenido`);

  await page.screenshot({ path: `${OUT}/${caso.nombre.replace(/\W+/g, "-")}.png` });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(1500);
}

// ── Limpiar ────────────────────────────────────────────────────────────────
for (const caso of CASOS) {
  const doc = subidos.find((d) => d.name === caso.nombre);
  if (!doc) continue;
  await page.evaluate(async (id) => {
    const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
    await fetch(`/api/admin/documents/${id}?purge=1`, {
      method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf },
    });
  }, doc.id);
  await page.waitForTimeout(600);
}

if (erroresConsola.length) console.log("\nerrores de JS observados:\n" + erroresConsola.join("\n"));
console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
