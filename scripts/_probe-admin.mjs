import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/admin", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
console.log("URL after goto:", page.url());
const html = await page.evaluate(() => {
  const inputs = Array.from(document.querySelectorAll('input'));
  return inputs.map(i => ({ name: i.name, type: i.type, placeholder: i.placeholder, id: i.id }));
});
console.log("inputs:", JSON.stringify(html, null, 2));
await browser.close();
