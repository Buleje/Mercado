#!/usr/bin/env node
/**
 * Captura screenshot del ClienteFormModal abierto en modo light + dark.
 * Verifica visualmente el resultado de la migración a AdminModal.
 */
import { chromium } from "playwright";
import path from "node:path";

const BASE = "http://localhost:3000";
const TENANT = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const outDir = process.argv[2] ?? "reports/visual-verify/cliente-modal";

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
      const apply = () => document.documentElement.classList.add("dark");
      if (document.documentElement) apply();
      else document.addEventListener("DOMContentLoaded", apply);
    });
  }
  const page = await ctx.newPage();

  const auth = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": TENANT },
    data: { username: USER, password: PASS },
  });
  if (auth.status() !== 200) throw new Error(`auth failed: ${auth.status()}`);

  // Ir a clientes y abrir el modal de Nuevo cliente
  await page.goto(`${BASE}/admin?tab=clientes`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.evaluate(() => {
    localStorage.setItem("onboarding-completed-main", "1");
  });
  await page.waitForTimeout(1500);

  // Buscar botón "Nuevo cliente"
  const newBtn = page.getByRole("button", { name: /nuevo cliente/i }).first();
  try {
    await newBtn.click({ timeout: 5000 });
    await page.waitForTimeout(800);
  } catch {
    console.log(JSON.stringify({ ok: false, theme, reason: "could not find Nuevo cliente button" }));
    await browser.close();
    return;
  }

  const out = `${outDir}/cliente-${theme}.png`;
  await page.screenshot({ path: out, fullPage: false });
  console.log(JSON.stringify({ ok: true, theme, path: out }));
  await browser.close();
}

await capture("light");
await capture("dark");
