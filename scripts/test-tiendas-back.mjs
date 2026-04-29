// Reproduce el bug exacto de Brandon: /tiendas → entrar a una tienda → back.
// Verifica que /tiendas re-renderice tras back (no quede estático).
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  const consoleErrs = [];
  const allLogs = [];
  page.on("console", m => {
    const t = m.text();
    if (t.includes("BackNavRefresh")) allLogs.push(`[${m.type()}] ${t}`);
    if (m.type() === "error") consoleErrs.push(t);
  });

  console.log("→ 1. /tiendas fresh");
  await page.goto(`${BASE}/tiendas`, { waitUntil: "domcontentloaded", timeout: 30_000 });
  // Cerrar overlays
  await page.evaluate(() => {
    document.querySelectorAll('#welcome-coupon, [role="dialog"][aria-modal="true"]').forEach(el => el.remove());
    try { localStorage.setItem('marketplace-welcome-coupon-dismissed', '1'); } catch {}
    try { localStorage.setItem('buleje-tour-marketplace-2026-04', '1'); } catch {}
  });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"][aria-modal="true"]').forEach(el => el.remove());
  });

  const tiendasBefore = await page.evaluate(() => ({
    bodyLen: document.body.innerText.length,
    mainHTML: (document.getElementById("main-content")?.innerHTML ?? "").length,
    cards: document.querySelectorAll('a[href^="/marketplace/"]').length,
  }));
  console.log("   /tiendas pre-click:", tiendasBefore);

  // Find a store link
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
  console.log("   target tienda href:", storeHref);

  console.log("\n→ 2. CLICK real (simula mouse de Brandon)");
  await page.locator(`a[href="${storeHref}"]`).first().click({ timeout: 8000, force: true });
  await page.waitForLoadState("networkidle", { timeout: 15_000 });
  await page.waitForTimeout(2000);
  const inStore = await page.evaluate(() => ({
    url: location.pathname,
    bodyLen: document.body.innerText.length,
  }));
  console.log("   en tienda:", inStore);

  console.log("\n→ 3. history.back() — debería disparar BackNavRefresh.reload()");
  // history.back() + esperar que el reload termine (page.waitForNavigation)
  const navPromise = page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
  await page.evaluate(() => { history.back(); });
  await navPromise;
  await page.waitForLoadState("domcontentloaded", { timeout: 10_000 });
  await page.waitForTimeout(4000); // espera reload + fetch de cards

  const afterBack = await page.evaluate(() => ({
    url: location.pathname,
    bodyLen: document.body.innerText.length,
    mainHTML: (document.getElementById("main-content")?.innerHTML ?? "").length,
    cards: document.querySelectorAll('a[href^="/marketplace/"]').length,
    skeletons: document.querySelectorAll('[class*="animate-pulse"]').length,
  }));
  console.log("   /tiendas POST-back:", afterBack);

  // Wait extra and re-check (refresh might be async)
  await page.waitForTimeout(2500);
  const afterRefresh = await page.evaluate(() => ({
    bodyLen: document.body.innerText.length,
    cards: document.querySelectorAll('a[href^="/marketplace/"]').length,
  }));
  console.log("   /tiendas +2.5s después:", afterRefresh);

  console.log("\n— BackNavRefresh logs:");
  for (const l of allLogs) console.log("  ", l);
  console.log("\n— Console errors:", consoleErrs.length);
  for (const e of consoleErrs.slice(0, 5)) console.log("   ", e.slice(0, 120));

  await page.screenshot({ path: "reports/audit-superadmin/tiendas-after-back.png", fullPage: false });

  // Veredicto
  const ratio = tiendasBefore.bodyLen > 0 ? afterRefresh.bodyLen / tiendasBefore.bodyLen : 0;
  if (afterRefresh.bodyLen < 400 || ratio < 0.5) {
    console.log(`\n❌ FAIL: /tiendas estática tras back (${afterRefresh.bodyLen} vs ${tiendasBefore.bodyLen})`);
    process.exit(2);
  }
  console.log(`\n✅ OK: /tiendas re-renderiza tras back (${(ratio*100).toFixed(0)}%, ${afterRefresh.cards} cards)`);
}

main().catch((e) => { console.error("Error:", e); process.exit(1); });
