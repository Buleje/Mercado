import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/tiendas-audit-2026-05-18";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const variants = [
  { name: "mobile-light", device: "iPhone 14 Pro", dark: false },
  { name: "mobile-dark", device: "iPhone 14 Pro", dark: true },
  { name: "desktop-light", device: null, dark: false },
];

for (const v of variants) {
  const ctx = await browser.newContext(
    v.device
      ? { ...devices[v.device], isMobile: true, hasTouch: true }
      : { viewport: { width: 1440, height: 900 } },
  );
  const page = await ctx.newPage();

  await page.addInitScript((dark) => {
    try {
      // Dismiss tours
      localStorage.setItem("buleje-tour-marketplace-store", "1");
      localStorage.setItem("buleje-tour-marketplace-home", "1");
      localStorage.setItem("buleje-tour-store-detail", "1");
      localStorage.setItem("buleje-tour-marketplace-tiendas", "1");
      localStorage.setItem("onboarding-completed-main", "1");
      // Dark mode
      if (dark) sessionStorage.setItem("buleje-theme-session-v2", "dark");
    } catch {}
  }, v.dark);

  await page.goto(`http://localhost:3000/tiendas?_t=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(3500);

  // Top
  await page.screenshot({ path: `${OUT}/${v.name}-01-top.png`, fullPage: false });
  console.log(`OK ${v.name}-01-top`);

  // Mid
  await page.evaluate(() => window.scrollTo({ top: 800, behavior: "instant" }));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${v.name}-02-mid.png`, fullPage: false });
  console.log(`OK ${v.name}-02-mid`);

  // Full
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${v.name}-03-full.png`, fullPage: true });
  console.log(`OK ${v.name}-03-full`);

  await ctx.close();
}

await browser.close();
