// Test profundo del bug back-nav: usa CLICKS reales (no goto), captura console
// errors, network failures, suspense pendientes, y screenshot del DOM congelado.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  const consoleEvents = [];
  const failedReqs = [];
  const pageErrors = [];
  page.on("console", (m) => consoleEvents.push({ type: m.type(), text: m.text(), at: page.url() }));
  page.on("pageerror", (e) => pageErrors.push({ text: String(e), at: page.url() }));
  page.on("requestfailed", (r) => failedReqs.push({ url: r.url(), reason: r.failure()?.errorText, at: page.url() }));

  console.log("→ 1. Cargando /marketplace fresh");
  await page.goto(`${BASE}/marketplace`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(1500);

  // Cerrar overlays que tapan los clicks (welcome-coupon, first-visit-tour)
  await page.evaluate(() => {
    document.querySelectorAll('#welcome-coupon, [role="dialog"][aria-modal="true"]').forEach(el => el.remove());
    try { localStorage.setItem('marketplace-welcome-coupon-dismissed', '1'); } catch {}
    try { localStorage.setItem('buleje-tour-marketplace-2026-04', '1'); } catch {}
  });
  await page.waitForTimeout(300);
  // Kill again any tour overlays that re-render
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(el => el.remove());
  });
  await page.waitForTimeout(200);

  // 2. Click en una tienda (link real, navegación SPA)
  const storeHref = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/marketplace/"]'));
    for (const l of links) {
      const h = l.getAttribute("href") ?? "";
      const m = h.match(/^\/marketplace\/([^\/?#]+)$/);
      if (!m) continue;
      const reserved = ["explorar","buscar","ofertas","en-vivo","como-pagar","carrito","comparar","favoritos","mi-cuenta","para-vos","recetas","gift-cards","negocios","registrar","apply","calificar-entrega","payment-result","repartidor"];
      if (!reserved.includes(m[1])) return h;
    }
    return null;
  });
  if (!storeHref) { console.log("⚠️  No encontré tienda — abort"); process.exit(2); }
  console.log(`→ 2. Click en ${storeHref} (CLICK REAL)`);
  await page.click(`a[href="${storeHref}"]`, { timeout: 10_000 });
  await page.waitForLoadState("networkidle", { timeout: 30_000 });
  await page.waitForTimeout(2000);
  const storeBody = await page.evaluate(() => document.body.innerText.length);
  console.log(`   tienda cargada bodyLen=${storeBody}, url=${new URL(page.url()).pathname}`);

  // 3. Back via browser API (goBack = simula botón ←)
  console.log("\n→ 3. page.goBack() — simula botón ← del navegador");
  consoleEvents.length = 0; failedReqs.length = 0; pageErrors.length = 0;
  await page.goBack({ timeout: 15_000 });
  await page.waitForTimeout(3000);

  const stateAfterBack = await page.evaluate(() => ({
    url: location.pathname,
    bodyLen: document.body.innerText.length,
    mainHTML: (document.getElementById("main-content")?.innerHTML ?? "").length,
    hasSkeletons: !!document.querySelector('[class*="animate-pulse"]'),
    suspenseFallback: !!document.querySelector('[data-suspense-pending]'),
    visible: document.visibilityState,
    readyState: document.readyState,
    bodyChildren: document.body.children.length,
    overflowHidden: getComputedStyle(document.body).overflow === "hidden",
  }));
  console.log("   state POST-back:", JSON.stringify(stateAfterBack, null, 2));

  console.log("\n— Console errors durante back:");
  for (const e of consoleEvents.filter(e => e.type === "error" || e.type === "warning").slice(0, 8)) {
    console.log(`   [${e.type}] ${e.text.slice(0, 150)}`);
  }
  console.log("\n— Page errors:");
  for (const e of pageErrors.slice(0, 5)) console.log(`   ${e.text.slice(0, 200)}`);
  console.log("\n— Failed requests durante back:");
  for (const r of failedReqs.slice(0, 8)) console.log(`   ${r.reason} ← ${r.url.slice(0, 100)}`);

  await page.screenshot({ path: "reports/audit-superadmin/back-frozen.png", fullPage: false });
  console.log("\nScreenshot: reports/audit-superadmin/back-frozen.png");

  // 4. ¿Está todo congelado? Test: trigger un click y ver si responde
  console.log("\n→ 4. Test interactividad: click en logo");
  try {
    const logoVisible = await page.evaluate(() => {
      const logo = document.querySelector('a[href="/marketplace"][aria-label*="marketplace"]') ||
                   document.querySelector('a[aria-label*="marketplace"]');
      if (!logo) return false;
      const r = logo.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
    console.log(`   logo visible: ${logoVisible}`);
  } catch (e) {
    console.log(`   ERR: ${e.message.slice(0, 100)}`);
  }
}

main().catch((e) => { console.error("Error:", e); process.exit(1); });
