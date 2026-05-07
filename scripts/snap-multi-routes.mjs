import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("reports/design-system", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const routes = [
  { url: "http://localhost:3000/tiendas", name: "tiendas" },
  { url: "http://localhost:3000/tiendas/calleria", name: "tiendas-calleria" },
  { url: "http://localhost:3000/marketplace", name: "marketplace" },
  { url: "http://localhost:3000/", name: "home" },
];

for (const r of routes) {
  try {
    await page.goto(r.url, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `reports/design-system/${r.name}-snap.png`, fullPage: false });
    console.log(`OK ${r.name}`);
  } catch (e) {
    console.log(`FAIL ${r.name}: ${e.message.slice(0, 80)}`);
  }
}

// Check version of the main bundle
const html = await page.content();
const hash = html.match(/_next\/static\/([a-zA-Z0-9_-]+)\//)?.[1];
console.log("Build hash:", hash);

await browser.close();
