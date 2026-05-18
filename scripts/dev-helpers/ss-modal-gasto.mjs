import { chromium } from "playwright";
import path from "node:path";

const TENANT = "mi-pollo";
const BASE = "http://localhost:3000";
const OUT = "reports/visual-verify/punto-compra-baseline";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 980 },
  extraHTTPHeaders: { "x-tenant-id": TENANT },
});

const login = await ctx.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  data: { username: "qaadmin", password: "Qa-admin-1234" },
});
console.log("Login:", login.status());

const page = await ctx.newPage();

for (const theme of ["light", "dark"]) {
  try {
    await page.goto(`${BASE}/t/${TENANT}/admin?tab=compras&sub=punto-compra&_fresh=${Date.now()}`, {
      waitUntil: "domcontentloaded",
      timeout: 30000,
    });
    await page.waitForTimeout(2500);
    await page.evaluate((t) => {
      document.documentElement.classList.toggle("dark", t === "dark");
      try {
        localStorage.setItem("theme", t);
        localStorage.setItem("onboarding-completed-mi-pollo", "1");
      } catch {}
      document.querySelectorAll('[role="dialog"]').forEach((el) => {
        if ((el.textContent ?? "").includes("Configura tu bodega")) el.remove();
      });
    }, theme);
    await page.waitForTimeout(800);
    await page.waitForSelector("text=Artículos para Comprar", { timeout: 15000 });

    // Quitar onboarding agresivamente
    await page.evaluate(() => {
      document.querySelectorAll("[role='dialog']").forEach((el) => {
        const txt = el.textContent ?? "";
        if (txt.includes("Configura tu bodega") || txt.includes("Personaliza tu bodega") || txt.includes("primer producto")) {
          el.remove();
        }
      });
      document.body.style.overflow = "";
    });
    await page.waitForTimeout(300);

    // Click on "Nuevo gasto recurrente" — disparar vía DOM
    await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll("button"));
      const btn = buttons.find((b) => (b.textContent ?? "").includes("Nuevo gasto recurrente"));
      btn?.click();
    });
    await page.waitForSelector('[id="recurring-expense-title"]', { timeout: 8000 });
    await page.waitForTimeout(700);

    const out = path.join(OUT, `02-modal-${theme}.png`);
    await page.screenshot({ path: out, fullPage: false });
    console.log(`OK ${out}`);

    // Cerrar modal
    await page.keyboard.press("Escape").catch(() => {});
  } catch (err) {
    console.error(`Failed ${theme}:`, err.message?.slice(0, 200));
  }
}

await browser.close();
