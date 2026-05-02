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

// Login
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

await page.evaluate(() => {
  localStorage.setItem("admin-sidebar-theme", "buleje");
  localStorage.setItem("onboarding-completed-main", "1");
  localStorage.setItem("admin_active_tab", "forecasting");
});

const errors = [];
const setTabLogs = [];
page.on("console", (msg) => {
  const text = msg.text();
  if (text.startsWith("[setTab]")) setTabLogs.push(text.slice(0, 500));
  if (msg.type() === "error") errors.push(text.slice(0, 250));
});

// Forecasting tab — debug rapido
await page.goto("http://localhost:3000/admin?tab=forecasting", { waitUntil: "domcontentloaded", timeout: 30000 });

// MonkeyPatch para descubrir quién cambia admin_active_tab
await page.evaluate(() => {
  const orig = Storage.prototype.setItem;
  Storage.prototype.setItem = function(key, val) {
    if (key === "admin_active_tab") {
      const stack = new Error().stack ?? "";
      console.log("[setTab]", val, "| stack:", stack.split("\n").slice(2, 6).join(" -> "));
    }
    return orig.apply(this, arguments);
  };
});

await page.waitForTimeout(1000);
let dbg = await page.evaluate(() => ({ s: location.search, t: localStorage.getItem("admin_active_tab"), h: document.querySelector("h1,h2")?.textContent }));
console.log("after 1s:", JSON.stringify(dbg));
await page.waitForTimeout(2000);
dbg = await page.evaluate(() => ({ s: location.search, t: localStorage.getItem("admin_active_tab"), h: document.querySelector("h1,h2")?.textContent }));
console.log("after 3s:", JSON.stringify(dbg));
await page.waitForTimeout(4000);
dbg = await page.evaluate(() => ({ s: location.search, t: localStorage.getItem("admin_active_tab"), h: document.querySelector("h1,h2")?.textContent }));
console.log("after 7s:", JSON.stringify(dbg));
await page.screenshot({ path: `${OUT}/admin-forecasting-before.png`, fullPage: true });

// Fiados
await page.goto("http://localhost:3000/admin?tab=fiados", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(6000);
const fiadosHdr = await page.evaluate(() => document.querySelector("h1, h2")?.textContent ?? "no-h1");
console.log("fiados h1:", fiadosHdr);
await page.screenshot({ path: `${OUT}/admin-fiados-after.png`, clip: { x: 0, y: 0, width: 1280, height: 600 } });

console.log("setTab logs:", setTabLogs.length);
setTabLogs.slice(0, 5).forEach((s) => console.log(s));
console.log("Errors found:", errors.length);
if (errors.length > 0) console.log("Sample:", errors.slice(0, 3));

await browser.close();
