// One-shot: login superadmin (usa SUPERADMIN_* del env, NUNCA los imprime) +
// screenshot de una ruta de módulo (sidebar + SuperAdminModuleTabs).
// Uso: node scripts/dev-helpers/_shot-superadmin.mjs /tmp/sa.png /superadmin/tenants [--dark]
import { chromium } from "playwright";
import path from "node:path";
import nextEnv from "@next/env";

// Carga el env EXACTAMENTE como Next (precedencia .env.local > .env, quotes,
// expansión). Así el user/pass coinciden con los que ve el dev server. No
// imprime valores.
nextEnv.loadEnvConfig(process.cwd());

const BASE = "http://localhost:3000";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");
const out = process.argv[2] || "/tmp/sa.png";
const route = process.argv[3] || "/superadmin/tenants";
const dark = process.argv.includes("--dark");

const USER = process.env.SUPERADMIN_USERNAME;
const PASS = process.env.SUPERADMIN_PASSWORD;
if (!USER || !PASS) {
  console.error("SUPERADMIN_USERNAME/PASSWORD no presentes en el env — abortando");
  process.exit(2);
}

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
  // Auth vía API (comparte cookie con las páginas del contexto). Evita la
  // fragilidad del form (hidratación/CSRF). 2FA está OFF en este entorno.
  const login = await ctx.request.post(`${BASE}/api/superadmin/auth`, {
    data: { username: USER, password: PASS, honeypot: "" },
  });
  console.error("auth POST status:", login.status());
  if (login.status() !== 200) {
    console.error("login no-200 — abortando");
    process.exit(4);
  }
  const page = await ctx.newPage();
  if (dark) {
    // localStorage requiere un origen — navegar primero, setear tema, luego ir a la ruta.
    await page.goto(`${BASE}/superadmin/dashboard`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.evaluate(() => { localStorage.setItem("superadmin-theme", "dark"); document.documentElement.classList.add("dark"); });
  }
  await page.goto(`${BASE}${route}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  if (dark) await page.evaluate(() => document.documentElement.classList.add("dark"));
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(1800);
  const clipArg = process.argv.find((a) => a.startsWith("--clip="));
  const clip = clipArg
    ? (() => { const [x, y, width, height] = clipArg.split("=")[1].split(",").map(Number); return { x, y, width, height }; })()
    : undefined;
  await page.screenshot({ path: out, fullPage: false, ...(clip ? { clip } : {}) });
  console.log(JSON.stringify({ ok: true, url: page.url(), out }));
} finally {
  await browser.close();
}
