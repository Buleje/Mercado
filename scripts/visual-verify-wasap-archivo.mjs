// "Enviar por WhatsApp" tiene que mandar EL ARCHIVO, no un enlace.
//
// Verifica: (1) el modal ofrece las tres vías y arranca en "El archivo";
// (2) NO se gastan enlaces al abrir (antes se creaban siempre); (3) el envío
// postea al endpoint con los ids y el teléfono; (4) si el WhatsApp del negocio
// no está conectado, el aviso lo dice y ofrece la salida; (5) el endpoint real
// responde 409 "sin_conexion" (auth + validación + plumbing vivos).
//
// Uso: node scripts/visual-verify-wasap-archivo.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/wasap-archivo";
const NOMBRE = `boleta-qa-${process.pid}.pdf`;

/** Un PDF mínimo pero válido. */
function pdf() {
  const cuerpo = `%PDF-1.4
1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj
2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj
3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 100]>>endobj
trailer<</Root 1 0 R>>
%%EOF`;
  return Buffer.from(cuerpo, "latin1");
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

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);

await page.evaluate(async (bytes) => {
  const input = [...document.querySelectorAll('input[type="file"][multiple]')].find((i) => !i.hasAttribute("webkitdirectory"));
  const dt = new DataTransfer();
  dt.items.add(new File([Uint8Array.from(bytes.datos)], bytes.nombre, { type: "application/pdf" }));
  input.files = dt.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}, { datos: [...pdf()], nombre: NOMBRE });
await page.waitForTimeout(6000);

const docs = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=500", { credentials: "include" });
  const { documents = [] } = await r.json();
  return documents.map((d) => ({ id: d.id, name: d.name }));
});
const mio = docs.find((d) => d.name === NOMBRE);
if (!mio) { console.error("MAL: no se subió el PDF"); await browser.close(); process.exit(1); }

// Espía: qué endpoints toca el modal.
const llamadas = [];
page.on("request", (r) => {
  const u = r.url();
  if (/\/api\/admin\/documents\/[^/]+\/share|\/api\/admin\/whatsapp\/send-document/.test(u)) {
    llamadas.push(`${r.method()} ${u.replace(BASE, "")}`);
  }
});

await page.getByRole("button", { name: `Enviar por WhatsApp` }).first().click();
await page.getByText("Cómo se manda").waitFor({ timeout: 20_000 });
await page.waitForTimeout(800);

const modal = await page.evaluate(() => {
  const txt = document.body.textContent ?? "";
  const activo = [...document.querySelectorAll("button")].find((b) =>
    /El archivo/.test(b.textContent ?? "") && /data-success/.test(b.className));
  return {
    tresVias: /El archivo/.test(txt) && /Desde este equipo/.test(txt) && /Un enlace/.test(txt),
    archivoPorDefecto: !!activo,
    boton: [...document.querySelectorAll("button")].map((b) => b.textContent?.trim()).find((t) => /Mandar el archivo/.test(t ?? "")) ?? null,
  };
});
await page.screenshot({ path: `${OUT}/01-modal-archivo.png` });

console.log("\n=== MODAL ===");
console.log(`  ${modal.tresVias ? "ok " : "MAL"} ofrece las tres vías`);
console.log(`  ${modal.archivoPorDefecto ? "ok " : "MAL"} arranca en «El archivo»`);
console.log(`  ${modal.boton ? "ok " : "MAL"} botón: ${modal.boton ?? "(no está)"}`);
console.log(`  ${llamadas.some((l) => l.includes("/share")) ? "MAL" : "ok "} NO gasta enlaces al abrir (llamadas: ${llamadas.length === 0 ? "ninguna" : llamadas.join(", ")})`);

// El envío real contra el WhatsApp del tenant: pase lo que pase, el motivo se
// dice con todas las letras (no un "no se pudo" mudo).
await page.getByPlaceholder("929 340 532").fill("929340532");
await page.getByRole("button", { name: /Mandar el archivo/ }).click();
await page.waitForFunction(() => /no está conectado|No salieron|Archivo enviado|No se pudo/i.test(document.body.textContent ?? ""), { timeout: 40_000 }).catch(() => {});
await page.waitForTimeout(500);
const respuesta = await page.evaluate(() => {
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  return {
    sinConexion: /El WhatsApp del negocio no está conectado/.test(txt),
    motivo: txt.match(/No salieron ?[^—]*— ([^]{5,140}?)(?: ?Cerrar|$)/)?.[1]?.trim() ?? null,
    enviado: /Archivo enviado/.test(txt),
  };
});
await page.screenshot({ path: `${OUT}/02-respuesta-real.png` });
console.log("\n=== ENVÍO REAL (WhatsApp del tenant QA) ===");
console.log(`  ${respuesta.sinConexion || respuesta.motivo || respuesta.enviado ? "ok " : "MAL"} el modal dice qué pasó: ${respuesta.sinConexion ? "no está conectado" : respuesta.enviado ? "enviado" : respuesta.motivo ?? "(mudo)"}`);
console.log(`  ${llamadas.some((l) => l.includes("send-document")) ? "ok " : "MAL"} pega al endpoint del archivo`);

// Con el envío OK (respuesta simulada): el resultado se ve.
await page.getByRole("button", { name: "Cerrar", exact: true }).last().click();
await page.waitForTimeout(400);
await page.route("**/api/admin/whatsapp/send-document", (route) =>
  route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ enviados: [{ id: mio.id, nombre: NOMBRE }], fallidos: [] }) }));
await page.getByRole("button", { name: `Enviar por WhatsApp` }).first().click();
await page.getByText("Cómo se manda").waitFor({ timeout: 20_000 });
await page.getByPlaceholder("929 340 532").fill("929340532");
await page.getByRole("button", { name: /Mandar el archivo/ }).click();
await page.waitForFunction(() => /Archivo enviado/i.test(document.body.textContent ?? ""), { timeout: 20_000 }).catch(() => {});
const okEnvio = await page.evaluate(() => /Archivo enviado/i.test(document.body.textContent ?? ""));
await page.screenshot({ path: `${OUT}/03-enviado.png` });
console.log("\n=== ENVÍO OK (simulado) ===");
console.log(`  ${okEnvio ? "ok " : "MAL"} muestra el resultado del envío`);
await page.unroute("**/api/admin/whatsapp/send-document");

// El endpoint de verdad: valida y responde con motivo (sin WABA en QA).
const api = await page.evaluate(async (id) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
  const r = await fetch("/api/admin/whatsapp/send-document", {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": decodeURIComponent(csrf ?? "") },
    body: JSON.stringify({ docIds: [id], phone: "51929340532" }),
  });
  const malo = await fetch("/api/admin/whatsapp/send-document", {
    method: "POST", credentials: "include",
    headers: { "content-type": "application/json", "x-csrf-token": decodeURIComponent(csrf ?? "") },
    body: JSON.stringify({ docIds: [], phone: "abc" }),
  });
  return { envio: { status: r.status, body: await r.json().catch(() => ({})) }, invalido: malo.status };
}, mio.id);
console.log("\n=== ENDPOINT REAL ===");
const resp = api.envio.body;
const explicado = api.envio.status === 409
  ? resp.motivo === "sin_conexion"
  : Array.isArray(resp.fallidos) ? resp.fallidos.every((f) => typeof f.error === "string" && f.error.length > 10) : Array.isArray(resp.enviados);
console.log(`  ${explicado ? "ok " : "MAL"} responde con motivo → ${api.envio.status} ${resp.motivo ?? resp.fallidos?.[0]?.error ?? "enviado"}`);
console.log(`  ${api.invalido === 400 ? "ok " : "MAL"} datos inválidos → ${api.invalido}`);

const st = await page.evaluate(async (id) => {
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
  const r = await fetch(`/api/admin/documents/${id}?purge=1`, {
    method: "DELETE", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") },
  });
  return r.status;
}, mio.id);
console.log(`\nlimpieza: ${st === 200 ? "ok" : `MAL (${st})`}`);
await browser.close();
