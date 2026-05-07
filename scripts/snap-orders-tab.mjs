import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("reports/design-system", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  localStorage.setItem("active-tenant", "main");
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
});
await page.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
await page.locator("#username").first().pressSequentially("qaadmin", { delay: 25 });
await page.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 25 });
await page.waitForTimeout(400);
await page.locator("#password").first().press("Enter");
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(3500);

// Disparar el evento que el admin escucha (admin:navigate con moduleId)
await page.evaluate(() => {
  window.dispatchEvent(new CustomEvent("admin:navigate", {
    detail: { moduleId: "marketplace", tabId: "marketplace" },
  }));
});
await page.waitForTimeout(3000);

// Click Órdenes sub-tab
await page.evaluate(() => {
  const items = Array.from(document.querySelectorAll("button, a, [role='tab']"));
  const ord = items.find((el) => /[óo]rdenes/i.test(el.textContent || ""));
  if (ord) ord.click();
});
await page.waitForTimeout(2500);

await page.screenshot({ path: "reports/design-system/orders-tab-after.png", fullPage: false });
console.log("OK saved orders-tab-after.png · url:", page.url());

// Click en la primera card para abrir drawer
await page.evaluate(() => {
  const cards = Array.from(document.querySelectorAll('div[class*="rounded-xl"][class*="cursor-pointer"]'));
  const orderCard = cards.find(c => /^#[A-F0-9]{8}/.test((c.textContent || '').trim()));
  if (orderCard) orderCard.click();
});
await page.waitForTimeout(2500);
await page.screenshot({ path: "reports/design-system/orders-drawer.png", fullPage: false });
console.log("OK saved orders-drawer.png");

// Also test /tiendas
await page.goto("http://localhost:3000/tiendas", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2500);
await page.screenshot({ path: "reports/design-system/tiendas-after-filters.png", fullPage: true });
console.log("OK saved tiendas-after-filters.png");

await browser.close();
