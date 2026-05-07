import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("reports/design-system", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/tiendas", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3500);

// Screenshot fullpage con timestamp para forzar visualización fresh
const ts = Date.now();
await page.screenshot({ path: `reports/design-system/tiendas-final-${ts}.png`, fullPage: true });
console.log(`Saved tiendas-final-${ts}.png`);

// Hover sobre cada botón visible y screenshot del hover
const buttons = await page.$$("button:visible, a[href]");
console.log(`Found ${buttons.length} interactive elements`);

// Check all rules in stylesheets para detectar selector con red en hover
const cssWithRed = await page.evaluate(() => {
  const sheets = Array.from(document.styleSheets);
  const matches = [];
  for (const sheet of sheets) {
    try {
      const rules = sheet.cssRules || [];
      for (let i = 0; i < rules.length; i++) {
        const r = rules[i];
        const cssText = r.cssText || "";
        // Find red-ish hover/focus rules
        if (/:hover|:focus|:active/.test(cssText) && /(#[bdef][0-3]|rgb\([12]\d{2},\s*[0-7]\d|red-[5-9]|rose-[5-9])/i.test(cssText)) {
          matches.push(cssText.slice(0, 200));
        }
        if (matches.length >= 20) break;
      }
    } catch { /* CORS */ }
  }
  return matches;
});
console.log("Red hover/focus rules:", JSON.stringify(cssWithRed, null, 2));

await browser.close();
