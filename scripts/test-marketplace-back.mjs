// Test del fix back-nav: navega a /marketplace, entra a una tienda, back,
// y verifica que la página de marketplace cargue (no quede blanca).
// Usa el Chrome visible en :9222 — Brandon ve el flujo en su pantalla.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";

async function main() {
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  console.log("→ 1. Cargando /marketplace");
  await page.goto(`${BASE}/marketplace`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(1500);
  const navItemsBefore = await page.evaluate(() =>
    Array.from(document.querySelectorAll('nav[aria-label="Navegación del marketplace"] a'))
      .map((a) => (a.textContent ?? "").trim())
      .filter(Boolean),
  );
  const bodyLenHome1 = await page.evaluate(() => document.body.innerText.length);
  console.log("   nav items vista 1:", navItemsBefore.slice(0, 12));
  console.log("   bodyLen marketplace home:", bodyLenHome1);

  console.log("\n→ 2. Click en primera tienda");
  // Buscamos un link a /marketplace/[slug]
  const slug = await page.evaluate(() => {
    const links = Array.from(document.querySelectorAll('a[href^="/marketplace/"]'));
    for (const l of links) {
      const h = l.getAttribute("href") ?? "";
      const m = h.match(/^\/marketplace\/([^\/?#]+)$/);
      if (m && !["explorar", "buscar", "ofertas", "en-vivo", "como-pagar", "carrito",
                 "comparar", "favoritos", "mi-cuenta", "para-vos", "recetas",
                 "gift-cards", "negocios", "registrar", "apply", "calificar-entrega",
                 "payment-result", "repartidor"].includes(m[1])) {
        return m[1];
      }
    }
    return null;
  });
  if (!slug) {
    console.log("   ⚠️  No encontré link a tienda; uso buleje");
  }
  const targetSlug = slug ?? "buleje";
  await page.goto(`${BASE}/marketplace/${targetSlug}`, { waitUntil: "networkidle", timeout: 30_000 });
  await page.waitForTimeout(1500);
  const bodyLenStore = await page.evaluate(() => document.body.innerText.length);
  console.log(`   /marketplace/${targetSlug} bodyLen:`, bodyLenStore);

  console.log("\n→ 3. Back (history.back)");
  await page.goBack({ waitUntil: "networkidle", timeout: 15_000 });
  await page.waitForTimeout(2000);
  const bodyLenHome2 = await page.evaluate(() => document.body.innerText.length);
  const navItemsAfter = await page.evaluate(() =>
    Array.from(document.querySelectorAll('nav[aria-label="Navegación del marketplace"] a'))
      .map((a) => (a.textContent ?? "").trim())
      .filter(Boolean),
  );
  console.log("   bodyLen home POST-back:", bodyLenHome2);
  console.log("   nav items POST-back:", navItemsAfter.slice(0, 12));

  // Veredicto
  const ratio = bodyLenHome1 > 0 ? bodyLenHome2 / bodyLenHome1 : 0;
  if (bodyLenHome2 < 400 || ratio < 0.5) {
    console.log(`\n❌ FAIL: la home queda casi vacía tras back (${bodyLenHome2} vs ${bodyLenHome1})`);
    process.exit(2);
  }
  console.log(`\n✅ OK: home re-renderiza tras back (${bodyLenHome2} chars, ${(ratio*100).toFixed(0)}% del original)`);

  // Screenshot evidencia
  await page.screenshot({ path: "reports/audit-superadmin/back-nav-after.png", fullPage: false });
  console.log("   screenshot → reports/audit-superadmin/back-nav-after.png");
}

main().catch((e) => { console.error("Error:", e); process.exit(1); });
