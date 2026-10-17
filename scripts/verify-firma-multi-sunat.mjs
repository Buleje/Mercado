// Firma en varios niveles + lectura de comprobantes SUNAT, contra el servidor.
//
// La prueba que importa: que el SEGUNDO firmante NO pueda firmar antes que el
// primero. Un contrato firmado fuera de orden no vale, así que eso tiene que
// fallar de verdad, no sólo en la lógica pura.
//
// Uso: node scripts/verify-firma-multi-sunat.mjs
import { chromium } from "playwright";
import { readFile } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ extraHTTPHeaders: { "x-tenant-id": SLUG } });
const page = await ctx.newPage();

const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(3000);

let fallas = 0;
const decir = (ok, txt) => { if (!ok) fallas++; console.log(`${ok ? "OK  " : "MAL "} ${txt}`); };

const subir = (nombre, datos, mime) => page.evaluate(async ({ nombre, datos, mime }) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(datos)], nombre, { type: mime }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, { nombre, datos, mime });

const buscar = (nombre) => page.evaluate(async (n) => {
  const r = await fetch("/api/admin/documents?limit=300", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.find((d) => d.name === n) ?? null;
}, nombre);

const purgar = (id) => page.evaluate(async (i) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  await fetch(`/api/admin/documents/${i}?purge=1`, { method: "DELETE", credentials: "include", headers: { "x-csrf-token": csrf } });
}, id);

// ── 1. Firma en varios niveles ────────────────────────────────────────────
await subir("contrato-firmas-qa.pdf", [...(await readFile("/tmp/contrato-qa.pdf"))], "application/pdf");
await page.waitForTimeout(6000);
const doc = await buscar("contrato-firmas-qa.pdf");
if (!doc) { console.error("no se subió el PDF"); await browser.close(); process.exit(1); }

const ronda = await page.evaluate(async (id) => {
  const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
  const r = await fetch(`/api/admin/documents/${id}/firmantes`, {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": csrf },
    body: JSON.stringify({
      firmantes: [{ nombre: "Ana Torres", cargo: "Arrendataria" }, { nombre: "Luis Buleje", cargo: "Arrendador" }],
      enOrden: true,
    }),
  });
  return { estado: r.status, datos: await r.json().catch(() => ({})) };
}, doc.id);

decir(ronda.estado === 200, `la ronda se crea (${ronda.estado})`);
const firmantes = ronda.datos?.ronda?.firmantes ?? [];
decir(firmantes.length === 2 && firmantes.every((f) => f.token), "cada firmante recibió su propio enlace");
decir(ronda.datos?.turno?.[0]?.nombre === "Ana Torres", `le toca a ${ronda.datos?.turno?.[0]?.nombre ?? "nadie"} (la primera)`);

// El SEGUNDO intenta firmar antes de tiempo: tiene que ser rechazado.
const fueraDeOrden = await page.request.post(`${BASE}/api/public/documents/${firmantes[1]?.token}/sign`, {
  headers: { "content-type": "application/json" },
  data: { signerName: "Luis Buleje", signerRole: "Arrendador" },
});
decir(fueraDeOrden.status() === 409, `el segundo NO puede firmar antes que la primera (${fueraDeOrden.status()})`);

// Ahora sí, en orden.
const primera = await page.request.post(`${BASE}/api/public/documents/${firmantes[0]?.token}/sign`, {
  headers: { "content-type": "application/json" },
  data: { signerName: "Ana Torres", signerRole: "Arrendataria" },
});
const cuerpo1 = await primera.json().catch(() => ({}));
decir(primera.status() === 200, `la primera firma pasa (${primera.status()})`);
decir(cuerpo1?.ronda?.firmados === 1, `la ronda cuenta ${cuerpo1?.ronda?.firmados ?? "?"} de ${cuerpo1?.ronda?.total ?? "?"}`);

const segunda = await page.request.post(`${BASE}/api/public/documents/${firmantes[1]?.token}/sign`, {
  headers: { "content-type": "application/json" },
  data: { signerName: "Luis Buleje", signerRole: "Arrendador" },
});
const cuerpo2 = await segunda.json().catch(() => ({}));
decir(segunda.status() === 200, `ahora sí puede firmar el segundo (${segunda.status()})`);
decir(cuerpo2?.ronda?.estado === "completada", `la ronda queda ${cuerpo2?.ronda?.estado ?? "?"}`);

// Y no puede volver a firmar.
const repetida = await page.request.post(`${BASE}/api/public/documents/${firmantes[0]?.token}/sign`, {
  headers: { "content-type": "application/json" },
  data: { signerName: "Ana Torres" },
});
decir(repetida.status() === 409, `nadie firma dos veces (${repetida.status()})`);

await purgar(doc.id);

// ── 2. Comprobante SUNAT ──────────────────────────────────────────────────
const xml = await readFile("/tmp/factura-qa.xml");
await subir("factura-qa.xml", [...xml], "text/xml");
await page.waitForTimeout(6000);
const docXml = await buscar("factura-qa.xml");
if (docXml) {
  const rev = await page.evaluate(async (id) => {
    const csrf = document.cookie.match(/csrf-token=([^;]+)/)?.[1] ?? "";
    const r = await fetch(`/api/admin/documents/${id}/sunat`, {
      method: "POST", credentials: "include", headers: { "x-csrf-token": csrf },
    });
    return { estado: r.status, datos: await r.json().catch(() => ({})) };
  }, docXml.id);

  decir(rev.estado === 200, `el XML de la factura se lee (${rev.estado})`);
  const c = rev.datos?.comprobante;
  decir(c?.tipoNombre === "Factura" && c?.serie === "F001", `reconoce: ${c?.tipoNombre ?? "?"} ${c?.serie ?? "?"}-${c?.correlativo ?? "?"}`);
  decir(c?.total === 1180, `y los importes: total ${c?.total ?? "?"} · IGV ${c?.igv ?? "?"}`);
  const errores = (rev.datos?.hallazgos ?? []).filter((h) => h.severidad === "error");
  decir(errores.length === 0, `sin observaciones que corregir (${(rev.datos?.hallazgos ?? []).map((h) => h.severidad).join(", ")})`);
  await purgar(docXml.id);
} else {
  decir(false, "no se pudo subir el XML");
}

console.log(fallas === 0 ? "\nTODO OK" : `\n${fallas} FALLA(S)`);
await browser.close();
process.exit(fallas === 0 ? 0 : 1);
