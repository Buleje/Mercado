// Un PDF que por dentro es una FOTO (lo que sale de cualquier escáner) era
// invisible para el drive: no tiene texto que extraer. Este verificador crea uno
// de cero, lo sube, y comprueba que el sistema lo lea mirándolo — y que diga que
// lo hizo así, porque un modelo de visión se come un dígito sin avisar.
//
// Uso: node scripts/visual-verify-pdf-escaneado.mjs
import { chromium } from "playwright";
import { createCanvas, GlobalFonts } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/drive-buscar-preguntar";
const NOMBRE = `boleta-escaneada-qa-${process.pid}.pdf`;

/** Una boleta dibujada y metida en un PDF: sin capa de texto, como un escaneo. */
async function pdfEscaneado() {
  GlobalFonts.registerFromPath("node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf", "P");
  const c = createCanvas(900, 650);
  const x = c.getContext("2d");
  x.fillStyle = "#fff"; x.fillRect(0, 0, 900, 650);
  x.fillStyle = "#111"; x.font = "30px P";
  [
    "FERRETERIA LOS ANDES E.I.R.L.",
    "RUC: 20447788991",
    "BOLETA DE VENTA B003-00000912",
    "Fecha: 20/07/2026",
    "Cemento Andino 42.5 kg  x30    S/ 990.00",
    "Fierro corrugado 1/2   x50    S/ 1,450.00",
    "TOTAL: S/ 2,440.00",
  ].forEach((l, i) => x.fillText(l, 40, 70 + i * 80));
  const pdf = await PDFDocument.create();
  const img = await pdf.embedPng(c.toBuffer("image/png"));
  const page = pdf.addPage([img.width, img.height]);
  page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  return Buffer.from(await pdf.save());
}

const fallos = [];
const ok = (c, m) => { console.log(`${c ? "OK  " : "MAL "} ${m}`); if (!c) fallos.push(m); };

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }
await mkdir(OUT, { recursive: true });

await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 90_000 });
await page.waitForTimeout(1500);

// Subir el PDF escaneado por la misma vía que un usuario.
const datos = [...(await pdfEscaneado())];
await page.evaluate(async (a) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(a.datos)], a.nombre, { type: "application/pdf" }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, { datos, nombre: NOMBRE });
await page.waitForTimeout(6000);

// El análisis con un modelo local tarda minutos: se espera al dato, no al reloj.
const id = await page.evaluate(async (nombre) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "";
  const r = await fetch("/api/admin/documents", { credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf) } });
  const { documents = [] } = await r.json();
  return documents.find((d) => d.name === nombre)?.id ?? null;
}, NOMBRE);
ok(!!id, `el PDF escaneado se subió (${NOMBRE})`);

// Se pide el análisis explícitamente y se espera SU respuesta: esperar al
// automático es una carrera contra la cola (y contra otros documentos que
// estén en fila), y un modelo local tarda minutos por página.
const analisis = id
  ? await page.evaluate(async (docId) => {
      const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "";
      const r = await fetch(`/api/admin/documents/${docId}/analyze`, {
        method: "POST",
        credentials: "include",
        headers: { "x-csrf-token": decodeURIComponent(csrf) },
      });
      return { status: r.status, cuerpo: await r.json().catch(() => ({})) };
    }, id)
  : null;
ok(analisis?.status === 200, `el sistema lo leyó mirando la página (HTTP ${analisis?.status})`);

const leido = id
  ? await page.evaluate(async (docId) => {
      const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1] ?? "";
      const r = await fetch(`/api/admin/documents/${docId}`, { credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf) } });
      const { document: d } = await r.json();
      return { via: d?.ocrMetadata?.analyzedVia, escaneo: !!d?.ocrMetadata?.leidoComoEscaneo, texto: d?.ocrText ?? "" };
    }, id)
  : null;
if (leido) {
  ok(leido.via === "vision" && leido.escaneo, `queda marcado como escaneo leído con visión (via=${leido.via})`);
  ok(/ferreter/i.test(leido.texto), `transcribió lo que se ve: "${leido.texto.slice(0, 60).replace(/\s+/g, " ")}…"`);
}

// Lo de la pantalla va adentro de un try: si algo se cuelga acá, el resumen de
// lo que SÍ funcionó tiene que salir igual — es lo que hace útil al verificador.
try {
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 90_000 });
await page.waitForTimeout(2000);
await page.getByRole("button", { name: `Ver ${NOMBRE}`, exact: true }).first().click();
await page.getByRole("button", { name: /^Detalles/ }).click();
await page.waitForTimeout(1500);
ok(await page.getByText(/leído de la 1ª página escaneada/i).isVisible(), "la ficha dice que se leyó mirando la 1ª página");
// El aviso vive en la tarjeta de datos extraídos: si el modelo no sacó
// ninguno (pasa con los chicos), no hay tarjeta que avisar — y está bien.
const hayDatos = (await page.locator("section", { hasText: "Datos extraídos por IA" }).count()) > 0;
ok(!hayDatos || (await page.getByText(/cotejá los números con el papel/i).isVisible()),
  hayDatos ? "avisa que los números salieron de mirar la imagen" : "sin datos estructurados, no hay tarjeta que avisar (correcto)");
await page.screenshot({ path: `${OUT}/pdf-escaneado.png` });

await page.keyboard.press("Control+f");
const campo = page.getByLabel("Buscar adentro del documento");
await campo.waitFor({ timeout: 20_000 }).catch(() => {});
ok(await campo.isVisible().catch(() => false), "Ctrl+F abre el buscador dentro del documento");
ok(await page.getByText(/Este PDF es un escaneo/i).isVisible().catch(() => false), "el buscador aclara que sólo leyó la 1ª página");
await campo.fill("cemento");
await page.waitForTimeout(800);
ok((await page.locator("mark[data-hit]").count()) > 0, "se puede buscar adentro del PDF escaneado");
await page.screenshot({ path: `${OUT}/pdf-escaneado-buscar.png` });
} catch (err) {
  ok(false, `se cortó la verificación en pantalla: ${String(err).split("\n")[0]}`);
  await page.screenshot({ path: `${OUT}/pdf-escaneado-fallo.png` }).catch(() => {});
}

console.log(fallos.length === 0 ? "\n✅ TODO OK" : `\n❌ ${fallos.length} fallo(s):\n· ${fallos.join("\n· ")}`);
await browser.close().catch(() => {});
process.exit(fallos.length === 0 ? 0 : 1);
