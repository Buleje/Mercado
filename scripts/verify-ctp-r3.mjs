// QA R3: editar atribución + ficha producción + verificación pública + QR en certificado
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const login = await page.request.post(`${BASE}/api/auth/login`, {
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: "main" },
});
if (login.status() !== 200) { console.error("LOGIN FAIL"); process.exit(1); }

// ── 0. id del despacho para la verificación pública ──
const desp = await page.request.get(`${BASE}/api/admin/forestal/ctp?section=despacho`);
const despJson = await desp.json();
const despachoId = despJson.entries?.[0]?.id;
console.log("despachoId:", despachoId);

// ── 1. Página pública de verificación ──
const pub = await ctx.newPage();
const pubResp = await pub.goto(`${BASE}/verificar/despacho/${despachoId}`, { waitUntil: "domcontentloaded", timeout: 120000 });
console.log("verificar/despacho status:", pubResp?.status());
await pub.waitForTimeout(800);
const veredicto = await pub.getByText(/Cadena de custodia/i).first().textContent().catch(() => "NO ENCONTRADO");
console.log("veredicto público:", veredicto?.trim().slice(0, 120));
await pub.screenshot({ path: "reports/ctp-verificar-publico.png", fullPage: true });
await pub.close();

await page.addInitScript(() => localStorage.setItem("onboarding-completed-main", "1"));
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);

// ── 2. Ficha de PRODUCCIÓN (consumos + costo + congelar) ──
await page.getByRole("button", { name: /Producción/ }).first().click();
await page.waitForTimeout(1500);
const [consResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/ctp/consumos?") && r.request().method() === "GET", { timeout: 30000 }),
  page.getByRole("button", { name: "Cadena" }).first().click(),
]);
const consJson = await consResp.json();
console.log("GET consumos:", consResp.status(), "| consumos:", consJson.consumos?.length, "| costo motivo:", consJson.costo?.motivo, "| congelado:", consJson.costo?.congelado);
await page.waitForTimeout(1200);
await page.screenshot({ path: "reports/ctp-produccion-ficha.png" });

// Editor de consumos
const editBtn1 = page.getByRole("button", { name: "Editar atribución" });
if (await editBtn1.count()) {
  const [availResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("available=produccion"), { timeout: 30000 }),
    editBtn1.first().click(),
  ]);
  console.log("available=produccion:", availResp.status(), "items:", ((await availResp.json()).items ?? []).length);
  await page.waitForTimeout(800);
  await page.screenshot({ path: "reports/ctp-produccion-editor.png" });
  await page.getByRole("button", { name: "Cancelar" }).first().click();
} else {
  console.log("(sin botón editar en producción — congelado?)");
}
await page.keyboard.press("Escape");
await page.waitForTimeout(600);

// ── 3. Modal DESPACHO: editar atribución + certificado con QR ──
await page.getByRole("button", { name: /Despacho/ }).first().click();
await page.waitForTimeout(1500);
await Promise.all([
  page.waitForResponse((r) => r.url().includes("/ctp/origenes?"), { timeout: 30000 }),
  page.getByRole("button", { name: "Cadena" }).first().click(),
]);
await page.waitForTimeout(1000);

const editBtn2 = page.getByRole("button", { name: "Editar atribución" });
const [availResp2] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("available=despacho"), { timeout: 30000 }),
  editBtn2.first().click(),
]);
console.log("available=despacho:", availResp2.status(), "items:", ((await availResp2.json()).items ?? []).length);
await page.waitForTimeout(800);
await page.screenshot({ path: "reports/ctp-despacho-editor.png" });

// Guardar la MISMA atribución (round-trip PUT sin cambiar datos)
const [putResp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/ctp/origenes") && r.request().method() === "PUT", { timeout: 30000 }),
  page.getByRole("button", { name: "Guardar atribución" }).click(),
]);
console.log("PUT origenes:", putResp.status(), (await putResp.json()).trazabilidad?.completa === true ? "cadena sigue completa" : "OJO cadena");
await page.waitForTimeout(1200);

// Certificado con QR
const [popup] = await Promise.all([
  ctx.waitForEvent("page", { timeout: 15000 }),
  page.getByRole("button", { name: /certificado de trazabilidad/i }).click(),
]);
await popup.waitForLoadState("domcontentloaded").catch(() => {});
await popup.waitForTimeout(700);
const qrCount = await popup.locator(".verif img").count();
const hasVerifyUrl = (await popup.content()).includes("/verificar/despacho/");
console.log("certificado QR imgs:", qrCount, "| URL verificación presente:", hasVerifyUrl);
await popup.emulateMedia({ media: "print" });
await popup.screenshot({ path: "reports/ctp-certificado-qr.png", fullPage: true });

await browser.close();
console.log("OK");
