import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const messages = [];
page.on("console", (msg) => {
  const type = msg.type();
  if (type === "error" || type === "warning") {
    messages.push({ type, text: msg.text(), location: msg.location() });
  }
});
page.on("pageerror", (err) => {
  messages.push({ type: "pageerror", text: err.message, stack: err.stack });
});
page.on("requestfailed", (req) => {
  messages.push({ type: "requestfailed", url: req.url(), failure: req.failure()?.errorText });
});

try {
  await page.goto("http://localhost:3000/marketplace/repartidor", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForTimeout(2000);
  // Try interacting with form: select moto, fill fields, scroll to bottom
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(1000);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(500);
  // Try filling DNI
  const dniInput = await page.$('#rep-dni');
  if (dniInput) {
    await dniInput.fill("12345678");
    await page.waitForTimeout(500);
  }
  // Toggle vehicle type
  await page.click('button[aria-pressed]:has-text("Bicicleta")').catch(() => {});
  await page.waitForTimeout(800);
  await page.click('button[aria-pressed]:has-text("Moto")').catch(() => {});
  await page.waitForTimeout(800);
} catch (e) {
  messages.push({ type: "navigate", text: e.message });
}

await browser.close();
console.log(JSON.stringify(messages, null, 2));
