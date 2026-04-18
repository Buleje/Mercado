// Screenshots exhaustivos de la tienda publica /t/main/tienda para audit visual.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "reports/visual-verify/2026-04-17-tienda-audit";

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const url = `${BASE}/t/${SLUG}/tienda`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForTimeout(4000);

  // Snapshot 1: above the fold (hero + navbar)
  await page.screenshot({ path: `${OUT}/01-hero-fold.png`, fullPage: false });

  // Snapshot 2-6: scroll progresivo
  const positions = [600, 1200, 2000, 2800, 3600];
  for (let i = 0; i < positions.length; i++) {
    await page.evaluate((y) => window.scrollTo(0, y), positions[i]);
    await page.waitForTimeout(1200);
    await page.screenshot({ path: `${OUT}/0${i + 2}-scroll-${positions[i]}.png`, fullPage: false });
  }

  // Snapshot 7: full page
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/07-full-page.png`, fullPage: true });

  await browser.close();
  console.log("OK — screenshots en", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
