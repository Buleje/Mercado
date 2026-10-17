// Vista previa de lo que antes era "sin vista previa": fotos HEIC, escaneos
// TIFF, SVG y presentaciones .pptx/.odp. Sube archivos REALES (generados acá),
// abre la ficha de cada uno y verifica que se vea algo. Limpia al terminar.
//
// Uso: node scripts/visual-verify-preview-formatos.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import JSZip from "jszip";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/importar-carpeta";

/** Una imagen de verdad (cuadros de color) en el formato pedido. */
async function imagen(formato) {
  const base = sharp({
    create: { width: 600, height: 400, channels: 3, background: { r: 20, g: 160, b: 160 } },
  }).composite([{
    input: Buffer.from(`<svg width="600" height="400"><rect x="40" y="40" width="220" height="150" fill="#ff6b5b"/><text x="40" y="260" font-size="42" fill="white">QA ${formato}</text></svg>`),
    top: 0, left: 0,
  }]);
  // OJO: este sharp LEE heif/hevc pero sólo ESCRIBE av1 (falta el encoder hevc).
  // Para la prueba alcanza: el contenedor es HEIF igual, que es lo que el
  // navegador no sabe dibujar y el servidor tiene que convertir.
  if (formato === "heic") return base.heif({ compression: "av1", quality: 60 }).toBuffer();
  if (formato === "tiff") return base.tiff().toBuffer();
  return base.png().toBuffer();
}

/** Un .pptx mínimo pero VÁLIDO: lo que importa son los slideN.xml. */
async function pptx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>`);
  const slide = (titulo, ...lineas) =>
    `<?xml version="1.0"?><p:sld xmlns:p="p" xmlns:a="a"><p:cSld><p:spTree>${[titulo, ...lineas]
      .map((t) => `<p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp>`).join("")}</p:spTree></p:cSld></p:sld>`;
  zip.file("ppt/slides/slide1.xml", slide("Resultados de julio", "Ventas S/ 42.000", "Fiado al día"));
  zip.file("ppt/slides/slide2.xml", slide("Plan de agosto", "Abrir los domingos"));
  zip.file("ppt/slides/slide3.xml", slide("Gracias"));
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Un .ods como los que genera LibreOffice, CON celdas repetidas y relleno. */
async function ods() {
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.spreadsheet");
  const c = (v) => `<table:table-cell office:value-type="string"><text:p>${v}</text:p></table:table-cell>`;
  zip.file("content.xml", `<?xml version="1.0"?><office:document-content xmlns:office="o" xmlns:table="t" xmlns:text="x"><office:body><office:spreadsheet>
    <table:table table:name="Caja julio">
      <table:table-row>${c("Día")}${c("Ingreso")}${c("Egreso")}</table:table-row>
      <table:table-row>${c("Lunes")}${c("420.50")}${c("120.00")}</table:table-row>
      <table:table-row>${c("Martes")}<table:table-cell table:number-columns-repeated="2"/></table:table-row>
      <table:table-row table:number-rows-repeated="900"><table:table-cell table:number-columns-repeated="16384"/></table:table-row>
      <table:table-row>${c("Total")}<table:table-cell table:formula="of:=SUM([.B2:.B3])" office:value="420.5"><text:p>420.5</text:p></table:table-cell></table:table-row>
    </table:table>
    <table:table table:name="Proveedores"><table:table-row>${c("Kola Real")}</table:table-row></table:table>
  </office:spreadsheet></office:body></office:document-content>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Un .odt con título, subtítulo y párrafos. */
async function odt() {
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.text");
  zip.file("content.xml", `<?xml version="1.0"?><office:document-content xmlns:office="o" xmlns:text="x"><office:body><office:text>
    <text:h text:outline-level="1">Contrato de alquiler</text:h>
    <text:h text:outline-level="2">Primera cláusula</text:h>
    <text:p>El arrendatario pagará S/ 1.500 mensuales por el local de Jirón Ucayali 450.</text:p>
    <text:p/>
    <text:p>La garantía es de S/ 3.000 y se devuelve al terminar.</text:p>
  </office:text></office:body></office:document-content>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

/** Un .odp mínimo: todo en content.xml. */
async function odp() {
  const zip = new JSZip();
  zip.file("mimetype", "application/vnd.oasis.opendocument.presentation");
  zip.file("content.xml", `<?xml version="1.0"?><office:document-content xmlns:office="o" xmlns:draw="d" xmlns:text="t"><office:body><office:presentation>
    <draw:page draw:name="p1"><text:p>Acopio de cacao</text:p><text:p>Tres productores nuevos</text:p></draw:page>
    <draw:page draw:name="p2"><text:p>Precio de la semana</text:p></draw:page>
  </office:presentation></office:body></office:document-content>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

const ARCHIVOS = [
  { nombre: "foto-qa.heic", buf: await imagen("heic"), tipo: "" },
  { nombre: "escaneo-qa.tiff", buf: await imagen("tiff"), tipo: "" },
  { nombre: "logo-qa.svg", buf: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200"><circle cx="150" cy="100" r="80" fill="#00a0a0"/></svg>'), tipo: "image/svg+xml" },
  { nombre: "charla-qa.pptx", buf: await pptx(), tipo: "" },
  { nombre: "cacao-qa.odp", buf: await odp(), tipo: "" },
  { nombre: "caja-qa.ods", buf: await ods(), tipo: "" },
  { nombre: "contrato-qa.odt", buf: await odt(), tipo: "" },
];

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 60_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);

await page.evaluate(async (archivos) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  for (const a of archivos) {
    dt.items.add(new File([Uint8Array.from(a.bytes)], a.nombre, { type: a.tipo }));
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, ARCHIVOS.map((a) => ({ nombre: a.nombre, tipo: a.tipo, bytes: [...a.buf] })));

await page.waitForTimeout(9000);
await page.screenshot({ path: `${OUT}/23-grilla-formatos.png` });

const enDrive = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=500", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name, mime: d.mimeType }));
});
const mios = enDrive.filter((d) => d.name.includes("-qa."));
console.log("subidos:", mios.map((d) => `${d.name} (${d.mime})`).join(", "));

// 1 · La conversión server-side de imágenes
console.log("\n=== IMÁGENES CONVERTIDAS ===");
for (const nombre of ["foto-qa.heic", "escaneo-qa.tiff", "logo-qa.svg"]) {
  const doc = mios.find((d) => d.name === nombre);
  if (!doc) { console.log(`  MAL ${nombre}: no se subió`); continue; }
  const r = await page.evaluate(async (id) => {
    const res = await fetch(`/api/admin/documents/${id}/preview-image?max=400`, { credentials: "include" });
    const buf = new Uint8Array(await res.arrayBuffer());
    // Magic bytes de PNG: 89 50 4E 47
    const esPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    return { status: res.status, tipo: res.headers.get("content-type"), bytes: buf.length, esPng };
  }, doc.id);
  console.log(`  ${r.status === 200 && r.esPng ? "ok " : "MAL"} ${nombre.padEnd(18)} ${r.status} ${r.tipo} ${r.bytes} bytes${r.esPng ? " · PNG válido" : ""}`);
}

// 2 · La vista previa en el modal, formato por formato
console.log("\n=== VISTA PREVIA EN EL MODAL ===");
for (const [i, nombre] of ["foto-qa.heic", "charla-qa.pptx", "cacao-qa.odp", "caja-qa.ods", "contrato-qa.odt"].entries()) {
  const doc = mios.find((d) => d.name === nombre);
  if (!doc) continue;
  await page.getByRole("button", { name: `Ver ${nombre}` }).first().click();
  // Esperar a que el modal EXISTA antes de mirar adentro: encadenar clics tras
  // un Escape hacía que la siguiente iteración midiera el modal cerrándose.
  await page.waitForFunction(() =>
    [...document.querySelectorAll("div")].some((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa")),
    { timeout: 20_000 }).catch(() => {});
  // En dev, el chunk de jszip se compila la primera vez: esperar al CONTENIDO,
  // no a un timeout — con 2.6 s la captura salía en "Leyendo la presentación…".
  await page.waitForFunction(() => {
    const d = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
    if (!d) return false;
    const txt = d.textContent ?? "";
    const img = d.querySelector("img");
    // `complete` + naturalWidth: que el <img> EXISTA no significa que ya cargó
    // (medía 0x0 y parecía roto).
    if (img) return img.complete && img.naturalWidth > 0;
    return /diapositivas?|No se pudo leer|Caja julio|Contrato de alquiler|no se pudo mostrar/i.test(txt);
  }, { timeout: 40_000 }).catch(() => {});
  await page.waitForTimeout(600);
  // OJO: sin el modal NO hay que caer al body — la grilla de atrás también
  // tiene <img preview-image> y daba un falso positivo para el pptx/odp.
  const visto = await page.evaluate(() => {
    const d = [...document.querySelectorAll("div")].find((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa"));
    if (!d) return { falta: true };
    const img = d.querySelector("img");
    const cuerpo = (d.textContent ?? "").replace(/\s+/g, " ");
    // Para ODS/ODT interesa el CUERPO, no la cabecera del modal.
    const tabla = d.querySelector("table");
    return {
      imagen: img ? `${img.naturalWidth}x${img.naturalHeight}` : null,
      diapos: /(\d+) diapositivas?/.exec(cuerpo)?.[0] ?? null,
      celdas: tabla ? [...tabla.querySelectorAll("tbody td")].map((td) => td.textContent).filter(Boolean).slice(0, 8).join(" | ") : null,
      parrafos: [...d.querySelectorAll("p, h1, h2, h3")].map((x) => x.textContent?.trim()).filter((x) => x && x.length > 8).slice(0, 3).join(" / "),
      muestra: cuerpo.slice(0, 200),
    };
  });
  if (visto.falta) console.log(`  MAL ${nombre}: no se abrió el modal`);
  else if (visto.imagen) console.log(`  ${nombre}: imagen ${visto.imagen}`);
  else if (visto.diapos) console.log(`  ${nombre}: ${visto.diapos}`);
  else if (visto.celdas) console.log(`  ${nombre}: tabla → ${visto.celdas}`);
  else if (visto.parrafos) console.log(`  ${nombre}: texto → ${visto.parrafos}`);
  else console.log(`  MAL ${nombre}: (sin vista) ${visto.muestra.slice(0, 120)}`);
  await page.screenshot({ path: `${OUT}/24-preview-${i + 1}-${nombre.split(".").pop()}.png` });
  await page.keyboard.press("Escape");
  await page.waitForFunction(() =>
    ![...document.querySelectorAll("div")].some((x) => x.className.includes("fixed inset-0") && x.textContent?.includes("Vista previa")),
    { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(500);
}

// 3 · Limpieza
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let borrados = 0;
for (const d of mios) {
  const st = await page.evaluate(async (id) => {
    const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`/api/admin/documents/${id}?purge=1`, {
        method: "DELETE", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") },
      });
      if (r.status !== 429) return r.status;
      const { retryAfter = 8 } = await r.json().catch(() => ({}));
      await new Promise((res) => setTimeout(res, (retryAfter + 2) * 1000));
    }
    return 429;
  }, d.id);
  if (st === 200) borrados++;
  await dormir(300);
}
console.log(`\nlimpieza: ${borrados} de ${mios.length}`);

await browser.close();
