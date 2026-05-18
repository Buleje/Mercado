import { chromium } from "playwright";
import path from "node:path";

const TENANT = "mi-pollo";
const BASE = "http://localhost:3000";
const OUT = "reports/visual-verify/punto-compra-baseline";
const LABEL = process.env.LABEL || "05-sugerencias";
const SUB = process.env.SUB || "sugerencias";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  extraHTTPHeaders: { "x-tenant-id": TENANT },
});

const login = await ctx.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  data: { username: "qaadmin", password: "Qa-admin-1234" },
});
console.log("Login:", login.status());

const page = await ctx.newPage();

// Setear localStorage para que ComprasModule arranque en el sub-tab correcto
await page.goto(`${BASE}/t/${TENANT}/admin`, { waitUntil: "domcontentloaded" });
await page.evaluate((sub) => {
  try { localStorage.setItem("admin-last-tab-compras", sub); } catch {}
}, SUB);

for (const theme of ["light", "dark"]) {
  try {
    await page.goto(`${BASE}/t/${TENANT}/admin?tab=compras&sub=${SUB}&_fresh=${Date.now()}`, {
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
    // Eliminar onboarding agresivamente — observer que se mantiene un tiempo
    await page.evaluate(() => {
      const kill = () => {
        document.querySelectorAll("[role='dialog']").forEach((el) => {
          const txt = el.textContent ?? "";
          if (txt.includes("Configura tu bodega") || txt.includes("pasos para empezar") || txt.includes("Personaliza tu bodega")) {
            el.remove();
          }
        });
        document.querySelectorAll("div.fixed.inset-0").forEach((el) => {
          const txt = el.textContent ?? "";
          if (txt.includes("Configura tu bodega") || txt.includes("pasos para empezar")) el.remove();
        });
        document.body.style.overflow = "";
      };
      kill();
      // Poll cada 200ms durante 5s para matar modal si re-aparece
      const interval = setInterval(kill, 200);
      setTimeout(() => clearInterval(interval), 5000);
    });
    await page.waitForTimeout(1200);
    // Esperar título de Sugerencias o empty state
    try {
      await Promise.race([
        page.waitForSelector("text=Sugerencias de compra", { timeout: 25000 }),
        page.waitForSelector("text=Tu inventario está al día", { timeout: 25000 }),
      ]);
    } catch {}
    await page.waitForTimeout(2000);
    try { await page.waitForLoadState("networkidle", { timeout: 6000 }); } catch {}

    const out = path.join(OUT, `${LABEL}-${theme}.png`);
    await page.screenshot({ path: out, fullPage: true });
    console.log(`OK ${out}`);
  } catch (err) {
    console.error(`Failed ${theme}:`, err.message?.slice(0, 200));
  }
}

await browser.close();
