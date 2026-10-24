// Abre un modal real del admin y demuestra que la capa con nombre APLICA: lee el z-index computado del
// [role=dialog] y de su velo, y captura light+dark con el modal abierto.
// Uso: node scripts/dev-helpers/admin-modal-z-check.mjs <tab> "<texto del botón que abre el modal>" <outDir>
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const BASE = "http://localhost:3000", SLUG = process.env.SLUG || "main";
const [TAB = "adelantos", BOTON = "Nuevo adelanto", OUT = "reports/visual-verify/2026-09-22-capas"] = process.argv.slice(2);
mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch(); const ctx = await browser.newContext({ viewport: { width: 1366, height: 768 } }); const page = await ctx.newPage();
const login = await page.request.post(`${BASE}/api/auth/login`, { headers: { "content-type": "application/json", "x-tenant-id": SLUG }, data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG } });
if (login.status() !== 200) { console.error("login", login.status()); process.exit(1); }
for (const theme of ["light", "dark"]) {
  const errores = []; page.on("pageerror", (e) => errores.push(String(e.message).slice(0, 120)));
  await page.goto(`${BASE}/admin?tab=${TAB}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await page.evaluate(({ t, slug }) => { localStorage.setItem(`onboarding-completed-${slug}`, "1"); localStorage.setItem("buleje-tour-marketplace-2026-04", "1"); sessionStorage.setItem("buleje-theme-session-v2", t); }, { t: theme, slug: SLUG });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("main h1, [data-admin-tabbar]", { timeout: 40_000 }).catch(() => {});
  await page.getByRole("button", { name: /^Saltar$/ }).first().click({ timeout: 1500 }).catch(() => {});
  await page.waitForTimeout(1500);
  const btn = page.getByRole("button", { name: new RegExp(BOTON, "i") }).first();
  await btn.waitFor({ timeout: 30_000 }); await btn.click({ timeout: 10_000 });
  await page.waitForSelector(".z-modal, .z-modal-2, .z-modal-3, [role=dialog]", { timeout: 60_000 }); // Turbopack compila el chunk del modal en frío
  await page.waitForTimeout(600);
  const info = await page.evaluate(() => {
    const d = document.querySelector(".z-modal, .z-modal-2, .z-modal-3") || document.querySelector("[role=dialog]"); if (!d) return null;
    const cs = (el) => ({ z: getComputedStyle(el).zIndex, pos: getComputedStyle(el).position, cls: [...el.classList].filter((c) => /^z-/.test(c)).join(" ") || "(sin clase z-)" });
    // el velo: el hermano anterior fixed inset-0, o el ancestro fixed más cercano
    let velo = d.previousElementSibling; while (velo && getComputedStyle(velo).position !== "fixed") velo = velo.previousElementSibling;
    const anc = d.closest("[class*='fixed']");
    return { dialog: cs(d), velo: velo ? cs(velo) : null, ancestroFixed: anc && anc !== d ? cs(anc) : null, dark: document.documentElement.classList.contains("dark") };
  });
  await page.screenshot({ path: `${OUT}/${TAB}-modal-${theme}.png` });
  console.log(`${theme.padEnd(5)} ${TAB} → dialog z=${info?.dialog.z} [${info?.dialog.cls}] pos=${info?.dialog.pos} · velo z=${info?.velo?.z ?? "-"} [${info?.velo?.cls ?? "-"}] · ancestro fixed z=${info?.ancestroFixed?.z ?? "-"} [${info?.ancestroFixed?.cls ?? "-"}] · dark=${info?.dark} · pageerrors=${errores.length}`);
  await page.keyboard.press("Escape").catch(() => {});
}
await browser.close();
