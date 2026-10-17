// Los libros forestales usan libro-chrome (sin h1 ni AdminTabBar) y compilan en frío ~30-60 s tras tocar un archivo
// compartido: esperar hasta 90 s a que aparezca una <table> o el estado vacío, y recién ahí capturar y contar errores.
// Uso: node scripts/dev-helpers/admin-libro-check.mjs "<tab&vista=…>" <outDir> [SLUG]
import { chromium } from "playwright"; import { mkdirSync } from "node:fs";
const BASE = "http://localhost:3000"; const [RUTA = "ctp-libro-operaciones&vista=ingresos", OUT = "reports/visual-verify/2026-09-22-forestal-filtros", SLUG = process.env.SLUG || "main"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(); const page = await (await browser.newContext({ viewport: { width: 1366, height: 768 } })).newPage();
const errores = []; page.on("console", (m) => { if (m.type() === "error" && !/favicon|posthog|sentry|hydration|net::ERR_/i.test(m.text())) errores.push(m.text().slice(0, 160)); }); page.on("pageerror", (e) => errores.push("pageerror: " + String(e.message).slice(0, 160)));
const login = await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG } });
if (login.status() !== 200) { console.error("login", login.status(), (await login.text()).slice(0, 80)); process.exit(1); }
await page.goto(`${BASE}/admin?tab=${RUTA}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.evaluate((slug) => { localStorage.setItem(`onboarding-completed-${slug}`, "1"); sessionStorage.setItem("buleje-theme-session-v2", "light"); }, SLUG);
await page.reload({ waitUntil: "domcontentloaded", timeout: 120_000 });
const t0 = Date.now();
const ok = await page.waitForSelector("main table, main [role=table], main [data-libro-chrome], main :text('Ingresos'), main :text('Sin ')", { timeout: 90_000 }).then(() => true).catch(() => false);
await page.waitForTimeout(2500);
const info = await page.evaluate(() => ({ tablas: document.querySelectorAll("main table").length, ths: document.querySelectorAll("main th").length, selectsEnTh: document.querySelectorAll("main th select, main th details, main th button").length, texto: (document.querySelector("main")?.innerText || "").slice(0, 160).replace(/\s+/g, " ") }));
await page.screenshot({ path: `${OUT}/${RUTA.replace(/[&=]/g, "_")}-${SLUG.slice(-8)}-light-90s.png` });
console.log(`${RUTA} @${SLUG}: contenido en ${((Date.now() - t0) / 1000).toFixed(1)}s (${ok ? "apareció" : "TIMEOUT"}) · tablas=${info.tablas} th=${info.ths} controles-en-th=${info.selectsEnTh} · errores=${errores.length}`);
console.log(`   texto: ${info.texto}`); for (const e of errores.slice(0, 5)) console.log("   ✗ " + e);
await browser.close();
