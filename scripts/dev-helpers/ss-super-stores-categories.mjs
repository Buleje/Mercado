import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT || "reports/visual-verify/super-stores-categories";
const LABEL = process.env.LABEL || "baseline";
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
await page.locator('button[type="submit"]').first().click({ timeout: 10000, force: true });
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 20000 }).catch(() => {});
await page.waitForTimeout(1500);

await page.goto(`http://localhost:3000/superadmin/stores?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
// Click on Categorías tab
const catTab = page.getByRole("button", { name: /Categor/i }).first();
await catTab.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2000);

// Screenshot 1: collapsed list
await page.screenshot({ path: `${OUT}/${LABEL}-01-collapsed.png`, fullPage: true });
console.log("OK 01-collapsed");

// Try to expand the first category
const firstRow = page.locator("article").first();
await firstRow.locator("button").first().click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1000);

await page.screenshot({ path: `${OUT}/${LABEL}-02-expanded.png`, fullPage: true });
console.log("OK 02-expanded");

await ctx.close();
await browser.close();
