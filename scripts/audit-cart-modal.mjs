import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

// Test desktop
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/marketplace/mi-pollo/producto/1252482", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/tour|onboarding|coupon/i.test(k || "")) localStorage.setItem(k, "1");
  }
});
await page.waitForTimeout(1500);
await page.evaluate(() => {
  document.querySelectorAll('[role="dialog"]').forEach((d) => { if (/tour/i.test(d.outerHTML.slice(0, 300))) d.remove(); });
});
await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button')).filter((b) => b.offsetParent !== null);
  const cta = buttons.find((b) => /agregar al carrito/i.test(b.textContent));
  if (cta) cta.click();
});
await page.waitForTimeout(2500);
await page.screenshot({ path: "reports/audit-final/4c-cart-modal-simple-desktop.png", fullPage: true });

const probe = await page.evaluate(() => {
  // The "added to cart" toast/modal
  const dlgs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"], [class*="toast" i], [class*="Toast"]')).filter((d) => !/tour/i.test(d.outerHTML.slice(0, 300)) && d.offsetParent !== null);
  const modal = dlgs.find((d) => /agregado|añadido|en tu carrito/i.test(d.textContent)) || dlgs[0];
  if (!modal) return { found: false, dlgs: dlgs.length, sampleAllBtns: Array.from(document.querySelectorAll('button, a')).filter((b) => b.offsetParent !== null).slice(0, 20).map((b) => b.textContent.trim().slice(0, 60)) };
  const btns = Array.from(modal.querySelectorAll('button, a')).filter((b) => b.offsetParent !== null);
  const irCarrito = btns.find((b) => /ir al carrito|pagar|finalizar/i.test(b.textContent));
  const seguir = btns.find((b) => /seguir comprando|agregar y seguir|continuar comprando/i.test(b.textContent));
  return {
    found: true,
    modalText: modal.textContent.trim().slice(0, 200),
    btns: btns.map((b) => b.textContent.trim().slice(0, 60)),
    ir: irCarrito ? { txt: irCarrito.textContent.trim().slice(0, 80), x: Math.round(irCarrito.getBoundingClientRect().x), y: Math.round(irCarrito.getBoundingClientRect().y), w: Math.round(irCarrito.getBoundingClientRect().width), bg: getComputedStyle(irCarrito).backgroundColor, fw: getComputedStyle(irCarrito).fontWeight } : null,
    seguir: seguir ? { txt: seguir.textContent.trim().slice(0, 80), x: Math.round(seguir.getBoundingClientRect().x), y: Math.round(seguir.getBoundingClientRect().y), w: Math.round(seguir.getBoundingClientRect().width), bg: getComputedStyle(seguir).backgroundColor, fw: getComputedStyle(seguir).fontWeight } : null,
    stackedVertical: irCarrito && seguir ? Math.abs(irCarrito.getBoundingClientRect().x - seguir.getBoundingClientRect().x) < 30 && seguir.getBoundingClientRect().y > irCarrito.getBoundingClientRect().y : null,
  };
});
console.log("DESKTOP:", JSON.stringify(probe, null, 2));

// Mobile
await page.setViewportSize({ width: 375, height: 800 });
await page.waitForTimeout(800);
await page.screenshot({ path: "reports/audit-final/4c-cart-modal-simple-mobile.png", fullPage: true });

await browser.close();
