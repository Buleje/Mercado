// Verificación visual: dark mode + nueva tab Orden del MarketplaceModule.
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const OUT = "reports/visual-verify/2026-04-28-dark-orden";

async function dismissModal(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("onboarding-completed-main", "1");
      localStorage.setItem("onboarding-completed-luis", "1");
      localStorage.setItem("onboarding-completed-buleje", "1");
    } catch {}
    document.querySelectorAll('[role="dialog"]').forEach((el) => {
      if ((el.textContent ?? "").includes("Configura tu bodega")) el.remove();
    });
    document.body.style.overflow = "";
  });
  await page.waitForTimeout(200);
}

async function setDark(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("theme", "dark");
      localStorage.setItem("admin-theme", "dark");
      localStorage.setItem("color-scheme", "dark");
    } catch {}
    document.documentElement.classList.add("dark");
    document.documentElement.dataset.theme = "dark";
  });
  await page.waitForTimeout(300);
}

async function setLight(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("theme", "light");
      localStorage.setItem("admin-theme", "light");
    } catch {}
    document.documentElement.classList.remove("dark");
    document.documentElement.dataset.theme = "light";
  });
  await page.waitForTimeout(200);
}

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
  });
  const page = await ctx.newPage();

  const login = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: USER, password: PASS },
  });
  if (login.status() !== 200) {
    console.error("Login fail", login.status(), await login.text());
    process.exit(1);
  }

  // Verificación de tokens dark
  await page.goto(`${BASE}/t/${SLUG}/admin?tab=marketplace`, { waitUntil: "domcontentloaded", timeout: 45_000 });
  await page.waitForTimeout(1500);
  await dismissModal(page);
  await setDark(page);
  await page.waitForTimeout(800);

  const tokens = await page.evaluate(() => {
    const s = getComputedStyle(document.documentElement);
    return {
      canvas: s.getPropertyValue("--surface-canvas").trim(),
      sunken: s.getPropertyValue("--surface-sunken").trim(),
      raised: s.getPropertyValue("--surface-raised").trim(),
      textPrimary: s.getPropertyValue("--text-primary").trim(),
      textSecondary: s.getPropertyValue("--text-secondary").trim(),
      textTertiary: s.getPropertyValue("--text-tertiary").trim(),
      ruleSoft: s.getPropertyValue("--rule-soft").trim(),
      ruleBase: s.getPropertyValue("--rule-base").trim(),
      ruleStrong: s.getPropertyValue("--rule-strong").trim(),
      accent: s.getPropertyValue("--accent").trim(),
      colorBg: s.getPropertyValue("--color-background").trim(),
      colorPrimary: s.getPropertyValue("--color-primary").trim(),
      darkApplied: document.documentElement.classList.contains("dark"),
    };
  });
  console.log("DARK_TOKENS", JSON.stringify(tokens, null, 2));

  await page.screenshot({ path: `${OUT}/01-marketplace-dark-resumen.png`, fullPage: false });

  // Click tab "Orden"
  const ordenButton = page.getByRole("button", { name: /^Orden$/, exact: true }).first();
  const found = await ordenButton.isVisible().catch(() => false);
  if (!found) {
    // fallback: navega por hash o setTab via URL?param
    console.warn("Orden button not visible by name — buscando por texto");
    await page.evaluate(() => {
      const candidates = Array.from(document.querySelectorAll("button"));
      const btn = candidates.find((b) => (b.textContent ?? "").trim() === "Orden");
      if (btn) (btn).click();
    });
  } else {
    await ordenButton.click();
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/02-marketplace-dark-orden.png`, fullPage: false });

  // Light mode mismo tab
  await setLight(page);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/03-marketplace-light-orden.png`, fullPage: false });

  // Vuelve a dark, va a tab Productos para ver cards
  await setDark(page);
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === "Productos");
    if (btn) (btn).click();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `${OUT}/04-marketplace-dark-productos.png`, fullPage: false });

  // Tab Resumen para ver KPIs/charts
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => (b.textContent ?? "").trim() === "Resumen");
    if (btn) (btn).click();
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/05-marketplace-dark-resumen2.png`, fullPage: false });

  await browser.close();
  console.log("\nDONE", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
