import { chromium } from "playwright";
import path from "node:path";

const TENANT = "mi-pollo";
const BASE = "http://localhost:3000";
const OUT = "reports/visual-verify/punto-compra-baseline";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  extraHTTPHeaders: { "x-tenant-id": TENANT },
});
await ctx.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  data: { username: "qaadmin", password: "Qa-admin-1234" },
});

const page = await ctx.newPage();
await page.goto(`${BASE}/t/${TENANT}/admin`, { waitUntil: "domcontentloaded" });
await page.evaluate(() => { try { localStorage.setItem("admin-last-tab-compras", "ordenes-compra"); } catch {} });

for (const theme of ["light", "dark"]) {
  try {
    await page.goto(`${BASE}/t/${TENANT}/admin?tab=compras&sub=ordenes-compra&_fresh=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(3000);
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      try {
        localStorage.setItem("theme", t);
        localStorage.setItem("onboarding-completed-mi-pollo", "1");
      } catch {}
    }, theme);
    await page.waitForTimeout(800);
    // Quitar onboarding agresivamente
    await page.evaluate(() => {
      const kill = () => {
        document.querySelectorAll("[role='dialog']").forEach((el) => {
          const txt = el.textContent ?? "";
          if (txt.includes("Configura tu bodega") || txt.includes("pasos para empezar")) el.remove();
        });
        document.body.style.overflow = "";
      };
      kill();
      const interval = setInterval(kill, 200);
      setTimeout(() => clearInterval(interval), 4000);
    });
    await page.waitForTimeout(800);
    await page.waitForSelector("text=Órdenes de Compra", { timeout: 15000 });
    await page.waitForTimeout(800);

    // Abrir modal "Nueva orden"
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => (b.textContent ?? "").trim() === "Nueva orden" || (b.textContent ?? "").includes("Crear primera orden"));
      btn?.click();
    });
    await page.waitForSelector("[id='create-oc-title']", { timeout: 8000 });
    await page.waitForTimeout(700);

    const out = path.join(OUT, `09-modal-oc-${theme}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`OK ${out}`);
  } catch (err) {
    console.error(`Failed ${theme}:`, err.message?.slice(0, 200));
  }
}

await browser.close();
