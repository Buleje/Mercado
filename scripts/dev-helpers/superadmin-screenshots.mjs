// Capturas light+dark del SUPERADMIN a 1366x768 con métricas mínimas (h1, título).
// Login: POST /api/superadmin/auth con SUPERADMIN_USERNAME/PASSWORD de .env.local
// (2FA off si SUPERADMIN_2FA != "true"). La cookie de sesión bindea el User-Agent:
// se mintea con `page.request` del MISMO contexto, así el UA coincide.
// Dark: localStorage `superadmin-theme` = "dark" + reload (SuperAdminShell).
// Uso: node scripts/dev-helpers/superadmin-screenshots.mjs <outDir> "dashboard,gastos,tenants" "light,dark" [1366x768]
import { chromium } from "playwright";
import { mkdir, readFile } from "node:fs/promises";
const env = Object.fromEntries((await readFile(".env.local", "utf8")).split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, "")]; }));
const BASE = "http://localhost:3000";
const OUT = process.argv[2] || "reports/visual-verify/superadmin";
const PAGES = (process.argv[3] || "dashboard,gastos,tenants,stores,billing,support").split(",");
const THEMES = (process.argv[4] || "light,dark").split(",");
const [W, H] = (process.argv[5] || "1366x768").split("x").map(Number);
await mkdir(OUT, { recursive: true });
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H } });
const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/superadmin/auth`, { headers: { "content-type": "application/json" }, data: { username: env.SUPERADMIN_USERNAME, password: env.SUPERADMIN_PASSWORD, honeypot: "" } });
if (login.status() !== 200) { console.error("login superadmin", login.status(), (await login.text()).slice(0, 200)); process.exit(1); }
for (const theme of THEMES) for (const p of PAGES) {
  const url = `${BASE}/superadmin/${p === "dashboard" ? "" : p}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate((t) => { try { localStorage.setItem("superadmin-theme", t); } catch {} }, theme);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.waitForSelector("main h1, h1", { timeout: 40_000 }).catch(() => {});
  await page.waitForTimeout(1500);
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  const m = await page.evaluate(() => ({ h1: document.querySelectorAll("h1").length, titulo: (document.querySelector("h1")?.textContent || "-").trim().slice(0, 40), dark: document.documentElement.classList.contains("dark"), bg: getComputedStyle(document.body).backgroundColor, login: location.pathname.includes("/login") }));
  const file = `${OUT}/${p}-${theme}.png`;
  await page.screenshot({ path: file, fullPage: false });
  console.log(`${theme.padEnd(5)} ${p.padEnd(16)} h1=${m.h1} titulo="${m.titulo}" dark=${m.dark} bg=${m.bg}${m.login ? " ⚠️ LOGIN" : ""}`);
}
await browser.close(); console.log("DONE", OUT);
