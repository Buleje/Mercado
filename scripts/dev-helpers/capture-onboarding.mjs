#!/usr/bin/env node
/**
 * One-shot capture del modal OnboardingWizard en light + dark.
 * Auth qaadmin/main, fuerza localStorage para mostrar el wizard.
 */
import { chromium } from "playwright";
import path from "node:path";

const BASE = "http://localhost:3000";
const TENANT = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const outDir = process.argv[2] ?? "reports/visual-verify/onboarding";

async function capture(theme) {
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    extraHTTPHeaders: { "x-tenant-id": TENANT },
    colorScheme: theme === "dark" ? "dark" : "light",
  });
  if (theme === "dark") {
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem("buleje-theme-session", "dark"); } catch {}
      try { localStorage.setItem("theme", "dark"); } catch {}
      const apply = () => document.documentElement.classList.add("dark");
      if (document.documentElement) apply();
      else document.addEventListener("DOMContentLoaded", apply);
    });
  }
  const page = await ctx.newPage();

  // Auth
  const auth = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
    data: { username: USER, password: PASS },
  });
  if (auth.status() !== 200) throw new Error(`auth failed: ${auth.status()}`);

  // First navigate to set localStorage on origin
  await page.goto(`${BASE}/admin`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => {
    localStorage.removeItem("onboarding-completed-main");
    localStorage.removeItem("superadmin-impersonate-tenant");
    localStorage.setItem("active-tenant-slug", "main");
  });

  if (theme === "dark") {
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
      try { localStorage.setItem("theme", "dark"); } catch {}
    });
  }

  // Reload so trigger re-runs with clean state
  await page.reload({ waitUntil: "domcontentloaded" });
  if (theme === "dark") {
    await page.evaluate(() => document.documentElement.classList.add("dark"));
  }

  // Wait for wizard (1.2s delay + render)
  await page.waitForSelector('[aria-label="Guía de configuración inicial"]', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(1500); // let confetti/animations settle

  const out = `${outDir}/onboarding-${theme}.png`;
  await page.screenshot({ path: out, fullPage: false });
  console.log(JSON.stringify({ ok: true, theme, path: out }));

  await browser.close();
}

await capture("light");
await capture("dark");
