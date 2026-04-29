// Diagnóstico exhaustivo: navega /tiendas → tienda → back, captura
// console errors, network failed, request statuses, y screenshot del state final.
import { chromium } from "playwright";
import { writeFileSync } from "node:fs";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  const allConsole = [];
  const allFailed = [];
  const allRequests = [];
  page.on("console", m => {
    const t = m.text();
    if (t.includes("BackNavRefresh") || m.type() === "error" || m.type() === "warning") {
      allConsole.push({ type: m.type(), text: t });
    }
  });
  page.on("pageerror", e => allConsole.push({ type: "PAGEERR", text: String(e) }));
  page.on("requestfailed", r => allFailed.push({ url: r.url(), reason: r.failure()?.errorText }));
  page.on("response", r => {
    const u = r.url();
    if (u.includes("/api/") || u.includes("/_next/")) {
      allRequests.push({ status: r.status(), url: u.slice(0, 90) });
    }
  });

  console.log("→ Limpiar sessionStorage + hard reload /tiendas");
  // Reset markers para test limpio
  await page.goto(`${BASE}/tiendas?_=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.evaluate(() => {
    sessionStorage.removeItem("__bsm_from_detail");
    sessionStorage.removeItem("__bsm_just_reloaded");
  });
  // Hard reload para asegurar bundle nuevo
  await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
  await page.waitForTimeout(3500);

  // Cierra overlays ahora que la página cargó
  await page.evaluate(() => {
    document.querySelectorAll('#welcome-coupon, [role="dialog"][aria-modal="true"]').forEach(el => el.remove());
    try { localStorage.setItem('marketplace-welcome-coupon-dismissed', '1'); } catch {}
    try { localStorage.setItem('buleje-tour-marketplace-2026-04', '1'); } catch {}
  });

  const initial = await page.evaluate(() => ({
    cards: document.querySelectorAll('a[href^="/marketplace/"]').length,
    skeletons: document.querySelectorAll('[class*="animate-pulse"]').length,
    bodyLen: document.body.innerText.length,
    sessionFromDetail: sessionStorage.getItem("__bsm_from_detail"),
    sessionReloaded: sessionStorage.getItem("__bsm_just_reloaded"),
  }));
  console.log("/tiendas inicial:", initial);

  // Limpiar logs antes del flujo crítico
  allConsole.length = 0;
  allFailed.length = 0;
  allRequests.length = 0;

  // CLICK en una tienda (el href más probable que Brandon usa)
  const storeHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/marketplace/"]'));
    for (const l of links) {
      const h = l.getAttribute("href") ?? "";
      if (/^\/marketplace\/[^\/?#]+$/.test(h)) {
        const slug = h.split("/")[2];
        if (!["explorar","buscar","ofertas","en-vivo","como-pagar","carrito","comparar","favoritos","mi-cuenta","para-vos","recetas","gift-cards","negocios","registrar","apply","calificar-entrega","payment-result","repartidor"].includes(slug)) return h;
      }
    }
    return null;
  });
  console.log("\n→ Click en", storeHref);
  await page.locator(`a[href="${storeHref}"]`).first().click({ timeout: 8000, force: true });
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 });
  await page.waitForTimeout(3000);

  const inStore = await page.evaluate(() => ({
    url: location.pathname,
    sessionFromDetail: sessionStorage.getItem("__bsm_from_detail"),
    sessionReloaded: sessionStorage.getItem("__bsm_just_reloaded"),
    bodyLen: document.body.innerText.length,
  }));
  console.log("en tienda:", inStore);

  // BACK
  console.log("\n→ history.back() (botón ←)");
  await page.evaluate(() => { history.back(); });
  await page.waitForTimeout(8000); // espera reload + fetch

  const finalState = await page.evaluate(() => ({
    url: location.pathname,
    cards: document.querySelectorAll('a[href^="/marketplace/"]').length,
    skeletons: document.querySelectorAll('[class*="animate-pulse"]').length,
    bodyLen: document.body.innerText.length,
    sessionFromDetail: sessionStorage.getItem("__bsm_from_detail"),
    sessionReloaded: sessionStorage.getItem("__bsm_just_reloaded"),
    overflow: getComputedStyle(document.body).overflow,
    hasModal: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
  }));
  console.log("\n— FINAL STATE post-back:", finalState);

  console.log("\n— CONSOLE EVENTS DURANTE FLOW —");
  for (const e of allConsole.slice(-25)) {
    console.log(`  [${e.type}] ${e.text.slice(0, 200)}`);
  }

  console.log("\n— FAILED REQUESTS —");
  for (const f of allFailed.slice(0, 10)) {
    console.log(`  ${f.reason}  ${f.url.slice(0, 100)}`);
  }

  console.log("\n— API REQUESTS (últimas 15) —");
  for (const r of allRequests.slice(-15)) {
    console.log(`  ${r.status}  ${r.url}`);
  }

  await page.screenshot({ path: "reports/audit-superadmin/diagnose-tiendas-back.png", fullPage: true });
  writeFileSync("reports/audit-superadmin/diagnose-events.json", JSON.stringify({ initial, inStore, finalState, console: allConsole, failed: allFailed, requests: allRequests }, null, 2));
  console.log("\nScreenshot full: reports/audit-superadmin/diagnose-tiendas-back.png");
  console.log("JSON: reports/audit-superadmin/diagnose-events.json");
}

main().catch(e => { console.error("Error:", e); process.exit(1); });
