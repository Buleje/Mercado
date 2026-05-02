import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/sidebar-buleje";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Login admin tenant main
await page.goto("http://localhost:3000/admin", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(800);

const hasLogin = await page.locator('input[type="password"]').count() > 0;
if (hasLogin) {
  await page.fill('input[type="text"], input[name="username"]', "qaadmin").catch(() => {});
  await page.fill('input[type="password"]', "Qa-admin-1234").catch(() => {});
  await Promise.all([
    page.locator('button[type="submit"]').first().click(),
    page.waitForNavigation({ timeout: 15000 }).catch(() => {}),
  ]);
  await page.waitForTimeout(2000);
}

// Aplicar tema buleje + dismiss onboarding
await page.evaluate(() => {
  localStorage.setItem("admin-sidebar-theme", "buleje");
  localStorage.setItem("admin-sidebar-accent", "teal");
  localStorage.setItem("admin-sidebar-density", "normal");
  localStorage.setItem("admin-sidebar-icon-style", "monochrome");
  localStorage.setItem("admin-sidebar-apply-to-header", "true");
  localStorage.setItem("onboarding-completed-main", "1");
});

await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

// Disparar el flyout via mouseenter event nativo (los timers + React state
// requieren eventos reales — Playwright .hover() en headless a veces falla)
async function triggerFlyout(label) {
  await page.evaluate((needle) => {
    const buttons = [...document.querySelectorAll('aside button')];
    const btn = buttons.find((b) => b.textContent?.trim().startsWith(needle));
    if (btn) {
      const rect = btn.getBoundingClientRect();
      btn.dispatchEvent(new MouseEvent('mouseenter', {
        bubbles: true, cancelable: true,
        clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2,
      }));
    }
  }, label);
  await page.waitForTimeout(250);
}

await triggerFlyout("Ventas");
await page.screenshot({ path: `${OUT}/admin-buleje-flyout.png`, clip: { x: 0, y: 100, width: 700, height: 500 } });
console.log("OK flyout screenshot ventas");

await page.evaluate(() => {
  document.querySelectorAll('aside button').forEach((b) => b.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true })));
});
await page.waitForTimeout(300);

await triggerFlyout("Clientes");
await page.screenshot({ path: `${OUT}/admin-buleje-flyout-clientes.png`, clip: { x: 0, y: 250, width: 700, height: 400 } });
console.log("OK flyout screenshot clientes");

// Capturar console errors CSP
const cspErrors = [];
page.on("console", (msg) => {
  if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) {
    cspErrors.push(msg.text().slice(0, 200));
  }
});
await page.reload({ waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2000);
console.log("CSP errors after reload:", cspErrors.length);
if (cspErrors.length > 0) console.log("Sample:", cspErrors[0]);

await browser.close();
console.log("DONE");
