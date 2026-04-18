import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "reports/visual-verify/2026-04-18-explorar";

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const url = `${BASE}/marketplace/explorar`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(3000);

  await page.screenshot({ path: `${OUT}/01-hero-fold.png`, fullPage: false });
  for (let i = 0; i < 5; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), 900 * (i + 1));
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/0${i + 2}-scroll-${900 * (i + 1)}.png`, fullPage: false });
  }
  await browser.close();
  console.log(`OK — ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
