import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = "reports/audit-final";
mkdirSync(OUT, { recursive: true });

const issues = [];
const log = (m) => { console.log(m); issues.push(m); };

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

async function killModals(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("first-visit-coupon-shown", "true");
      localStorage.setItem("onboarding-completed-main", "1");
      const slug = location.pathname.match(/^\/admin\/([^\/]+)/)?.[1];
      if (slug) localStorage.setItem(`onboarding-completed-${slug}`, "1");
    } catch (_) {}
  }).catch(() => {});
}

async function loginAdmin(page, user, pass, kind = "admin") {
  const userId = kind === "superadmin" ? "su-username" : "username";
  const passId = kind === "superadmin" ? "su-password" : "password";
  const userInput = page.locator(`#${userId}`);
  const passInput = page.locator(`#${passId}`);
  if ((await userInput.count()) === 0) return false;
  await userInput.click();
  await userInput.fill(user);
  await passInput.click();
  await passInput.fill(pass);
  await page.waitForTimeout(400);
  // Submit via Enter inside password input — works regardless of disabled state on button
  await passInput.press("Enter");
  await page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(2500);
  return true;
}

async function captureViewports(page, base, name, opts = {}) {
  const { fullPage = false } = opts;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${base}-${name}-desktop.png`, fullPage });
  await page.setViewportSize({ width: 375, height: 800 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT}/${base}-${name}-mobile.png`, fullPage });
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function probeColors(page, selector, label) {
  return page.evaluate(({ sel, lbl }) => {
    const els = Array.from(document.querySelectorAll(sel)).slice(0, 6);
    return els.map((el, i) => {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return {
        idx: i, label: lbl,
        bg: cs.backgroundColor, color: cs.color,
        fontSize: cs.fontSize, fontWeight: cs.fontWeight,
        rect: { w: Math.round(r.width), h: Math.round(r.height) },
      };
    });
  }, { sel: selector, lbl: label });
}

// ---------- 1. SUPERADMIN DASHBOARD ----------
console.log("\n=== 1. SUPERADMIN DASHBOARD ===");
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`[superadmin][js-error] ${e.message}`));
  page.on("console", (msg) => { if (msg.type() === "error") log(`[superadmin][console-error] ${msg.text().slice(0, 200)}`); });

  await page.goto("http://localhost:3000/superadmin", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  await killModals(page);
  await loginAdmin(page, "superadmin", "Super2026!", "superadmin");
  log(`[superadmin] post-login URL: ${page.url()}`);

  await page.goto("http://localhost:3000/superadmin/dashboard", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(3500);
  await killModals(page);
  await page.waitForTimeout(1500);

  await captureViewports(page, "1-superadmin", "dashboard", { fullPage: true });

  const heros = await probeColors(page, '[class*="KPIHero"], [data-kpi-hero], [class*="hero-card"], [class*="HeroCard"]', "kpi-hero");
  log(`[superadmin] KPIHeroCards (selector ancho) detectadas: ${heros.length}`);
  heros.forEach((h) => log(`  hero[${h.idx}] bg=${h.bg} color=${h.color} fs=${h.fontSize} fw=${h.fontWeight} ${h.rect.w}x${h.rect.h}`));

  // Heuristica: buscar 4 KPI cards top-row
  const kpiHeuristic = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('div, article, section')).filter((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 200 && r.width < 500 && r.height > 100 && r.height < 280 && r.y < 600 && cs.borderRadius && parseFloat(cs.borderRadius) > 0;
    });
    const top = cards.slice(0, 12).map((c) => {
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      const numEl = c.querySelector('h1, h2, h3, [class*="text-3xl"], [class*="text-4xl"], [class*="text-5xl"]');
      return {
        bg: cs.backgroundColor,
        x: Math.round(r.x), y: Math.round(r.y),
        w: Math.round(r.width), h: Math.round(r.height),
        big: numEl ? { text: numEl.textContent.trim().slice(0, 30), fs: getComputedStyle(numEl).fontSize, color: getComputedStyle(numEl).color } : null,
      };
    });
    return top;
  });
  log(`[superadmin] heuristica KPI cards top:`);
  kpiHeuristic.forEach((k, i) => log(`  k[${i}] @${k.x},${k.y} ${k.w}x${k.h} bg=${k.bg} num=${JSON.stringify(k.big)}`));

  const widgets = await page.evaluate(() => {
    const text = document.body.innerText;
    return {
      monthly: /monthly|mensual|overview|resumen mensual/i.test(text),
      planDist: /plan distrib|distribuci[oó]n de planes|plan dist/i.test(text),
      health: /salud del negocio|business health|health|radial/i.test(text),
      svgs: document.querySelectorAll('svg').length,
      circles: document.querySelectorAll('svg circle').length,
      paths: document.querySelectorAll('svg path').length,
    };
  });
  log(`[superadmin] widgets: monthly=${widgets.monthly}, planDist=${widgets.planDist}, health=${widgets.health}, svgs=${widgets.svgs}, circles=${widgets.circles}, paths=${widgets.paths}`);

  const blackCharts = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('div, svg, canvas'));
    const black = [];
    for (const el of all) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (r.width < 200 || r.height < 100) continue;
      const m = cs.backgroundColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const [r2, g, b] = [+m[1], +m[2], +m[3]];
        if (r2 < 30 && g < 30 && b < 30) black.push({ tag: el.tagName, w: Math.round(r.width), h: Math.round(r.height), bg: cs.backgroundColor });
      }
    }
    return black.slice(0, 6);
  });
  log(`[superadmin] zonas grandes con fondo casi-negro: ${blackCharts.length}`);
  blackCharts.forEach((b, i) => log(`  black[${i}] ${b.tag} ${b.w}x${b.h} ${b.bg}`));

  await ctx.close();
} catch (e) {
  log(`[superadmin] FATAL: ${e.message}`);
}

// ---------- 2. ADMIN VENDOR DASHBOARD ----------
console.log("\n=== 2. ADMIN vendor-dashboard ===");
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`[admin][js-error] ${e.message}`));
  page.on("console", (msg) => { if (msg.type() === "error") log(`[admin][console-error] ${msg.text().slice(0, 200)}`); });

  await page.goto("http://localhost:3000/admin", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(1500);
  await killModals(page);
  await loginAdmin(page, "qaadmin", "Qa-admin-1234", "admin");
  log(`[admin] post-login URL: ${page.url()}`);

  await page.goto("http://localhost:3000/admin?tab=vendor-dashboard", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(4000);
  await killModals(page);
  await page.waitForTimeout(1500);

  await captureViewports(page, "2-admin-vendor", "resumen", { fullPage: true });

  const empty = await page.evaluate(() => {
    const imgs = Array.from(document.querySelectorAll('img'));
    const paiche = imgs.filter((i) => /paiche|empty|fish|pez/i.test((i.src || '') + ' ' + (i.alt || ''))).length;
    const text = document.body.innerText;
    return {
      paiche,
      noData: /sin datos|no hay|empty|sin informaci[oó]n|aún no|todavía no/i.test(text),
      bodyLen: text.length,
    };
  });
  log(`[admin] paiche refs en imágenes: ${empty.paiche}, hay mensajes empty: ${empty.noData}, texto total: ${empty.bodyLen}`);

  const dateSelector = await page.evaluate(() => {
    const btns = Array.from(document.querySelectorAll('button, [role="tab"]'));
    return {
      dia: btns.some((b) => /^d[ií]a$/i.test(b.textContent.trim())),
      rango: btns.some((b) => /^rango$/i.test(b.textContent.trim())),
      sample: btns.slice(0, 30).map((b) => b.textContent.trim().slice(0, 25)).filter(Boolean),
    };
  });
  log(`[admin] selector fecha: dia=${dateSelector.dia}, rango=${dateSelector.rango}`);
  log(`[admin] muestra botones: ${dateSelector.sample.slice(0, 15).join(" | ")}`);

  const tabs = ["ventas", "caja", "inventario", "compras", "productos", "clientes"];
  for (const t of tabs) {
    try {
      await page.goto(`http://localhost:3000/admin?tab=${t}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(3000);
      await killModals(page);
      await page.screenshot({ path: `${OUT}/2-admin-tab-${t}-desktop.png` });
      const errs = await page.evaluate(() => {
        const text = document.body.innerText;
        return {
          hasError: /error|fall[oó]|no se pudo/i.test(text.slice(0, 400)),
          firstHead: (document.querySelector('h1, h2')?.textContent || '').trim().slice(0, 60),
        };
      });
      log(`[admin] tab ${t}: heading="${errs.firstHead}" hasError=${errs.hasError}`);
    } catch (e) {
      log(`[admin] tab ${t} ERROR: ${e.message}`);
    }
  }

  await ctx.close();
} catch (e) {
  log(`[admin] FATAL: ${e.message}`);
}

// ---------- 3. LANDING ----------
console.log("\n=== 3. LANDING ===");
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`[landing][js-error] ${e.message}`));
  page.on("console", (msg) => { if (msg.type() === "error") log(`[landing][console-error] ${msg.text().slice(0, 200)}`); });

  await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2000);
  await killModals(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/3-landing-top-desktop.png` });

  await page.evaluate(() => window.scrollTo({ top: 800, behavior: "instant" }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/3-landing-stats-desktop.png` });

  await page.evaluate(() => window.scrollTo({ top: 1600, behavior: "instant" }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/3-landing-tiles-desktop.png` });

  await page.evaluate(() => window.scrollTo({ top: 2400, behavior: "instant" }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/3-landing-mid-desktop.png` });

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/3-landing-full-desktop.png`, fullPage: true });

  const stats = await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('[class*="stat" i], [class*="marquee" i], [class*="Stats"], [class*="Marquee"]'));
    const numbers = [];
    for (const c of cands) {
      const nums = c.querySelectorAll('span, strong, h1, h2, h3, h4, p');
      for (const n of Array.from(nums).slice(0, 6)) {
        const cs = getComputedStyle(n);
        const txt = n.textContent.trim();
        if (/\d/.test(txt) && txt.length < 25 && parseFloat(cs.fontSize) > 18) {
          numbers.push({ txt: txt.slice(0, 25), color: cs.color, fontSize: cs.fontSize });
        }
      }
    }
    return numbers.slice(0, 16);
  });
  log(`[landing] StatsMarquee numeros (esperado teal unificado #14b8a6 / rgb(20, 184, 166) o similar):`);
  stats.forEach((s) => log(`  "${s.txt}" color=${s.color} fs=${s.fontSize}`));

  const tiles = await page.evaluate(() => {
    const cands = Array.from(document.querySelectorAll('[class*="categor" i], [class*="tile" i]'));
    return cands.slice(0, 10).map((c) => {
      const cs = getComputedStyle(c);
      const r = c.getBoundingClientRect();
      return {
        bg: cs.backgroundColor,
        border: cs.borderColor,
        borderWidth: cs.borderWidth,
        borderRadius: cs.borderRadius,
        w: Math.round(r.width), h: Math.round(r.height),
      };
    });
  });
  log(`[landing] PopularCategoriesTiles muestreo:`);
  tiles.forEach((t, i) => log(`  tile[${i}] bg=${t.bg} border=${t.border} (${t.borderWidth}) radius=${t.borderRadius} ${t.w}x${t.h}`));

  // Reveal: verificar si hay elementos con opacity 0 todavía (animación pendiente)
  const reveal = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('section *'));
    let zero = 0, transformed = 0;
    for (const el of all.slice(0, 800)) {
      const cs = getComputedStyle(el);
      if (parseFloat(cs.opacity) < 0.05) zero++;
      if (cs.transform && cs.transform !== 'none' && cs.transform.includes('matrix')) transformed++;
    }
    return { zero, transformed };
  });
  log(`[landing] reveal: elementos invisibles aún=${reveal.zero}, con transform=${reveal.transformed}`);

  await page.setViewportSize({ width: 375, height: 800 });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/3-landing-top-mobile.png` });
  await page.screenshot({ path: `${OUT}/3-landing-full-mobile.png`, fullPage: true });

  await ctx.close();
} catch (e) {
  log(`[landing] FATAL: ${e.message}`);
}

// ---------- 4. MARKETPLACE mi-pollo ----------
console.log("\n=== 4. MARKETPLACE mi-pollo ===");
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`[mp-pollo][js-error] ${e.message}`));
  page.on("console", (msg) => { if (msg.type() === "error") log(`[mp-pollo][console-error] ${msg.text().slice(0, 200)}`); });

  await page.goto("http://localhost:3000/marketplace/mi-pollo", { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForTimeout(2500);
  await killModals(page);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/4-mp-pollo-list-desktop.png`, fullPage: true });

  const productHref = await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('a[href*="/marketplace/mi-pollo/"]'));
    for (const c of cards.slice(0, 20)) {
      const href = c.getAttribute("href");
      if (href && !/\/$/.test(href) && href.split('/').filter(Boolean).length >= 3) return href;
    }
    return null;
  });
  log(`[mp-pollo] primer producto detectado: ${productHref}`);

  if (productHref) {
    await page.goto(`http://localhost:3000${productHref}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `${OUT}/4-mp-pollo-pdp-desktop.png`, fullPage: true });

    const ctaInfo = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      const target = buttons.find((b) => /agregar|añadir|carrito|elegir|comprar/i.test(b.textContent.trim()));
      if (target) target.scrollIntoView({ block: "center" });
      return target ? target.textContent.trim().slice(0, 50) : null;
    });
    log(`[mp-pollo] CTA principal detectado: "${ctaInfo}"`);

    if (ctaInfo) {
      try {
        await page.locator('button', { hasText: /agregar|añadir|carrito|elegir|comprar/i }).first().click({ timeout: 10000 });
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/4-mp-pollo-modal-modifiers-desktop.png`, fullPage: true });

        const mods = await page.evaluate(() => {
          // Buscar modal con opciones
          const modal = document.querySelector('[role="dialog"], [class*="Dialog"], [class*="modal" i]');
          const root = modal || document;
          const opts = Array.from(root.querySelectorAll('label, button[role="checkbox"], button[role="radio"], [data-modifier], [class*="modifier" i] [class*="option" i]'));
          return opts.slice(0, 10).map((l) => {
            const cs = getComputedStyle(l);
            const r = l.getBoundingClientRect();
            const img = l.querySelector('img');
            return {
              tag: l.tagName,
              padding: cs.padding,
              borderWidth: cs.borderWidth,
              fontWeight: cs.fontWeight,
              fontSize: cs.fontSize,
              w: Math.round(r.width), h: Math.round(r.height),
              hasImg: !!img,
              imgSize: img ? `${Math.round(img.getBoundingClientRect().width)}x${Math.round(img.getBoundingClientRect().height)}` : null,
            };
          });
        });
        log(`[mp-pollo] modifier options (esperado: padding 16px, border 2px, img 56x56, font-weight≥800):`);
        mods.forEach((m, i) => log(`  mod[${i}] ${m.tag} pad=${m.padding} border=${m.borderWidth} fw=${m.fontWeight} fs=${m.fontSize} ${m.w}x${m.h} img=${m.imgSize || 'no'}`));

        // Confirmar modificadores: buscar botón "Agregar al carrito" del modal (el más bajo)
        const confirmRes = await page.evaluate(() => {
          const buttons = Array.from(document.querySelectorAll('button'));
          const candidates = buttons.filter((b) => {
            const t = b.textContent.trim();
            return /agregar al carrito|añadir al carrito|confirmar|continuar|añadir|agregar/i.test(t) && b.offsetParent !== null;
          });
          if (candidates.length === 0) return { ok: false };
          // Tomar el ultimo (footer del modal)
          const target = candidates[candidates.length - 1];
          target.click();
          return { ok: true, text: target.textContent.trim().slice(0, 60) };
        });
        log(`[mp-pollo] click confirmar modal modifiers: ${JSON.stringify(confirmRes)}`);
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${OUT}/4-mp-pollo-added-modal-desktop.png`, fullPage: true });

        const footer = await page.evaluate(() => {
          const allBtns = Array.from(document.querySelectorAll('button, a')).filter((b) => b.offsetParent !== null);
          const irCarrito = allBtns.find((b) => /ir al carrito|pagar|finalizar/i.test(b.textContent));
          const seguir = allBtns.find((b) => /seguir comprando|agregar y seguir|continuar comprando/i.test(b.textContent));
          if (!irCarrito && !seguir) return { found: false, sample: allBtns.slice(0, 8).map((b) => b.textContent.trim().slice(0, 40)) };
          const ir = irCarrito?.getBoundingClientRect();
          const sg = seguir?.getBoundingClientRect();
          return {
            found: true,
            irText: irCarrito?.textContent.trim().slice(0, 80),
            seguirText: seguir?.textContent.trim().slice(0, 80),
            ir: ir ? { y: Math.round(ir.y), x: Math.round(ir.x), w: Math.round(ir.width) } : null,
            seguir: sg ? { y: Math.round(sg.y), x: Math.round(sg.x), w: Math.round(sg.width) } : null,
            stackedVertical: ir && sg ? Math.abs(ir.x - sg.x) < 30 && sg.y > ir.y : null,
          };
        });
        log(`[mp-pollo] modal "agregado al carrito" footer: ${JSON.stringify(footer).slice(0, 500)}`);
      } catch (e) {
        log(`[mp-pollo] error en flujo modificadores: ${e.message}`);
      }

      await page.setViewportSize({ width: 375, height: 800 });
      await page.waitForTimeout(800);
      await page.screenshot({ path: `${OUT}/4-mp-pollo-pdp-mobile.png`, fullPage: true });
    }
  }

  await ctx.close();
} catch (e) {
  log(`[mp-pollo] FATAL: ${e.message}`);
}

// ---------- 5. MARKETPLACE LOADER ----------
console.log("\n=== 5. MARKETPLACE / TIENDAS LOADER ===");
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => log(`[mp-loader][js-error] ${e.message}`));

  const client = await page.context().newCDPSession(page);
  await client.send("Network.enable");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (200 * 1024) / 8,
    uploadThroughput: (200 * 1024) / 8,
    latency: 400,
  });

  const navP = page.goto("http://localhost:3000/marketplace", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/5-mp-loader-marketplace-desktop.png` });
  await navP.catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/5-mp-marketplace-loaded-desktop.png` });

  await client.send("Network.emulateNetworkConditions", { offline: false, downloadThroughput: -1, uploadThroughput: -1, latency: 0 });
  await page.goto("about:blank");
  await client.send("Network.emulateNetworkConditions", {
    offline: false,
    downloadThroughput: (200 * 1024) / 8,
    uploadThroughput: (200 * 1024) / 8,
    latency: 400,
  });
  const tP = page.goto("http://localhost:3000/tiendas", { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);
  await page.screenshot({ path: `${OUT}/5-mp-loader-tiendas-desktop.png` });
  await tP.catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/5-mp-tiendas-loaded-desktop.png` });

  const loaderProbe = await page.evaluate(() => {
    const all = Array.from(document.querySelectorAll('img, svg'));
    const candidates = all.filter((el) => {
      const html = (el.outerHTML || '').slice(0, 250);
      const alt = el.getAttribute('alt') || '';
      const src = el.getAttribute('src') || '';
      return /paiche|loader|loading|spinner|wave|onda|fish|pez/i.test(html + alt + src);
    });
    return {
      hits: candidates.length,
      sample: candidates.slice(0, 4).map((c) => c.outerHTML.slice(0, 200)),
      hasSkeleton: !!document.querySelector('[class*="skeleton" i], [class*="Skeleton"]'),
    };
  });
  log(`[mp-loader] paiche/loader refs: ${loaderProbe.hits}, skeleton genérico: ${loaderProbe.hasSkeleton}`);
  loaderProbe.sample.forEach((s, i) => log(`  sample[${i}] ${s.slice(0, 160)}`));

  await ctx.close();
} catch (e) {
  log(`[mp-loader] FATAL: ${e.message}`);
}

writeFileSync(`${OUT}/audit-log.txt`, issues.join("\n"));
console.log(`\n=== DONE — ${issues.length} entradas en audit-log.txt ===`);

await browser.close();
