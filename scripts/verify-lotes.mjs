// QA E2E módulo Lotes de Producción forestal (ADR-136).
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const login = await page.request.post(`${BASE}/api/auth/login`, {
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: "main" },
});
if (login.status() !== 200) { console.error("LOGIN FAIL", login.status()); process.exit(1); }

// ── 0. Corridas disponibles (para saber si hay con qué armar un lote) ──
const avail = await page.request.get(`${BASE}/api/admin/forestal/lotes?available=1`);
const availJson = await avail.json();
console.log("available corridas:", avail.status(), "count:", (availJson.items ?? []).length);
const corrida = (availJson.items ?? [])[0];

await page.addInitScript(() => localStorage.setItem("onboarding-completed-main", "1"));
await page.goto(`${BASE}/admin?tab=forestal-lotes`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForResponse((r) => r.url().includes("/forestal/lotes?stats=1") && r.status() === 200, { timeout: 30000 }).catch(() => console.log("(sin stats resp)"));
await page.waitForTimeout(1500);
await page.screenshot({ path: "reports/lotes-modulo.png", fullPage: false });
console.log("módulo renderizado. Título presente:", await page.getByText("Lotes de Producción").first().isVisible());

if (!corrida) { console.log("SIN corridas disponibles — no se puede crear lote. (módulo OK igual)"); await browser.close(); process.exit(0); }

// ── 1. Crear un lote ──
await page.getByRole("button", { name: /Nuevo lote/ }).click();
await page.waitForTimeout(800);
// Elegir la primera corrida del buscador
await page.getByPlaceholder(/Buscar corrida/).click();
await page.waitForTimeout(500);
const firstOpt = page.locator("button", { hasText: corrida.code }).first();
await firstOpt.click();
await page.waitForTimeout(400);
await page.getByPlaceholder(/Maderera Ucayali/).fill("Comprador QA EIRL");
await page.screenshot({ path: "reports/lotes-form.png", fullPage: false });
const [createResp] = await Promise.all([
  page.waitForResponse((r) => r.url().endsWith("/forestal/lotes") && r.request().method() === "POST", { timeout: 30000 }),
  page.getByRole("button", { name: "Crear lote" }).click(),
]);
const created = await createResp.json();
console.log("POST lote:", createResp.status(), "code:", created.lote?.loteCode);
const loteId = created.lote?.id;
await page.waitForTimeout(1200);

// ── 2. Abrir el detalle → trazabilidad + certificado + etiqueta ──
await page.getByText(created.lote.loteCode).first().click();
const [detResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/lotes/detalle?") && r.request().method() === "GET", { timeout: 30000 }),
  Promise.resolve(),
]).catch(() => [null]);
await page.waitForTimeout(1000);
const det = detResp ? await detResp.json() : null;
console.log("GET detalle:", detResp?.status(), "| trazabilidad completa:", det?.trazabilidad?.completa, "| motivo:", det?.trazabilidad?.motivo, "| miembros:", det?.lote?.miembros?.length);
await page.screenshot({ path: "reports/lotes-detalle.png", fullPage: false });

// Etiqueta (no requiere cadena completa) → abre popup con QR
const [labelPopup] = await Promise.all([
  ctx.waitForEvent("page", { timeout: 15000 }),
  page.getByRole("button", { name: "Etiqueta" }).click(),
]).catch(() => [null]);
if (labelPopup) {
  await labelPopup.waitForLoadState("domcontentloaded").catch(() => {});
  await labelPopup.waitForTimeout(600);
  const qr = await labelPopup.locator("img.qr").count();
  const hasVerify = (await labelPopup.content()).includes("/verificar/lote/");
  console.log("etiqueta QR imgs:", qr, "| URL verificación:", hasVerify);
  await labelPopup.emulateMedia({ media: "print" });
  await labelPopup.screenshot({ path: "reports/lotes-etiqueta.png", fullPage: true });
  await labelPopup.close();
}

// ── 3. Cerrar el lote (transición de estado) ──
const cerrarBtn = page.getByRole("button", { name: /Cerrar lote/ });
if (await cerrarBtn.count()) {
  const [closeResp] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/forestal/lotes") && r.request().method() === "PATCH", { timeout: 30000 }),
    cerrarBtn.click(),
  ]);
  console.log("PATCH cerrar:", closeResp.status(), "| status:", (await closeResp.json()).lote?.status);
  await page.waitForTimeout(1000);
}

// ── 4. Página pública de verificación ──
const pub = await ctx.newPage();
const pubResp = await pub.goto(`${BASE}/verificar/lote/${loteId}`, { waitUntil: "domcontentloaded", timeout: 60000 });
await pub.waitForTimeout(1000);
console.log("verificar/lote status:", pubResp?.status(), "| código visible:", await pub.getByText(created.lote.loteCode).first().isVisible().catch(() => false));
await pub.screenshot({ path: "reports/lotes-verificar-publico.png", fullPage: true });

await browser.close();
console.log("OK");
