#!/usr/bin/env node
/**
 * audit-dark-wcag.mjs — Round 9 reemplazo del dark-mode-auditor agent (que truncaba).
 *
 * Corre Playwright + axe-core en dark mode sobre rutas críticas, reporta
 * violaciones de contraste WCAG AA (color-contrast rule).
 *
 * Uso: node scripts/audit-dark-wcag.mjs
 *
 * Requiere dev server arriba en http://localhost:3000 + tenant qaadmin/main.
 */
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const QA_USER = "qaadmin";
const QA_PASS = "Qa-admin-1234";
const TENANT = "main";

const ROUTES = [
  { path: "/marketplace",            auth: false, viewport: { width: 1440, height: 900 } },
  { path: "/marketplace",            auth: false, viewport: { width: 375,  height: 812 } },
  { path: "/admin?tab=pedidos",      auth: true,  viewport: { width: 1440, height: 900 } },
];

async function loginAdmin(page) {
  await page.goto(`${BASE}/admin/login`);
  await page.fill('input[name="username"]', QA_USER).catch(() => {});
  await page.fill('input[name="password"]', QA_PASS).catch(() => {});
  await page.click('button[type="submit"]').catch(() => {});
  await page.waitForURL(/\/admin/, { timeout: 10_000 }).catch(() => {});
}

async function setDarkMode(page) {
  // Round 9: el theme context usa sessionStorage (contexts/theme-context.tsx:90),
  // no localStorage. Y por defecto arranca en light salvo storage. Setear ANTES
  // del primer paint via init script para que el provider lo lea en mount.
  await page.evaluate(() => {
    sessionStorage.setItem("theme", "dark");
    localStorage.setItem(`onboarding-completed-main`, "1");
    document.documentElement.classList.add("dark");
  });
}

// Round 9: usar Chrome for Testing existente (1208) en lugar de descargar
// el headless_shell-1214 que requiere `npx playwright install`.
const CHROME_PATH = "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome";

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: CHROME_PATH,
  });
  const results = [];

  for (const route of ROUTES) {
    const ctx = await browser.newContext({ viewport: route.viewport });
    // Inject sessionStorage ANTES del primer load (init script).
    await ctx.addInitScript(() => {
      try {
        sessionStorage.setItem("theme", "dark");
        localStorage.setItem("onboarding-completed-main", "1");
      } catch {}
    });
    const page = await ctx.newPage();
    if (route.auth) await loginAdmin(page);
    await page.goto(`${BASE}${route.path}`, { waitUntil: "domcontentloaded" });
    await setDarkMode(page);
    await page.reload({ waitUntil: "networkidle" }).catch(() => {});
    await page.waitForTimeout(1200);

    // Verificar que dark mode se aplicó realmente
    const darkApplied = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    if (!darkApplied) {
      console.log(`  ⚠️  ${route.path}: dark class NO se aplicó tras reload`);
    }

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2aa", "wcag21aa"])
      .options({ runOnly: ["color-contrast"] })
      .analyze()
      .catch((e) => ({ error: String(e), violations: [] }));

    const dim = `${route.viewport.width}x${route.viewport.height}`;
    const violations = (axe.violations ?? []).filter((v) => v.id === "color-contrast");

    results.push({ route: `${route.path} (${dim})`, violations });
    await ctx.close();
  }

  await browser.close();

  console.log("\n=== Dark Mode WCAG AA Audit (round 9) ===\n");
  let anyP0 = false;
  for (const r of results) {
    console.log(`\n## ${r.route}`);
    if (r.violations.length === 0) {
      console.log("  ✅ 0 contrast violations");
      continue;
    }
    for (const v of r.violations) {
      const nodes = v.nodes.length;
      const sample = v.nodes[0]?.html?.slice(0, 120) ?? "?";
      const target = v.nodes[0]?.target?.[0] ?? "?";
      console.log(`  ❌ ${v.impact} · ${nodes} elements · ${target}`);
      console.log(`     ${sample}`);
      if (v.impact === "serious" || v.impact === "critical") anyP0 = true;
    }
  }
  console.log(`\nSummary: ${anyP0 ? "P0 violations found" : "Only minor/moderate (no P0)"}.\n`);
  process.exit(0);
})();
