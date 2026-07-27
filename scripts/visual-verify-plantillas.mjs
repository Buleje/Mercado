// Plantillas del negocio: traer los datos del cliente en vez de tipearlos,
// generar el PDF y mandarlo por WhatsApp en el mismo gesto.
//
// Uso: node scripts/visual-verify-plantillas.mjs
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/plantillas";

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("login fail", login.status()); process.exit(1); }

page.on("dialog", async (d) => { console.log("  [dialog]", d.message().slice(0, 200)); await d.dismiss(); });
page.on("console", (m) => { if (m.type() === "error") console.log("  [console]", m.text().slice(0, 160)); });
page.on("pageerror", (e) => console.log("  [pageerror]", String(e).slice(0, 200)));
page.on("response", (r) => {
  if (r.url().includes("templates/generate")) console.log(`  [red] ${r.status()} ${r.url().replace(BASE, "")}`);
});

await mkdir(OUT, { recursive: true });
await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.getByRole("button", { name: /Importar carpeta/i }).waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);

// Abrir el generador (está en el menú "Escanear y crear").
await page.getByRole("button", { name: /Escanear y crear/i }).click();
await page.waitForTimeout(500);
await page.getByText(/plantilla/i).first().click();
await page.waitForTimeout(1200);
// Dentro del modal: fuera hay sub-pestañas ("Contratos") que se comen el clic.
await page.locator('div.fixed').getByRole("button", { name: /Recibo|Cotización|Contrato/ }).first().click();
await page.waitForTimeout(800);

const inicial = await page.evaluate(() => {
  const fechas = [...document.querySelectorAll('input[type="date"]')].map((i) => i.value);
  return {
    fechaHoy: fechas.some((v) => v === new Date().toISOString().slice(0, 10)),
    hayBuscador: !!document.querySelector('input[aria-label="Buscar cliente"]'),
  };
});
await page.screenshot({ path: `${OUT}/01-plantilla.png` });
console.log("\n=== PLANTILLA ===");
console.log(`  ${inicial.fechaHoy ? "ok " : "MAL"} la fecha arranca en hoy`);
console.log(`  ${inicial.hayBuscador ? "ok " : "MAL"} buscador de clientes del negocio`);

// Traer un cliente: los campos se llenan solos.
let clienteUsado = null;
if (inicial.hayBuscador) {
  await page.getByLabel("Buscar cliente").fill("a");
  await page.waitForTimeout(700);
  const hay = await page.evaluate(() => document.querySelectorAll("ul li button").length);
  if (hay > 0) {
    clienteUsado = await page.evaluate(() => {
      const b = [...document.querySelectorAll("ul li button")].find((x) => /\d{6,}/.test(x.textContent ?? ""));
      b?.click();
      return b?.textContent?.trim() ?? null;
    });
    await page.waitForTimeout(600);
  }
}
const llenado = await page.evaluate(() => {
  const inputs = [...document.querySelectorAll('input[type="text"]')].map((i) => i.value).filter(Boolean);
  return inputs.slice(0, 4);
});
await page.screenshot({ path: `${OUT}/02-cliente-cargado.png` });
console.log(`  ${clienteUsado ? "ok " : "—  "} cliente elegido: ${clienteUsado ?? "(el tenant QA no tiene clientes con teléfono)"}`);
console.log(`  ${llenado.length > 0 ? "ok " : "—  "} campos autocompletados: ${llenado.join(" | ") || "(ninguno)"}`);

// Generar y ofrecer el envío del PDF.
await page.evaluate(() => {
  // Completar lo obligatorio que haya quedado vacío para poder generar.
  const modal = [...document.querySelectorAll("div")].find((d) => d.className.includes("fixed inset-0") && /Generar documento/.test(d.textContent ?? ""));
  for (const el of (modal ?? document).querySelectorAll("input, textarea")) {
    const i = el;
    // Los input[type=file] de la página de atrás no se pueden setear.
    if (i.type === "date" || i.type === "file" || i.getAttribute("aria-label") === "Buscar cliente") continue;
    if (!i.value) {
      const setter = Object.getOwnPropertyDescriptor(window[i.tagName === "TEXTAREA" ? "HTMLTextAreaElement" : "HTMLInputElement"].prototype, "value").set;
      setter.call(i, i.type === "number" ? "100" : "QA");
      i.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }
});
await page.waitForTimeout(400);

// El render del PDF ya se probó aparte contra el endpoint real (200 + documento
// creado). Acá lo que se verifica es la PANTALLA de después: que ofrezca mandar
// el archivo con el número del cliente cargado. Con la respuesta simulada la
// prueba no depende del tiempo de render ni del límite de 10 cada 15 minutos.
await page.route("**/api/admin/documents/templates/generate", (route) =>
  route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      document: {
        id: "doc-qa-plantilla", tenantId: "main", folderId: null,
        name: "cotizacion-qa.pdf", originalName: "cotizacion-qa.pdf",
        mimeType: "application/pdf", size: 12345, storagePath: "qa",
        category: "otros", tags: [], favorite: false, status: "none",
        expiresAt: null, customerId: null, orderId: null, supplierId: null,
        ocrText: null, ocrMetadata: null, aiCategory: null, aiTags: [],
        allowedRoles: [], uploadedById: "qaadmin",
        uploadedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), deletedAt: null,
      },
    }),
  }));
await page.getByRole("button", { name: /Generar documento/ }).click();
// En dev la ruta del PDF se compila la primera vez: puede tardar más de un
// minuto en responder.
await page.waitForFunction(() => /Documento generado|Error/i.test(document.body.textContent ?? ""), { timeout: 180_000 }).catch(() => {});
await page.waitForTimeout(800);
const detalle = await page.evaluate(() => {
  const modal = [...document.querySelectorAll("div")].find((d) => d.className.includes("fixed inset-0") && /Generador de plantillas/.test(d.textContent ?? ""));
  return {
    boton: [...(modal?.querySelectorAll("button") ?? [])].map((b) => b.textContent?.trim()).filter(Boolean).slice(-3),
    tieneExito: /Documento generado/.test(modal?.textContent ?? ""),
  };
});
console.log("  [estado]", JSON.stringify(detalle));
const generado = await page.evaluate(() => ({
  ok: /Documento generado/i.test(document.body.textContent ?? ""),
  botonWasap: [...document.querySelectorAll("button")].some((b) => /Mandarlo por WhatsApp/i.test(b.textContent ?? "")),
}));
await page.screenshot({ path: `${OUT}/03-generado.png` });
console.log("\n=== GENERAR Y MANDAR ===");
console.log(`  ${generado.ok ? "ok " : "MAL"} genera el PDF`);
console.log(`  ${generado.botonWasap ? "ok " : "MAL"} ofrece mandarlo por WhatsApp`);

if (generado.botonWasap) {
  await page.getByRole("button", { name: /Mandarlo por WhatsApp/ }).click();
  await page.waitForTimeout(900);
  const modal = await page.evaluate(() => {
    const tel = [...document.querySelectorAll("input")].find((i) => i.placeholder === "929 340 532");
    return { abre: /Cómo se manda/.test(document.body.textContent ?? ""), telefono: tel?.value ?? "" };
  });
  await page.screenshot({ path: `${OUT}/04-envio.png` });
  console.log(`  ${modal.abre ? "ok " : "MAL"} abre el envío del archivo${modal.telefono ? ` con el número ${modal.telefono} precargado` : ""}`);
}

// Limpieza: borrar el documento generado por la prueba.
const borrado = await page.evaluate(async () => {
  const r = await fetch("/api/admin/documents?limit=20", { credentials: "include" });
  const { documents = [] } = await r.json();
  const d = documents.find((x) => /^(recibo-pago|cotizacion|contrato-alquiler)-\d+\.pdf$/.test(x.name));
  if (!d) return "sin rastro";
  const csrf = document.cookie.split("; ").find((c) => c.startsWith("csrf-token="))?.split("=")[1];
  const del = await fetch(`/api/admin/documents/${d.id}?purge=1`, {
    method: "DELETE", credentials: "include", headers: { "x-csrf-token": decodeURIComponent(csrf ?? "") },
  });
  return del.status === 200 ? "ok" : `MAL (${del.status})`;
});
console.log(`\nlimpieza: ${borrado}`);
await browser.close();
