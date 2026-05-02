import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// scrape from list page all products + detect on each PDP if hasModifiers
await page.goto("http://localhost:3000/marketplace/mi-pollo", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.evaluate(() => {
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (/tour|onboarding|coupon/i.test(k || "")) localStorage.setItem(k, "1");
  }
});
await page.waitForTimeout(1500);

const allLinks = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('a[href*="/marketplace/mi-pollo/producto/"]')).map((a) => ({
    href: a.getAttribute('href'),
    txt: a.textContent.trim().slice(0, 50),
  })).slice(0, 30);
});
console.log(`scanned ${allLinks.length} products`);

let target = null;
for (const link of allLinks) {
  const url = `http://localhost:3000${link.href}`;
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  // Click main CTA
  await page.evaluate(() => {
    const dlgs = document.querySelectorAll('[role="dialog"]');
    dlgs.forEach((d) => { if (/tour/i.test(d.outerHTML.slice(0, 300))) d.remove(); });
  });
  await page.waitForTimeout(300);
  const probe = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).filter((b) => b.offsetParent !== null);
    const cta = buttons.find((b) => /agregar al carrito|personalizar|elegir/i.test(b.textContent));
    if (!cta) return { hasCta: false };
    cta.click();
    return { hasCta: true, ctaText: cta.textContent.trim().slice(0, 50) };
  });
  await page.waitForTimeout(1500);
  const modal = await page.evaluate(() => {
    const dlgs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter((d) => !/tour/i.test(d.outerHTML.slice(0, 300)));
    if (!dlgs.length) return { hasModal: false };
    const main = dlgs[0];
    const hasMods = !!main.querySelector('[class*="ModifierOption"], [class*="modifier" i], label input[type="checkbox"], label input[type="radio"]');
    return { hasModal: true, hasMods, title: main.querySelector('h1,h2,h3')?.textContent.trim().slice(0, 80) };
  });
  console.log(`${link.txt} → ${JSON.stringify({ ...probe, ...modal })}`);
  if (modal.hasMods) {
    target = url;
    break;
  }
  // close any open modal
  await page.keyboard.press("Escape").catch(() => {});
  await page.waitForTimeout(300);
}

console.log("\n>>> TARGET:", target);

if (target) {
  await page.goto(target, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => {
    const dlgs = document.querySelectorAll('[role="dialog"]');
    dlgs.forEach((d) => { if (/tour/i.test(d.outerHTML.slice(0, 300))) d.remove(); });
  });
  await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll('button')).filter((b) => b.offsetParent !== null);
    const cta = buttons.find((b) => /agregar al carrito|personalizar/i.test(b.textContent));
    if (cta) cta.click();
  });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: "reports/audit-final/4b-mods-modal.png", fullPage: true });

  const probe = await page.evaluate(() => {
    const dlgs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter((d) => !/tour/i.test(d.outerHTML.slice(0, 300)));
    if (!dlgs.length) return null;
    const main = dlgs[0];
    const opts = Array.from(main.querySelectorAll('label, [class*="ModifierOption"], [class*="OptionCard"]')).filter((el) => el.offsetParent !== null);
    return {
      title: main.querySelector('h1,h2,h3')?.textContent.trim().slice(0, 80),
      total: opts.length,
      samples: opts.slice(0, 8).map((l) => {
        const cs = getComputedStyle(l);
        const r = l.getBoundingClientRect();
        const img = l.querySelector('img');
        return {
          tag: l.tagName,
          text: l.textContent.trim().slice(0, 50),
          padding: cs.padding,
          borderWidth: cs.borderWidth,
          borderRadius: cs.borderRadius,
          fontWeight: cs.fontWeight,
          fontSize: cs.fontSize,
          w: Math.round(r.width), h: Math.round(r.height),
          imgSize: img ? `${Math.round(img.getBoundingClientRect().width)}x${Math.round(img.getBoundingClientRect().height)}` : null,
        };
      }),
    };
  });
  console.log("MODIFIER PROBE:", JSON.stringify(probe, null, 2));

  // Click first radio/option then confirm
  await page.evaluate(() => {
    const dlgs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter((d) => !/tour/i.test(d.outerHTML.slice(0, 300)));
    if (!dlgs.length) return;
    const main = dlgs[0];
    const firstRadio = main.querySelector('input[type="radio"], label');
    if (firstRadio) (firstRadio.tagName === "LABEL" ? firstRadio : firstRadio.closest("label") || firstRadio).click();
  });
  await page.waitForTimeout(800);

  await page.evaluate(() => {
    const dlgs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter((d) => !/tour/i.test(d.outerHTML.slice(0, 300)));
    if (!dlgs.length) return;
    const main = dlgs[0];
    const btns = Array.from(main.querySelectorAll('button')).filter((b) => b.offsetParent !== null && /agregar|añadir|confirmar|continuar/i.test(b.textContent));
    if (btns.length) btns[btns.length - 1].click();
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: "reports/audit-final/4b-added-cart-modal.png", fullPage: true });

  const footer = await page.evaluate(() => {
    const dlgs = Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]')).filter((d) => !/tour/i.test(d.outerHTML.slice(0, 300)) && d.offsetParent !== null);
    const root = dlgs[0] || document.body;
    const allBtns = Array.from(root.querySelectorAll('button, a')).filter((b) => b.offsetParent !== null);
    const irCarrito = allBtns.find((b) => /ir al carrito|pagar|finalizar/i.test(b.textContent));
    const seguir = allBtns.find((b) => /seguir comprando|agregar y seguir|continuar comprando/i.test(b.textContent));
    if (!irCarrito && !seguir) return { found: false, sample: allBtns.slice(0, 12).map((b) => b.textContent.trim().slice(0, 60)) };
    const ir = irCarrito?.getBoundingClientRect();
    const sg = seguir?.getBoundingClientRect();
    return {
      found: true,
      irText: irCarrito?.textContent.trim().slice(0, 100),
      seguirText: seguir?.textContent.trim().slice(0, 100),
      ir: ir ? { y: Math.round(ir.y), x: Math.round(ir.x), w: Math.round(ir.width), h: Math.round(ir.height) } : null,
      seguir: sg ? { y: Math.round(sg.y), x: Math.round(sg.x), w: Math.round(sg.width), h: Math.round(sg.height) } : null,
      stackedVertical: ir && sg ? Math.abs(ir.x - sg.x) < 30 && sg.y > ir.y : null,
      irColor: irCarrito ? getComputedStyle(irCarrito).backgroundColor : null,
      seguirColor: seguir ? getComputedStyle(seguir).backgroundColor : null,
      irFw: irCarrito ? getComputedStyle(irCarrito).fontWeight : null,
    };
  });
  console.log("ADDED-TO-CART FOOTER:", JSON.stringify(footer, null, 2));

  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(600);
  await page.screenshot({ path: "reports/audit-final/4b-added-cart-mobile.png", fullPage: true });
}

await browser.close();
