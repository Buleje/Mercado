import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("reports/design-system", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (e) => errors.push("PAGEERROR " + e.message.slice(0, 120)));
page.on("console", (m) => { if (m.type() === "error") errors.push("CONSOLE " + m.text().slice(0, 120)); });

await page.goto("http://localhost:3000/tiendas", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);
await page.screenshot({ path: "reports/design-system/tiendas-current.png", fullPage: true });

// Inspeccionar todos los elementos con bg/color rojo visible
const reds = await page.evaluate(() => {
  const isReddish = (rgb) => {
    const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
    if (!m) return false;
    const [r, g, b] = [+m[1], +m[2], +m[3]];
    return r > 150 && g < 120 && b < 120 && (r - g) > 50 && (r - b) > 50;
  };
  const isOklchReddish = (val) => /oklch\(\s*0\.[5-7]\s+0\.[12]\d*\s+(\d+)/.test(val) && /\s+(2[0-9]|3[0-5])\b/.test(val);
  const results = [];
  for (const el of document.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const bg = cs.backgroundColor;
    const color = cs.color;
    const bgImg = cs.backgroundImage;
    const isReddBg = isReddish(bg);
    const isReddColor = isReddish(color);
    const isReddImg = bgImg && (bgImg.includes("rgb(2") || bgImg.includes("rgba(2") || isOklchReddish(bgImg));
    if (isReddBg || isReddColor || isReddImg) {
      results.push({
        tag: el.tagName,
        cls: (el.className || "").toString().slice(0, 80),
        bg: isReddBg ? bg : null,
        color: isReddColor ? color : null,
        bgImg: isReddImg ? bgImg.slice(0, 100) : null,
        text: (el.textContent || "").slice(0, 30),
        x: Math.round(r.left),
        y: Math.round(r.top),
        w: Math.round(r.width),
      });
    }
    if (results.length >= 25) break;
  }
  return results;
});
console.log("Reddish elements:", JSON.stringify(reds, null, 2));
console.log("Errors:", errors);

await browser.close();
