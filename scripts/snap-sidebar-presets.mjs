import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/sidebar-buleje";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/superadmin/login", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(800);
await page.locator("#su-username").fill("superadmin");
await page.locator("#su-password").fill("Super2026!");
await page.waitForTimeout(300);
await Promise.all([
  page.locator('button[type="submit"]').first().click(),
  page.waitForURL("**/superadmin/**", { timeout: 15000 }).catch(() => {}),
]);
await page.waitForTimeout(2000);

// Aplicar cada preset y screenshot el sidebar
const PRESETS = [
  { id: "buleje",    label: "Buleje",    theme: "buleje",  accent: "teal",   density: "normal",  iconStyle: "monochrome" },
  { id: "ejecutivo", label: "Ejecutivo", theme: "dark",    accent: "amber",  density: "compact", iconStyle: "monochrome" },
  { id: "sereno",    label: "Sereno",    theme: "light",   accent: "sky",    density: "spacious",iconStyle: "colored" },
  { id: "vibrante",  label: "Vibrante",  theme: "cristal", accent: "rose",   density: "normal",  iconStyle: "colored" },
];

for (const p of PRESETS) {
  await page.evaluate((cfg) => {
    localStorage.setItem("superadmin-nav-theme", cfg.theme);
    localStorage.setItem("superadmin-nav-accent", cfg.accent);
    localStorage.setItem("superadmin-nav-density", cfg.density);
    localStorage.setItem("superadmin-nav-icon-style", cfg.iconStyle);
    window.dispatchEvent(new CustomEvent("superadmin-nav-config-changed"));
  }, p);
  await page.goto("http://localhost:3000/superadmin", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  // Screenshot solo del sidebar (240px wide × 900h)
  await page.screenshot({ path: `${OUT}/sidebar-${p.id}-light.png`, clip: { x: 0, y: 0, width: 320, height: 900 } });
  console.log("OK light:", p.label);
}

// Dark mode
await page.evaluate(() => {
  document.documentElement.classList.add("dark");
  localStorage.setItem("superadmin-theme", "dark");
});
for (const p of PRESETS) {
  await page.evaluate((cfg) => {
    localStorage.setItem("superadmin-nav-theme", cfg.theme);
    localStorage.setItem("superadmin-nav-accent", cfg.accent);
    localStorage.setItem("superadmin-nav-density", cfg.density);
    localStorage.setItem("superadmin-nav-icon-style", cfg.iconStyle);
    window.dispatchEvent(new CustomEvent("superadmin-nav-config-changed"));
  }, p);
  await page.goto("http://localhost:3000/superadmin", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/sidebar-${p.id}-dark.png`, clip: { x: 0, y: 0, width: 320, height: 900 } });
  console.log("OK dark:", p.label);
}

await browser.close();
console.log("DONE →", OUT);
