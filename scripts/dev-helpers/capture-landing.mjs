#!/usr/bin/env node
/**
 * Captura screenshots de la home con scroll long (fullPage) — antes/después de redesign.
 */
import { chromium } from "playwright";
import path from "node:path";

const BASE = "http://localhost:3000";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const outDir = process.argv[2] ?? "reports/visual-verify/landing";
const label = process.argv[3] ?? "";

async function capture(theme) {
  const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    colorScheme: theme === "dark" ? "dark" : "light",
  });
  if (theme === "dark") {
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem("buleje-theme-session", "dark"); } catch {}
      const apply = () => document.documentElement.classList.add("dark");
      if (document.documentElement) apply();
      else document.addEventListener("DOMContentLoaded", apply);
    });
  }
  const page = await ctx.newPage();
  await page.goto(`${BASE}/`, { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2000);

  const suffix = label ? `-${label}` : "";
  const out = `${outDir}/landing${suffix}-${theme}.png`;
  await page.screenshot({ path: out, fullPage: true });
  console.log(JSON.stringify({ ok: true, theme, path: out }));
  await browser.close();
}

await capture("light");
