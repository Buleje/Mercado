import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "reports/design-system";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  localStorage.setItem("active-tenant", "main");
});
await page.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
await page.locator("#username").first().pressSequentially("qaadmin", { delay: 30 });
await page.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 30 });
await page.waitForTimeout(400);
await page.locator("#password").first().press("Enter");
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(3500);
await page.evaluate(() => {
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
});
await page.screenshot({ path: `${OUT}/final-mercado-moderno-admin.png`, fullPage: false });
console.log("Saved");
await browser.close();
