// QA visual mobile del /marketplace — captura navbar + sub-nav categorías
// en estado inicial y tras scroll (para verificar sticky).
import { chromium } from "playwright";

const OUT = "reports/marketplace-qa";
const URL = "http://localhost:3000/marketplace";

const shots = [];
const browser = await chromium.launch({ headless: true });
try {
  for (const scheme of ["light", "dark"]) {
    const ctx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      colorScheme: scheme,
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    });
    // Suprime overlays de primera visita que tapan la UI (tour + cupón).
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem("buleje-tour-marketplace-2026-04", "done");
        localStorage.setItem("marketplace:welcome-coupon:v1", "dismissed");
        localStorage.setItem("onboarding-completed-main", "1");
      } catch {}
    });
    const page = await ctx.newPage();
    await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
    // dar tiempo a que monte la barra de categorías (fetch client-side)
    await page.waitForTimeout(2500);

    // Cerrar tour de primera visita si sigue abierto (click "Omitir tour").
    for (const label of ["Omitir tour", "Saltar", "Cerrar"]) {
      const btn = page.getByRole("button", { name: label });
      if (await btn.count().catch(() => 0)) {
        await btn.first().click().catch(() => {});
        break;
      }
    }
    await page.keyboard.press("Escape").catch(() => {});
    await page.waitForTimeout(500);

    // 1) Above the fold (top)
    const top = `${OUT}/mobile-${scheme}-1-top.png`;
    await page.screenshot({ path: top });
    shots.push(top);

    // 2) Tras scroll: ¿navbar + chips quedan fijos arriba?
    await page.evaluate(() => window.scrollTo({ top: 700, behavior: "instant" }));
    await page.waitForTimeout(700);
    const scrolled = `${OUT}/mobile-${scheme}-2-scrolled.png`;
    await page.screenshot({ path: scrolled });
    shots.push(scrolled);

    // 3) Abrir el buscador mobile (overlay full-screen)
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.waitForTimeout(300);
    if (scheme === "light") {
      const pill = page.getByPlaceholder("Buscar productos o tiendas…");
      if (await pill.count().catch(() => 0)) {
        await pill.first().click().catch(() => {});
        await page.waitForTimeout(900);
        await page.screenshot({ path: `${OUT}/mobile-search-1-empty.png` });
        shots.push(`${OUT}/mobile-search-1-empty.png`);
        // tipear para ver sugerencias en vivo
        const overlayInput = page.getByPlaceholder("Buscar productos, bodegas o categorías");
        if (await overlayInput.count().catch(() => 0)) {
          await overlayInput.first().fill("arroz").catch(() => {});
          await page.waitForTimeout(1200);
          await page.screenshot({ path: `${OUT}/mobile-search-2-typing.png` });
          shots.push(`${OUT}/mobile-search-2-typing.png`);
        }
        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(300);
      }
    }

    // Diagnóstico runtime del sticky del navbar + barra de categorías
    const diag = await page.evaluate(() => {
      const nav = document.querySelector('nav[aria-label="Navegación del marketplace"]');
      const catBar = document.querySelector('nav[aria-label="Categorías del marketplace"]');
      const r = (el) => (el ? el.getBoundingClientRect() : null);
      const cs = (el) => (el ? getComputedStyle(el) : null);
      return {
        scrollY: Math.round(window.scrollY),
        navbar: nav
          ? { position: cs(nav).position, top: r(nav).top, height: Math.round(r(nav).height) }
          : "NO ENCONTRADO",
        categoriesBar: catBar
          ? {
              position: cs(catBar.closest("div") ?? catBar).position,
              top: Math.round(r(catBar).top),
              chips: catBar.querySelectorAll("a").length,
            }
          : "NO ENCONTRADO",
      };
    });
    console.log(`[${scheme}]`, JSON.stringify(diag, null, 2));
    await ctx.close();
  }
} finally {
  await browser.close();
}
console.log("SHOTS:", shots.join(" "));
