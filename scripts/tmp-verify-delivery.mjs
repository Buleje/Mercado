import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8290df84-5850-4d86-a9a5-0c47237c172f/scratchpad/sidebar-collapse";

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
const page = await context.newPage();
await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});

await page.goto(`${BASE}/t/${SLUG}/admin?tab=delivery-partners`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2500);
await page.evaluate(() => { try { localStorage.setItem("onboarding-completed-main", "1"); } catch {} });
await page.waitForTimeout(500);
await page.screenshot({ path: `${OUT}/delivery-tabbar.png`, fullPage: false });
const t = await page.locator("body").innerText();
console.log("[delivery] shows Pedidos en vivo:", /Pedidos en vivo/.test(t));

// Expand "Marketplace" sidebar category to see catTabs count (marketplace/canales/delivery-partners)
await page.goto(`${BASE}/t/${SLUG}/admin?tab=vendor-dashboard`, { waitUntil: "domcontentloaded", timeout: 45000 });
await page.waitForTimeout(2000);
await page.locator('button[data-tour-tab="marketplace-ops"]').click({ timeout: 8000 }).catch((e) => console.log("expand err", String(e)));
await page.waitForTimeout(600);
await page.screenshot({ path: `${OUT}/marketplace-expanded.png`, fullPage: false });

await browser.close();
