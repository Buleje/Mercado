import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
mkdirSync("reports/design-system", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
  const today = new Date().toISOString().slice(0, 10);
  try { localStorage.setItem(`morning-summary-${today}`, "shown"); } catch {}
});
await page.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
await page.locator("#username").first().pressSequentially("qaadmin", { delay: 25 });
await page.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 25 });
await page.waitForTimeout(400);
await page.locator("#password").first().press("Enter");
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(4500);

// Cerrar morning summary
await page.locator('button:has-text("Comenzar el día")').click({ force: true, timeout: 3000 }).catch(() => {});
await page.waitForTimeout(1500);

// Navegar a pedidos
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { moduleId: "pedidos", tabId: "pedidos" } })));
  await page.waitForTimeout(1500);
  if (await page.evaluate(() => /pedidos/i.test(window.location.href))) break;
}
await page.waitForTimeout(4000);

await page.screenshot({ path: "reports/design-system/pedidos-before.png", fullPage: false });
console.log("URL:", page.url());

await browser.close();
