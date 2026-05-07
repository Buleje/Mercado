// Script temporal — screenshots post P0-fixes 2026-05-07
import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "./reports/visual-verify/2026-05-07-p0-fixes";

const PAGES = [
  { name: "01-tenant-main-light-desktop", url: "/t/main", dark: false, mobile: false },
  { name: "02-tenant-main-dark-desktop",  url: "/t/main", dark: true,  mobile: false },
  { name: "03-tenant-main-light-mobile",  url: "/t/main", dark: false, mobile: true },
  { name: "04-marketplace-main-light",    url: "/marketplace/main", dark: false, mobile: false },
  { name: "05-marketplace-main-dark",     url: "/marketplace/main", dark: true,  mobile: false },
];

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  for (const p of PAGES) {
    const context = await browser.newContext({
      viewport: p.mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
      colorScheme: p.dark ? "dark" : "light",
    });
    const page = await context.newPage();
    try {
      await page.goto(`${BASE}${p.url}`, { waitUntil: "domcontentloaded", timeout: 45_000 });
      // Bypass first-visit tour y onboarding
      await page.evaluate(() => {
        try {
          localStorage.setItem("buleje-tour-marketplace-2026-04", "1");
          localStorage.setItem("onboarding-completed-main", "1");
        } catch {}
      });
      await page.waitForTimeout(3000);
      await page.screenshot({ path: `${OUT}/${p.name}.png`, fullPage: false });
      console.log(`OK  ${p.name}`);
    } catch (e) {
      console.log(`ERR ${p.name}: ${String(e).slice(0, 80)}`);
    }
    await context.close();
  }

  await browser.close();
  console.log(`\nDONE → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
