import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/visual-verify/tiendas-mobile";
const LABEL = "scroll-anim";
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

await page.goto(`http://localhost:3000/tiendas?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3500);

async function shot(name) {
  const y = await page.evaluate(() => window.scrollY);
  await page.screenshot({ path: `${OUT}/${LABEL}-${name}.png`, fullPage: false });
  console.log("OK", name, "scrollY=" + y);
}

// 1. Top — Nav visible, no sticky bar
await shot("01-top");

// 2. Real wheel scroll DOWN simulation (multiple events)
for (const y of [200, 400, 600, 800, 900]) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "auto" }), y);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500); // wait for transition to complete
await shot("02-scrolled-down-nav-hidden");

// 3. Scroll up (real direction change) → both reappear
for (const y of [800, 700, 600]) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "auto" }), y);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500);
await shot("03-scrolled-up-both-visible");

// 4. Scroll down again steady → both hide
for (const y of [700, 900, 1100, 1300, 1500]) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "auto" }), y);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500);
await shot("04-scrolled-down-both-hidden");

// 5. Scroll up → both reappear
for (const y of [1300, 1200, 1100]) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "auto" }), y);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500);
await shot("05-scrolled-up-both-visible");

// 6. Scroll all way back to top → no sticky, nav visible
await page.evaluate(() => window.scrollTo({ top: 0, behavior: "auto" }));
await page.waitForTimeout(1400);
await shot("06-back-to-top");

await ctx.close();
await browser.close();
