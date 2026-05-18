import { chromium } from "playwright";
import { mkdirSync, readFileSync } from "node:fs";

const OUT = "reports/visual-verify/super-stores-categories";
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
await page.waitForTimeout(1500);

// Open the StoreLinkerModal (PrimaryStoreLinker trigger button)
const linkerBtn = page.locator("button", { hasText: /Elegir tiendas y ver productos|Gestionar.*tiendas/i }).first();
await linkerBtn.click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(2000);

await page.screenshot({ path: `${OUT}/modal-linker-light.png`, fullPage: false });
console.log("OK modal-linker-light");

await page.evaluate(() => {
  document.documentElement.classList.add("dark");
  try { localStorage.setItem("theme", "dark"); } catch {}
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/modal-linker-dark.png`, fullPage: false });
console.log("OK modal-linker-dark");

// Close modal
await page.keyboard.press("Escape");
await page.waitForTimeout(500);

// Switch back to light
await page.evaluate(() => {
  document.documentElement.classList.remove("dark");
  try { localStorage.setItem("theme", "light"); } catch {}
});
await page.waitForTimeout(500);

// Test image cropper: simulate file pick on the category image uploader
// File input is hidden, we use setInputFiles
const fileInputs = await page.locator('input[type="file"]').all();
console.log("File inputs found:", fileInputs.length);
if (fileInputs.length > 0) {
  // Use a sample image from the cropper test (a placeholder)
  const samplePath = "reports/visual-verify/super-stores-categories/baseline-01-collapsed.png";
  try {
    readFileSync(samplePath); // ensure exists
    await fileInputs[0].setInputFiles(samplePath);
    await page.waitForTimeout(1500);
    await page.screenshot({ path: `${OUT}/cropper-light.png`, fullPage: false });
    console.log("OK cropper-light");
  } catch (e) {
    console.log("Cropper test skipped:", e.message);
  }
}

await ctx.close();
await browser.close();
