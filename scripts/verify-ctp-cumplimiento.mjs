// QA: pestaña Cumplimiento con la alerta #6 (despachos sin trazabilidad) + endpoint traza=1
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const login = await page.request.post(`${BASE}/api/auth/login`, {
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: "main" },
});
if (login.status() !== 200) { console.error("LOGIN FAIL", login.status()); process.exit(1); }

// Endpoint nuevo directo
const traza = await page.request.get(`${BASE}/api/admin/forestal/ctp?traza=1`);
console.log("GET ctp?traza=1:", traza.status(), await traza.text());

await page.addInitScript(() => localStorage.setItem("onboarding-completed-main", "1"));
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones`, { waitUntil: "domcontentloaded", timeout: 120000 });
await page.waitForTimeout(2500);

await page.getByRole("button", { name: /Cumplimiento/ }).first().click();
await page.waitForResponse((r) => r.url().includes("traza=1") && r.status() === 200, { timeout: 30000 }).catch(() => console.log("(sin response traza en UI)"));
await page.waitForTimeout(1500);
await page.screenshot({ path: "reports/ctp-cumplimiento-traza.png", fullPage: true });

const rowText = await page.getByText(/cadena de custodia/i).allTextContents();
console.log("filas cadena:", JSON.stringify(rowText));
await browser.close();
console.log("OK");
