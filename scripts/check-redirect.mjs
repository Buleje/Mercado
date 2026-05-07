import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

const navigations = [];
page.on("framenavigated", f => { if (f === page.mainFrame()) navigations.push(f.url()); });

console.log("=== Navego a /t/mi-pollo/tienda SIN admin auth ===");
const resp = await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "networkidle", timeout: 20000 });
console.log("HTTP:", resp?.status());
console.log("URL final:", page.url());
console.log("\n=== Cadena de navegación ===");
navigations.forEach(u => console.log("  ", u));

const tenantInfo = await page.evaluate(() => ({
  pathname: window.location.pathname,
  title: document.title,
  storeName: document.querySelector("h1")?.textContent?.trim().slice(0, 80),
  bodyClasses: document.body.className,
}));
console.log("\n=== Info de la página renderizada ===");
console.log(tenantInfo);

await browser.close();
