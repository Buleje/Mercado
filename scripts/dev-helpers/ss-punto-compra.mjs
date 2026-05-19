import { chromium } from "playwright";
import path from "node:path";

const TENANT = process.env.TENANT || "mi-pollo";
const PATH_ = process.env.PATH_ || `/t/${TENANT}/admin?tab=compras`;
const OUT = process.env.OUT || "reports/visual-verify/punto-compra-baseline";
const LABEL = process.env.LABEL || "baseline";
const BASE = "http://localhost:3000";

const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: { "x-tenant-id": TENANT },
});

const credsByTenant = {
  "mi-pollo": { user: "qaadmin", pass: "Qa-admin-1234" },
  "main": { user: "qaadmin", pass: "Qa-admin-1234" },
  "pizza-pucallpa": { user: "pizzaadmin", pass: "Pizza-2026-Buleje" },
};
const { user, pass } = credsByTenant[TENANT] || credsByTenant["main"];

try {
  const login = await ctx.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
    data: { username: user, password: pass },
  });
  console.log(`Login ${TENANT}/${user}: ${login.status()}`);
} catch (err) {
  console.error("Login error:", err.message);
}

const page = await ctx.newPage();

for (const theme of ["light", "dark"]) {
  try {
    const url = `${BASE}${PATH_}${PATH_.includes("?") ? "&" : "?"}_fresh=${Date.now()}`;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    // Wait for "Punto de Compra" content to load (after dynamic import + data fetch)
    try {
      await page.waitForSelector("text=Artículos para Comprar", { timeout: 15000 });
    } catch {
      try { await page.waitForSelector("text=Catálogo vacío", { timeout: 4000 }); } catch {}
    }
    await page.waitForTimeout(1500);
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      try {
        localStorage.setItem("theme", t);
        localStorage.setItem("onboarding-completed-mi-pollo", "1");
        localStorage.setItem("onboarding-completed-main", "1");
      } catch {}
      document.querySelectorAll('[role="dialog"]').forEach((el) => {
        if ((el.textContent ?? "").includes("Configura tu bodega")) el.remove();
      });
    }, theme);
    await page.waitForTimeout(1000);
    try { await page.waitForLoadState("networkidle", { timeout: 5000 }); } catch {}

    const out = path.join(OUT, `${LABEL}-${theme}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`OK ${out}`);
  } catch (err) {
    console.error(`Screenshot ${theme} failed:`, err.message?.slice(0, 200));
  }
}

await browser.close();
