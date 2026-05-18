import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/super-marketplace";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/superadmin/login", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(800);
await page.locator('input[autocomplete="username"]').pressSequentially("superadmin", { delay: 30 });
await page.locator('input[autocomplete="current-password"]').pressSequentially("Super2026!", { delay: 30 });
await page.waitForTimeout(400);
await page.locator('button[type="submit"]').first().click({ force: true });
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);

for (const theme of ["light", "dark"]) {
  await page.goto(`http://localhost:3000/superadmin/marketplace?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate((t) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    try { localStorage.setItem("theme", t); } catch {}
  }, theme);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/redesign-hero-${theme}.png`, fullPage: false });
  console.log("OK", `${OUT}/redesign-hero-${theme}.png`);
}

await ctx.close();
await browser.close();
