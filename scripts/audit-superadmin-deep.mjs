// Audit profundo: testea APIs del superadmin individualmente + re-screenshot dashboard con wait largo.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const USER = "superadmin";
const PASS = "Super2026!";

const APIS = [
  "/api/superadmin/analytics",
  "/api/superadmin/dashboard/widgets",
  "/api/superadmin/dashboard/tenant-growth?range=30d&metric=orders&top=8",
  "/api/superadmin/tenants",
  "/api/superadmin/analytics/executive",
  "/api/superadmin/marketplace/category-images",
];

const PAGES_DEEP = [
  "/superadmin/dashboard",
  "/superadmin/marketplace",
];

async function main() {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  // Login
  const loginResp = await page.request.post(`${BASE}/api/superadmin/auth`, {
    headers: { "content-type": "application/json" },
    data: { username: USER, password: PASS },
  });
  console.log("Login:", loginResp.status());

  // Test APIs individually
  console.log("\n— APIs (con cookies de sesión) —");
  for (const api of APIS) {
    const t0 = Date.now();
    const r = await page.request.get(`${BASE}${api}`);
    const ms = Date.now() - t0;
    let body = "";
    try {
      const txt = await r.text();
      body = txt.length > 120 ? txt.slice(0, 120) + "..." : txt;
    } catch {}
    console.log(`  ${String(r.status()).padStart(3)}  ${String(ms).padStart(5)}ms  ${api}`);
    if (r.status() >= 400 || ms > 3000) console.log(`        ↳ ${body}`);
  }

  // Deep page screenshots con wait largo
  console.log("\n— Pages con wait 8s (networkidle) —");
  for (const url of PAGES_DEEP) {
    const t0 = Date.now();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    try {
      await page.goto(`${BASE}${url}`, { waitUntil: "networkidle", timeout: 20_000 });
    } catch (e) {
      console.log(`  ERR ${url}: ${String(e).slice(0, 100)}`);
    }
    await page.waitForTimeout(1000);
    const fname = url.replace(/\W+/g, "_") + "-deep.png";
    await page.screenshot({ path: `reports/audit-superadmin/${fname}`, fullPage: true });
    const txt = await page.evaluate(() => document.body.innerText.length);
    console.log(`  ${url.padEnd(40)} ${Date.now() - t0}ms  bodyLen=${txt}  errors=${errors.length}`);
  }

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
