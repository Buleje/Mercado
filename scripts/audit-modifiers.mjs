import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/audit-final";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

page.on("pageerror", (e) => console.log(`[js-error] ${e.message}`));
page.on("console", (msg) => { if (msg.type() === "error") console.log(`[console-error] ${msg.text().slice(0, 200)}`); });

// kill onboarding/tour BEFORE going to PDP
await page.goto("http://localhost:3000/marketplace/mi-pollo", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.evaluate(() => {
  for (const k of ['first-visit-coupon-shown', 'tour-mp-pdp', 'pdp-tour', 'tour-pdp', 'onboarding-completed-main', 'onboarding-completed-mi-pollo']) {
    localStorage.setItem(k, "true");
    localStorage.setItem(k, "1");
  }
  // try to mark all onboarding/tour-related
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/tour|onboarding|coupon/i.test(k)) localStorage.setItem(k, "1");
  }
});
await page.waitForTimeout(2000);

// pick products that likely have modifiers — heuristic by name
const candidates = await page.evaluate(() => {
  const links = Array.from(document.querySelectorAll('a[href*="/marketplace/mi-pollo/"]'));
  const found = [];
  for (const l of links) {
    const txt = l.textContent.trim().toLowerCase();
    const href = l.getAttribute('href');
    if (/aliñ|salchipapa|combo|broaster|parrilla|porci[oó]n|pollo/i.test(txt) && href && href.includes('/producto/')) {
      found.push({ href, txt: txt.slice(0, 60) });
    }
  }
  return found.slice(0, 8);
});
console.log("candidatos:", JSON.stringify(candidates, null, 2));

let foundModifierProduct = null;
for (const c of candidates) {
  const url = `http://localhost:3000${c.href}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);

  // close any tour modal
  const closeRes = await page.evaluate(() => {
    const closed = [];
    const closeBtns = Array.from(document.querySelectorAll('[role="dialog"] button, [aria-modal="true"] button')).filter((b) => /cerrar|skip|saltar|✕|×|x|entendido|listo|empezar|omitir/i.test(b.textContent + ' ' + (b.getAttribute('aria-label') || '')));
    for (const b of closeBtns) { try { b.click(); closed.push(b.textContent.slice(0, 30)); } catch {} }
    // Also click last button labeled "Empezar" or "Entendido" in any dialog
    return closed;
  });
  console.log(`[${c.txt.slice(0, 30)}] tour close attempts:`, closeRes);
  await page.waitForTimeout(1000);
  // Force-remove leftover dialogs
  await page.evaluate(() => {
    const dlgs = document.querySelectorAll('[role="dialog"][aria-labelledby="tour-title"], [role="dialog"][class*="tour" i]');
    dlgs.forEach((d) => d.remove());
  });
  await page.waitForTimeout(500);

  // Check if product has modifiers (heuristic: header "Personaliza", "Elegí", etc, or known modifier sections)
  const hasMods = await page.evaluate(() => {
    const text = document.body.innerText.toLowerCase();
    return /personaliz|elegí|elegi|extras|adicionales|sabor|tamaño|salsa|bebida|opciones|modificador/i.test(text);
  });
  console.log(`[${c.txt.slice(0, 30)}] hasMods=${hasMods}, url=${url}`);

  if (hasMods) {
    foundModifierProduct = url;
    break;
  }
}

if (!foundModifierProduct) {
  console.log("=== fallback: usar primer producto con texto Aliñas o Salchipapa ===");
  const fallback = candidates.find((c) => /aliñ|salchipapa|combo/i.test(c.txt))?.href || candidates[0]?.href;
  if (fallback) foundModifierProduct = `http://localhost:3000${fallback}`;
}

if (foundModifierProduct) {
  console.log(`\n>>> usando: ${foundModifierProduct}`);
  await page.goto(foundModifierProduct, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    const dlgs = document.querySelectorAll('[role="dialog"]');
    dlgs.forEach((d) => {
      if (/tour/i.test(d.outerHTML.slice(0, 400)) || d.querySelector('[id="tour-title"]')) d.remove();
    });
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/4b-pdp-with-mods-desktop.png`, fullPage: true });

  // Find CTA "Agregar al carrito" or "Personalizar"
  const clicked = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).filter((b) => b.offsetParent !== null);
    const target = buttons.find((b) => /agregar|añadir|carrito|personalizar|elegir|comprar/i.test(b.textContent));
    if (target) { target.click(); return target.textContent.slice(0, 60); }
    return null;
  });
  console.log(`>>> click CTA: "${clicked}"`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/4b-modifiers-modal-desktop.png`, fullPage: true });

  // Probe modal modifier options
  const mods = await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]:not([aria-labelledby="tour-title"]), [aria-modal="true"]:not([aria-labelledby="tour-title"])');
    if (!modal) return { found: false };
    const opts = Array.from(modal.querySelectorAll('label, button[role="checkbox"], button[role="radio"], [data-modifier], [class*="ModifierOption"], [class*="OptionCard"]')).filter((el) => el.offsetParent !== null);
    return {
      found: true,
      title: modal.querySelector('h1, h2, h3')?.textContent.trim().slice(0, 80),
      total: opts.length,
      samples: opts.slice(0, 6).map((l) => {
        const cs = getComputedStyle(l);
        const r = l.getBoundingClientRect();
        const img = l.querySelector('img');
        return {
          tag: l.tagName,
          text: l.textContent.trim().slice(0, 40),
          padding: cs.padding,
          borderWidth: cs.borderWidth,
          borderRadius: cs.borderRadius,
          fontWeight: cs.fontWeight,
          fontSize: cs.fontSize,
          w: Math.round(r.width), h: Math.round(r.height),
          img: img ? `${Math.round(img.getBoundingClientRect().width)}x${Math.round(img.getBoundingClientRect().height)}` : null,
        };
      }),
    };
  });
  console.log("MODIFIER MODAL PROBE:", JSON.stringify(mods, null, 2));

  // Click confirmar
  await page.waitForTimeout(800);
  const confirmed = await page.evaluate(() => {
    const modal = document.querySelector('[role="dialog"]:not([aria-labelledby="tour-title"]), [aria-modal="true"]');
    if (!modal) return null;
    const btns = Array.from(modal.querySelectorAll('button')).filter((b) => b.offsetParent !== null && /agregar|añadir|confirmar|continuar/i.test(b.textContent));
    if (btns.length) { const t = btns[btns.length - 1]; t.click(); return t.textContent.trim().slice(0, 60); }
    return null;
  });
  console.log(`>>> confirmar mods: "${confirmed}"`);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/4b-added-to-cart-modal-desktop.png`, fullPage: true });

  const footer = await page.evaluate(() => {
    const allBtns = Array.from(document.querySelectorAll('button, a')).filter((b) => b.offsetParent !== null);
    const irCarrito = allBtns.find((b) => /ir al carrito|pagar|finalizar/i.test(b.textContent));
    const seguir = allBtns.find((b) => /seguir comprando|agregar y seguir|continuar comprando/i.test(b.textContent));
    if (!irCarrito && !seguir) return { found: false, sample: allBtns.slice(0, 12).map((b) => b.textContent.trim().slice(0, 50)) };
    const ir = irCarrito?.getBoundingClientRect();
    const sg = seguir?.getBoundingClientRect();
    return {
      found: true,
      irText: irCarrito?.textContent.trim().slice(0, 80),
      seguirText: seguir?.textContent.trim().slice(0, 80),
      ir: ir ? { y: Math.round(ir.y), x: Math.round(ir.x), w: Math.round(ir.width), h: Math.round(ir.height) } : null,
      seguir: sg ? { y: Math.round(sg.y), x: Math.round(sg.x), w: Math.round(sg.width), h: Math.round(sg.height) } : null,
      stackedVertical: ir && sg ? Math.abs(ir.x - sg.x) < 30 && sg.y > ir.y : null,
      irColor: irCarrito ? getComputedStyle(irCarrito).backgroundColor : null,
      seguirColor: seguir ? getComputedStyle(seguir).backgroundColor : null,
    };
  });
  console.log("ADDED-TO-CART FOOTER:", JSON.stringify(footer, null, 2));

  // Mobile capture
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/4b-added-to-cart-mobile.png`, fullPage: true });
}

await browser.close();
