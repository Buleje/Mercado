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
await page.waitForTimeout(3000);
await page.screenshot({ path: "reports/design-system/tiendas-deep.png", fullPage: true });

// Find ALL non-image elements with red-ish bg/color/border/shadow
const reds = await page.evaluate(() => {
  function parseRgb(str) {
    const m = str.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
    if (!m) return null;
    return [+m[1], +m[2], +m[3]];
  }
  function isReddish(rgb) {
    if (!rgb) return false;
    const [r, g, b] = rgb;
    if (r < 100) return false;
    if (r === g && g === b) return false; // gray
    if (g > 100) return false;
    if (b > 100) return false;
    return r - g > 40 && r - b > 40;
  }
  function check(val) {
    const rgb = parseRgb(val);
    return rgb && isReddish(rgb);
  }
  const results = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    if (r.bottom < 0 || r.top > 4000) continue;
    const cs = getComputedStyle(el);
    const flags = {
      bg: check(cs.backgroundColor),
      color: check(cs.color),
      border: check(cs.borderColor),
      shadow: cs.boxShadow.includes("rgb") && check(cs.boxShadow.match(/rgba?\([^)]+\)/)?.[0] || ""),
    };
    if (Object.values(flags).some(Boolean)) {
      results.push({
        tag: el.tagName,
        cls: (el.className || "").toString().slice(0, 100),
        text: (el.textContent || "").trim().slice(0, 40),
        bg: cs.backgroundColor,
        color: cs.color,
        flags: Object.entries(flags).filter(([_, v]) => v).map(([k]) => k).join(","),
        x: Math.round(r.left), y: Math.round(r.top),
      });
    }
    if (results.length >= 30) break;
  }
  return results;
});
console.log("RED elements:", JSON.stringify(reds, null, 2));
await browser.close();
