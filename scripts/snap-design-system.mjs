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
const errors = [];
page.on("pageerror", (e) => errors.push(`PAGEERROR: ${e.message}`));
page.on("console", (m) => {
  if (m.type() === "error") errors.push(`CONSOLE: ${m.text()}`);
});

// Login UI — esperamos que el botón se habilite tras escribir
await page.goto("http://localhost:3000/superadmin/login", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.locator('input[autocomplete="username"]').pressSequentially("superadmin", { delay: 30 });
await page.locator('input[autocomplete="current-password"]').pressSequentially("Super2026!", { delay: 30 });
await page.waitForTimeout(300);
await page.locator('button[type="submit"]:not([disabled])').click({ timeout: 10000 });
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(500);

// Galería
await page.goto("http://localhost:3000/superadmin/design-system", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/01-galeria.png`, fullPage: true });
console.log("OK galería");

// Editor
await page.click('button:has-text("Editor en vivo")').catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/02-editor-colores.png`, fullPage: false });
console.log("OK editor colores");

// Editor: Tipografía
await page.click('button:has-text("Tipografía")').catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/03-editor-typography.png`, fullPage: false });
console.log("OK editor typography");

// Editor: Botones
await page.click('button:has-text("Botones")').catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/04-editor-buttons.png`, fullPage: false });
console.log("OK editor buttons");

// Editor: Mobile preview
await page.click('button:has-text("mobile")').catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/05-editor-mobile.png`, fullPage: false });
console.log("OK editor mobile");

// Library
await page.click('button:has-text("Mis presets")').catch(() => {});
await page.waitForTimeout(400);
await page.screenshot({ path: `${OUT}/06-library.png`, fullPage: true });
console.log("OK library");

if (errors.length > 0) {
  console.log("---ERRORS---");
  errors.forEach((e) => console.log(e));
} else {
  console.log("--- NO PAGE ERRORS ---");
}

await browser.close();
