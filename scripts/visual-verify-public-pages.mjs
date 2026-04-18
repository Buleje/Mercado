// Capture landing + marketplace + recetas + negocios para verificacion visual.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "reports/visual-verify/2026-04-17-public-pages-post";

const PAGES = [
  { name: "01-landing-fold", url: "/" },
  { name: "02-marketplace-fold", url: "/marketplace" },
  { name: "03-recetas-fold", url: "/recetas" },
  { name: "04-negocios-fold", url: "/negocios" },
];

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  for (const p of PAGES) {
    try {
      const resp = await page.goto(`${BASE}${p.url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: false });
      console.log(`[${resp?.status() ?? 0}] ${p.name}`);
    } catch (e) {
      console.log(`[ERR] ${p.name} :: ${String(e.message ?? e).slice(0, 80)}`);
    }
  }

  await browser.close();
  console.log(`\nDONE ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
