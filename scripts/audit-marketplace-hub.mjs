// Screenshot del nuevo hub /superadmin/marketplace para validar visualmente.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.request.post(`${BASE}/api/superadmin/auth`, {
    headers: { "content-type": "application/json" },
    data: { username: "superadmin", password: "Super2026!" },
  });
  await page.goto(`${BASE}/superadmin/marketplace`, { waitUntil: "networkidle" });
  await page.waitForTimeout(800);
  await page.screenshot({ path: "reports/audit-superadmin/hub-light.png", fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.waitForTimeout(300);
  await page.screenshot({ path: "reports/audit-superadmin/hub-dark.png", fullPage: true });
  console.log("hub screenshots saved");
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
