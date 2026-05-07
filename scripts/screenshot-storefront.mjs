import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();

const consoleMessages = [];
page.on("console", (msg) => consoleMessages.push(`[${msg.type()}] ${msg.text().slice(0, 200)}`));
page.on("pageerror", (err) => consoleMessages.push(`[error] ${err.message.slice(0, 200)}`));

await page.goto("http://localhost:3000/marketplace/main", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(2000);

// Ver theme actual
const themeInfo = await page.evaluate(() => ({
  html_class: document.documentElement.className,
  data_theme: document.documentElement.getAttribute("data-theme"),
  body_bg: getComputedStyle(document.body).backgroundColor,
  body_color: getComputedStyle(document.body).color,
  scheme: getComputedStyle(document.documentElement).colorScheme,
  cookies_count: document.cookie.split(";").length,
  ls_theme: localStorage.getItem("theme"),
  ls_bsm_theme: localStorage.getItem("bsm-theme"),
}));

await page.screenshot({ path: "/tmp/storefront-light.png", fullPage: false });

console.log("=== THEME INFO ===");
console.log(JSON.stringify(themeInfo, null, 2));
console.log("\n=== CONSOLE (first 15 msgs) ===");
consoleMessages.slice(0, 15).forEach(m => console.log(m));
console.log("\n=== TOTAL CONSOLE ===", consoleMessages.length);

await browser.close();
