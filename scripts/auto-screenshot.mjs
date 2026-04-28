// Captura screenshot de la URL indicada en env vars.
// Invocado por .claude/hooks/post-edit-ui-screenshot.mjs después de editar UI.
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import path from "node:path";

const URL_PATH = process.env.AUTO_SS_URL || "/";
const LABEL    = process.env.AUTO_SS_LABEL || "page";
const OUT_DIR  = process.env.AUTO_SS_OUT || "reports/visual-verify/last";
const NEEDS_AUTH = process.env.AUTO_SS_AUTH === "1";
const BASE = "http://localhost:3000";
const TENANT = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

async function main() {
  if (!existsSync(CHROMIUM)) {
    console.error("Chromium binary missing");
    process.exit(0);
  }
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
  } catch (err) {
    console.error("Browser launch failed:", err.message?.slice(0, 200));
    process.exit(0);
  }
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "x-tenant-id": TENANT },
  });
  const page = await ctx.newPage();

  // Auth si es ruta admin
  if (NEEDS_AUTH) {
    try {
      const login = await page.request.post(`${BASE}/api/auth/login`, {
        headers: { "content-type": "application/json", "x-tenant-id": TENANT },
        data: { username: USER, password: PASS },
      });
      if (login.status() !== 200) {
        console.error(`Auth failed: ${login.status()}`);
        await browser.close();
        process.exit(0);
      }
    } catch (err) {
      console.error(`Auth error: ${err.message}`);
      await browser.close();
      process.exit(0);
    }
  }

  // Test ambos modos: light + dark
  for (const theme of ["light", "dark"]) {
    try {
      await page.goto(`${BASE}${URL_PATH}`, { waitUntil: "domcontentloaded", timeout: 20000 });
      await page.waitForTimeout(1200);
      // Onboarding bypass
      await page.evaluate(() => {
        try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
        document.querySelectorAll('[role="dialog"]').forEach((el) => {
          if ((el.textContent ?? "").includes("Configura tu bodega")) el.remove();
        });
        document.body.style.overflow = "";
      });
      // Aplicar tema
      await page.evaluate((t) => {
        document.documentElement.classList.toggle("dark", t === "dark");
        try { localStorage.setItem("theme", t); } catch {}
      }, theme);
      await page.waitForTimeout(400);
      try { await page.waitForLoadState("networkidle", { timeout: 4000 }); } catch {}

      const out = path.join(OUT_DIR, `${LABEL}-${theme}.png`);
      await page.screenshot({ path: out, fullPage: false });
      console.log(`OK ${out}`);
    } catch (err) {
      console.error(`Screenshot ${theme} failed:`, err.message?.slice(0, 200));
    }
  }

  await browser.close();
}

main().catch((err) => { console.error(err.message); process.exit(0); });
