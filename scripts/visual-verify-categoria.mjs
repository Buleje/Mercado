import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "reports/visual-verify/2026-04-18-categoria";

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const slugs = ["limpieza-hogar", "abarrotes", "carnes", "bebidas"];
  for (const slug of slugs) {
    const url = `${BASE}/marketplace/categoria/${slug}`;
    try {
      const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/${slug}.png`, fullPage: false });
      console.log(`[${resp?.status() ?? 0}] ${slug}`);
    } catch (e) {
      console.log(`[ERR] ${slug}`);
    }
  }
  await browser.close();
  console.log(`OK — ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
