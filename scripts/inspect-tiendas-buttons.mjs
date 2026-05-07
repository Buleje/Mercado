import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/tiendas", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3000);

// Inspect all buttons + their bg colors
const all = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll("button, a")).slice(0, 80);
  return buttons.map((el) => {
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName,
      text: (el.textContent || "").trim().slice(0, 35),
      bg: cs.backgroundColor,
      color: cs.color,
      x: Math.round(r.left), y: Math.round(r.top),
      visible: r.width > 5 && r.height > 5,
    };
  }).filter(e => e.visible && e.text.length > 0);
});
console.log(JSON.stringify(all, null, 2));
await browser.close();
