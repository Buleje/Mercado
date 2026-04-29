// Audit del panel /superadmin: login, screenshots, console errors, fallos de red.
// Uso: node scripts/audit-superadmin.mjs
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "http://localhost:3000";
const USER = "superadmin";
const PASS = "Super2026!";
const OUT = "reports/audit-superadmin";

const ROUTES = [
  { name: "01-dashboard", url: "/superadmin" },
  { name: "02-control-center", url: "/superadmin/control-center" },
  { name: "03-tenants", url: "/superadmin/tenants" },
  { name: "04-stores", url: "/superadmin/stores" },
  { name: "05-marketplace", url: "/superadmin/marketplace" },
  { name: "06-mkt-suppliers", url: "/superadmin/marketplace/suppliers" },
  { name: "07-mkt-cat-images", url: "/superadmin/marketplace/category-images" },
  { name: "08-vendor-apps", url: "/superadmin/vendor-applications" },
  { name: "09-banners", url: "/superadmin/banners" },
  { name: "10-marca", url: "/superadmin/marca" },
  { name: "11-recetario", url: "/superadmin/recetario" },
  { name: "12-analytics", url: "/superadmin/analytics" },
  { name: "13-activity", url: "/superadmin/activity" },
  { name: "14-security", url: "/superadmin/security" },
  { name: "15-health", url: "/superadmin/health" },
  { name: "16-roadmap", url: "/superadmin/roadmap" },
  { name: "17-sitemap", url: "/superadmin/sitemap" },
  { name: "18-settings", url: "/superadmin/settings" },
];

async function main() {
  await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({
    headless: true,
    executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push({ url: page.url(), text: msg.text() });
  });
  page.on("pageerror", (err) => pageErrors.push({ url: page.url(), text: String(err) }));
  page.on("requestfailed", (req) =>
    failedRequests.push({ url: req.url(), reason: req.failure()?.errorText, on: page.url() })
  );

  // ── Login ─────────────────────────────────────────────────────────────────
  console.log("→ Login superadmin...");
  const loginResp = await page.request.post(`${BASE}/api/superadmin/auth`, {
    headers: { "content-type": "application/json" },
    data: { username: USER, password: PASS },
  });
  const loginBody = await loginResp.json().catch(() => ({}));
  console.log("   status", loginResp.status(), JSON.stringify(loginBody).slice(0, 200));
  if (loginResp.status() !== 200) {
    await browser.close();
    throw new Error(`Login failed: ${loginResp.status()}`);
  }

  // ── Routes ────────────────────────────────────────────────────────────────
  const results = [];
  for (const r of ROUTES) {
    const start = Date.now();
    let httpStatus = null;
    let navError = null;
    try {
      const resp = await page.goto(`${BASE}${r.url}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
      httpStatus = resp?.status() ?? null;
      await page.waitForTimeout(1500);
      await page.screenshot({ path: `${OUT}/${r.name}.png`, fullPage: false });
    } catch (e) {
      navError = String(e);
    }
    const ms = Date.now() - start;
    const errs = consoleErrors.filter((e) => e.url.includes(r.url)).length;
    console.log(`   ${r.name.padEnd(28)} ${String(httpStatus ?? "ERR").padStart(3)} ${String(ms).padStart(5)}ms  errs:${errs}${navError ? "  " + navError.slice(0, 60) : ""}`);
    results.push({ ...r, httpStatus, ms, navError, consoleErrors: errs });
  }

  // ── Reporte ───────────────────────────────────────────────────────────────
  const report = {
    runAt: new Date().toISOString(),
    user: USER,
    base: BASE,
    routes: results,
    consoleErrors,
    pageErrors,
    failedRequests,
  };
  await writeFile(`${OUT}/report.json`, JSON.stringify(report, null, 2));

  const byStatus = results.reduce((acc, r) => {
    const k = r.navError ? "NAV_ERR" : String(r.httpStatus ?? "?");
    acc[k] = (acc[k] ?? 0) + 1;
    return acc;
  }, {});
  console.log("\n── Resumen ──");
  console.log("Status counts:", byStatus);
  console.log("Console errors:", consoleErrors.length);
  console.log("Page errors:", pageErrors.length);
  console.log("Failed requests:", failedRequests.length);
  console.log(`Reporte: ${OUT}/report.json + screenshots`);

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
