// QA visual: modal Cadena de custodia + gate del certificado (Libro CTP)
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const [USER, PASS, SLUG] = ["qaadmin", "Qa-admin-1234", "main"];

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const login = await page.request.post(`${BASE}/api/auth/login`, {
  data: { username: USER, password: PASS, tenantSlug: SLUG },
});
if (login.status() !== 200) { console.error("LOGIN FAIL", login.status(), await login.text()); process.exit(1); }

await page.addInitScript(() => localStorage.setItem("onboarding-completed-main", "1"));
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);

// Ir a pestaña Despacho
await page.getByRole("button", { name: /Despacho/ }).first().click();
await page.waitForResponse((r) => r.url().includes("/api/admin/forestal/ctp?") && r.status() === 200, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: "reports/ctp-despacho-tabla.png", fullPage: false });

// Click en el primer botón Cadena
const cadenaBtns = page.getByRole("button", { name: "Cadena" });
const count = await cadenaBtns.count();
console.log("botones Cadena:", count);
if (count === 0) { console.error("SIN DESPACHOS REGISTRADOS EN EL PERÍODO"); await browser.close(); process.exit(2); }

const [resp] = await Promise.all([
  page.waitForResponse((r) => r.url().includes("/ctp/origenes?") && r.request().method() === "GET", { timeout: 30000 }),
  cadenaBtns.first().click(),
]);
const json = await resp.json();
console.log("GET origenes status:", resp.status());
console.log("trazabilidad:", JSON.stringify(json.trazabilidad, null, 1)?.slice(0, 500));
console.log("cogs:", JSON.stringify({ cogs: json.cogs?.cogs, unit: json.cogs?.costoUnitario, motivo: json.cogs?.motivo }));

await page.waitForTimeout(1500);
await page.screenshot({ path: "reports/ctp-cadena-modal.png", fullPage: false });

// Estado del botón de certificado
const certBtn = page.getByRole("button", { name: /certificado de trazabilidad/i });
const disabled = await certBtn.isDisabled().catch(() => "no-encontrado");
console.log("certificado disabled:", disabled, "| trazabilidad.completa:", json.trazabilidad?.completa);

// Si la cadena está completa, probar que el print abre popup con el certificado
if (json.trazabilidad?.completa === true) {
  const [popup] = await Promise.all([
    ctx.waitForEvent("page", { timeout: 15000 }),
    certBtn.click(),
  ]);
  await popup.waitForLoadState("domcontentloaded").catch(() => {});
  await popup.emulateMedia({ media: "print" });
  await popup.waitForTimeout(600);
  const title = await popup.title();
  console.log("popup title:", title);
  await popup.screenshot({ path: "reports/ctp-certificado-print.png", fullPage: true });
}

await browser.close();
console.log("OK");
