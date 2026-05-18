import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/storefront-nav";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({
  ...devices["iPhone 14 Pro"],
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();

await page.addInitScript(() => {
  try {
    // Dismiss all known tour keys + onboarding flags
    const keys = [
      "buleje-tour-marketplace-store",
      "buleje-tour-marketplace-home",
      "buleje-tour-marketplace",
      "buleje-tour-store-detail",
      "buleje-tour-tiendas",
      "buleje-tour-storefront",
      "buleje-tour-search",
      "onboarding-completed-main",
      "onboarding-completed-buleje",
    ];
    keys.forEach((k) => localStorage.setItem(k, "1"));
  } catch {}
});

await page.goto(`http://localhost:3000/marketplace/buleje?_t=${Date.now()}`, {
  waitUntil: "domcontentloaded",
  timeout: 30000,
});
await page.waitForTimeout(2500);

// Force close any visible tour modal
await page.evaluate(() => {
  document.querySelectorAll('[role="dialog"]').forEach((d) => {
    const closeBtn = d.querySelector('button[aria-label*="cerrar" i], button[aria-label*="close" i], button[aria-label*="omitir" i]');
    if (closeBtn instanceof HTMLElement) closeBtn.click();
  });
}).catch(() => {});
await page.waitForTimeout(800);

await page.screenshot({ path: `${OUT}/01-top.png`, fullPage: false });
console.log("OK 01-top");

await page.evaluate(() => window.scrollTo({ top: 600, behavior: "instant" }));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/02-scrolled.png`, fullPage: false });
console.log("OK 02-scrolled");

await browser.close();
