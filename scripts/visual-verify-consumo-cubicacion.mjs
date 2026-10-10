/**
 * ADR-370: en Consumos se cubica lo aserrado y el resumen reparte lo medido
 * entre las trozas tildadas y los días declarados.
 */
import { chromium } from "playwright";
import { mkdir } from "node:fs/promises";

const BASE = "http://localhost:3000";
const SLUG = "main";
const OUT = "/tmp/claude-1000/-home-usuario-proyectos-Mercado/8815235b-f908-4762-a543-eb8b809a0b31/scratchpad/shots";
const DARK = process.argv.includes("--dark");

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 }, extraHTTPHeaders: { "x-tenant-id": SLUG } });
await ctx.addInitScript((d) => {
  try {
    localStorage.setItem("onboarding-completed-main", "1");
    if (d) sessionStorage.setItem("buleje-theme-session-v2", "dark");
  } catch {}
}, DARK);
const page = await ctx.newPage();
const errores = [];
page.on("pageerror", (e) => errores.push(e.message.slice(0, 160)));
page.on("response", async (r) => {
  if (r.url().includes("/api/admin/forestal/cubicaciones")) {
    const t = await r.text().catch(() => "");
    console.log("GET cubicaciones →", r.status(), t.slice(0, 120));
  }
});
await mkdir(OUT, { recursive: true });
await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
await page.goto(`${BASE}/admin?tab=ctp-libro-operaciones&vista=consumos`, { waitUntil: "domcontentloaded", timeout: 120_000 });
await page.waitForTimeout(8000);

const bloque = page.locator("section", { hasText: /Cubicación de lo aserrado/ }).first();
console.log("bloque en Consumos:", await bloque.count());
if (await bloque.count() === 0) {
  console.log("apartados:", (await page.getByRole("button").allInnerTexts()).slice(0, 25).join(" | "));
}
await page.screenshot({ path: `${OUT}/${DARK ? "49-dark" : "48"}-consumo-cubicacion.png`, fullPage: false });

/* El patio se tilda con un lote elegido: sin lote no hay a dónde cargar las
   piezas, así que la tabla no ofrece checks. */
const combo = page.locator("select").filter({ hasText: /Consumir en un lote|LA-/ }).first();
if (await combo.count()) {
  const ops = await combo.locator("option").allInnerTexts();
  console.log("lotes ofrecidos:", ops.length - 1);
  if (ops.length > 1) { await combo.selectOption({ index: 1 }); await page.waitForTimeout(3000); }
}
// Tildar dos trozas del patio para que haya rolliza contra la que repartir.
/* «elegir las N de este filtro» tilda de una: es el atajo que usa el operario y
   el único control seguro de accionar desde el script. */
const elegirTodas = page.getByRole("button", { name: /elegir las \d+ de este filtro/i }).first();
if (await elegirTodas.count()) {
  console.log("atajo:", (await elegirTodas.innerText()).trim());
  await elegirTodas.click();
} else {
  const checks = page.locator('input[type="checkbox"]');
  console.log("checkboxes en la página:", await checks.count());
  for (const i of [1, 2]) await checks.nth(i).check().catch(() => {});
}
await page.waitForTimeout(1200);

// Elegir la cubicación guardada y ver el reparto.
const sel = bloque.getByLabel(/Cubicación a usar/i).first();
if (await sel.count()) {
  const ops = await sel.locator("option").allInnerTexts();
  console.log("cubicaciones ofrecidas:", ops.length - 1, "·", ops[1]?.replace(/\s+/g, " ").slice(0, 80) ?? "");
  if (ops.length > 1) {
    await sel.selectOption({ index: 1 });
    await bloque.getByLabel(/Días de aserrío/i).first().fill("3");
    await page.waitForTimeout(1500);
    console.log("resumen:", (await bloque.innerText()).replace(/\n+/g, " · ").slice(0, 700));
  }
}
await page.screenshot({ path: `${OUT}/${DARK ? "51-dark" : "50"}-consumo-reparto.png`, fullPage: false });
console.log("errores:", errores.length ? errores : "ninguno");
await browser.close();
