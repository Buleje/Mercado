import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT || "reports/visual-verify/super-stores-categories";
const LABEL = process.env.LABEL || "with-subs";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
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
const catTab = page.getByRole("button", { name: /Categor/i }).first();
await catTab.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2000);

// Expand first category
const firstRow = page.locator("article").first();
await firstRow.locator("button").first().click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1000);

// Click "Crear primera subcategoría"  if exists, else "Agregar subcategoría"
const addBtn = page.locator("button", { hasText: /Crear primera subcategor|Agregar subcategor|Agregar otra/i }).first();
await addBtn.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(800);
// Add 2 more to see the grid
const addBtn2 = page.locator("button", { hasText: /Agregar otra subcategor|Agregar subcategor/i }).first();
await addBtn2.click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(500);
await addBtn2.click({ timeout: 3000 }).catch(() => {});
await page.waitForTimeout(1500);

for (const theme of ["light", "dark"]) {
  await page.evaluate((t) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    try { localStorage.setItem("theme", t); } catch {}
  }, theme);
  await page.waitForTimeout(800);
  const fp = `${OUT}/${LABEL}-${theme}.png`;
  await page.screenshot({ path: fp, fullPage: true });
  console.log("OK", fp);
}

await ctx.close();
await browser.close();
