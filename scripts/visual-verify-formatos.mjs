// El drive tiene que guardar CASI TODO: Office, LibreOffice, fotos HEIC,
// comprimidos, planos, correos y hasta archivos sin extensión. Lo único que
// rebota son los ejecutables. Y lo que no es seguro de mostrar se sirve como
// descarga, no inline.
//
// Uso: node scripts/visual-verify-formatos.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/importar-carpeta";
const RAIZ = "Formatos QA";

/** [nombre, mime que manda el navegador, ¿debería entrar?] */
const CASOS = [
  ["caja-julio.ods", "", true],                 // LibreOffice: el navegador no lo conoce
  ["contrato.odt", "", true],
  ["charla.pptx", "application/vnd.openxmlformats-officedocument.presentationml.presentation", true],
  ["IMG_0042.heic", "", true],                  // foto de iPhone
  ["escaneo.tiff", "", true],
  ["respaldo.rar", "", true],
  ["respaldo.7z", "", true],
  ["local.dwg", "", true],                      // plano
  ["proveedor.eml", "", true],                  // correo guardado
  ["logo.svg", "image/svg+xml", true],          // entra, pero NO se muestra inline
  ["BLAS doc", "", true],                       // sin extensión
  ["virus.exe", "application/octet-stream", false],
  ["factura.pdf.exe", "application/pdf", false], // disfrazado
  ["script.bat", "", false],
];

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
// Esperar a que el módulo esté montado de verdad: el input existe recién ahí.
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 30_000 });
await page.waitForTimeout(1500);

// Subir todo de una por el input normal del drive.
await page.evaluate((casos) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  for (const [nombre, mime] of casos) {
    dt.items.add(new File([new Uint8Array(2048)], nombre, { type: mime }));
  }
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, CASOS);

await page.waitForTimeout(9000);
await page.screenshot({ path: `${OUT}/22-formatos.png` });

// Qué quedó realmente en el drive, con qué tipo.
const enDrive = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=500", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ name: d.name, mime: d.mimeType, id: d.id }));
});
const porNombre = new Map(enDrive.map((d) => [d.name, d]));

console.log("=== QUÉ ENTRÓ ===");
let mal = 0;
for (const [nombre, , deberia] of CASOS) {
  const doc = porNombre.get(nombre);
  const entro = Boolean(doc);
  const ok = entro === deberia;
  if (!ok) mal++;
  console.log(`  ${ok ? "ok " : "MAL"} ${nombre.padEnd(24)} ${entro ? `guardado como ${doc.mime}` : "rechazado"}`);
}
console.log(mal === 0 ? "\nTodo como se esperaba." : `\n⚠️  ${mal} casos fuera de lo esperado`);

// El SVG: guardado sí, mostrado inline NO.
const svg = porNombre.get("logo.svg");
if (svg) {
  const heads = await page.evaluate(async (id) => {
    const r = await fetch(`/api/admin/documents/${id}/raw`, { credentials: "include" });
    return { disp: r.headers.get("content-disposition"), nosniff: r.headers.get("x-content-type-options") };
  }, svg.id);
  console.log(`\nSVG servido con: ${heads.disp} · nosniff=${heads.nosniff}`);
}
const pdfDemo = enDrive.find((d) => d.mime === "application/pdf" && d.name.endsWith(".pdf"));
if (pdfDemo) {
  const disp = await page.evaluate(async (id) => {
    const r = await fetch(`/api/admin/documents/${id}/raw`, { credentials: "include" });
    return r.headers.get("content-disposition");
  }, pdfDemo.id);
  console.log(`PDF servido con: ${disp} (tiene que seguir siendo inline para la vista previa)`);
}

// Limpieza: sólo lo que creó esta prueba.
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const nombres = new Set(CASOS.map(([n]) => n));
let borrados = 0;
for (const d of enDrive.filter((x) => nombres.has(x.name))) {
  const st = await page.evaluate(async (id) => {
    const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
    for (let i = 0; i < 6; i++) {
      const r = await fetch(`/api/admin/documents/${id}?purge=1`, {
        method: "DELETE", credentials: "include",
        headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") },
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
console.log(`\nlimpieza: ${borrados} de ${enDrive.filter((x) => nombres.has(x.name)).length}`);

await browser.close();
void RAIZ;
