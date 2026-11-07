// A/B de densidad sin tocar código: captura una pestaña con StatCard en su default (p-5 = 20px) y
// de nuevo con un override CSS que simula p-4 (16px). Uso: node scripts/dev-helpers/admin-densidad-ab.mjs <tab> <outDir>
import { chromium } from "playwright"; import { mkdirSync } from "node:fs";
const BASE = "http://localhost:3000", SLUG = "main"; const [TAB = "plata", OUT = "reports/visual-verify/2026-09-22-densidad-ab"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG } });
if (login.status() !== 200) { console.error("login", login.status()); process.exit(1); }
await page.goto(`${BASE}/admin?tab=${TAB}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
await page.evaluate((slug) => { localStorage.setItem(`onboarding-completed-${slug}`, "1"); sessionStorage.setItem("buleje-theme-session-v2", "light"); }, SLUG);
await page.reload({ waitUntil: "domcontentloaded" }); await page.waitForSelector("main h1, [data-admin-tabbar]", { timeout: 40_000 }).catch(() => {});
await page.getByRole("button", { name: /^Saltar$/ }).first().click({ timeout: 1500 }).catch(() => {});
await page.waitForTimeout(2500);
const n5 = await page.evaluate(() => document.querySelectorAll("main .p-5").length);
await page.screenshot({ path: `${OUT}/${TAB}-A-default-p5.png` });
await page.addStyleTag({ content: "main .p-5{padding:1rem !important}" });
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/${TAB}-B-como-p4.png` });
const alto = await page.evaluate(() => document.querySelector("main")?.scrollHeight);
console.log(`${TAB}: ${n5} elementos con p-5 en pantalla · alto del main con p-4 simulado: ${alto}px · capturas en ${OUT}`);
await browser.close();
