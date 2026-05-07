/**
 * Debug: capture admin dashboard ONCE para ver qué tokens aplica realmente.
 * Pre-condición: preset bodega-calida ya activo (verificado por curl).
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = "reports/design-system";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

// Preset tenant slug
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  localStorage.setItem("active-tenant", "main");
});

// Login admin
await page.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(500);
await page.locator("#username").first().pressSequentially("qaadmin", { delay: 30 });
await page.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 30 });
await page.waitForTimeout(400);
await page.locator("#password").first().press("Enter");
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(2500);
console.log("Post-login URL:", page.url());

// Verificar respuesta del endpoint active desde el browser
const activeResp = await page.evaluate(async () => {
  const r = await fetch("/api/design-system/active?tenantId=main", { cache: "no-store" });
  return await r.json();
});
console.log("active endpoint response:", JSON.stringify({
  source: activeResp.source,
  slug: activeResp.tokens?.meta?.slug,
  accent: activeResp.tokens?.colors?.accent,
}));

// Cerrar onboarding modal
await page.evaluate(() => {
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
});

// Navegar al dashboard
await page.goto("http://localhost:3000/admin?tab=vendor-dashboard&_t=" + Date.now(), { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(4500);

// Capturar valores de CSS vars aplicados al wrapper [data-design-preset]
const cssVars = await page.evaluate(() => {
  const el = document.querySelector("[data-design-preset]");
  if (!el) return { error: "wrapper not found", html: document.body.innerHTML.slice(0, 200) };
  const cs = getComputedStyle(el);
  return {
    presetSlug: el.getAttribute("data-design-preset"),
    accent: cs.getPropertyValue("--accent").trim(),
    accentSoft: cs.getPropertyValue("--accent-soft").trim(),
    surfaceRaised: cs.getPropertyValue("--surface-raised").trim(),
    fontHeading: cs.getPropertyValue("--font-heading").trim().slice(0, 60),
    radiusLg: cs.getPropertyValue("--radius-lg").trim(),
    btnHeight: cs.getPropertyValue("--btn-height").trim(),
  };
});
console.log("CSS vars aplicadas al wrapper:", JSON.stringify(cssVars, null, 2));

// Verificar el botón "Inicio" del sidebar exactamente
const sidebarDebug = await page.evaluate(() => {
  // Buscar el item active en sidebar
  const items = Array.from(document.querySelectorAll("button, a")).filter(
    (el) => el.textContent?.trim().startsWith("Inicio") && el.offsetWidth < 250,
  );
  if (items.length === 0) return { error: "no Inicio found" };
  const el = items[0];
  const cs = getComputedStyle(el);
  // Ascender el árbol viendo en cada padre el --accent
  const chain = [];
  let cur = el;
  while (cur && chain.length < 8) {
    const ccs = getComputedStyle(cur);
    chain.push({
      tag: cur.tagName,
      cls: (cur.className || "").toString().slice(0, 50),
      accent: ccs.getPropertyValue("--accent").trim(),
      hasInline: cur.style.cssText.length > 0 ? cur.style.cssText.slice(0, 80) : null,
    });
    cur = cur.parentElement;
  }
  return {
    element: { bg: cs.backgroundColor, color: cs.color, accent: cs.getPropertyValue("--accent").trim() },
    chain,
  };
});
console.log("Sidebar Inicio chain:", JSON.stringify(sidebarDebug, null, 2));

// Verificar componentes específicos del sidebar y main
const debugDOM = await page.evaluate(() => {
  const wrapper = document.querySelector("[data-design-preset]");
  if (!wrapper) return { error: "no wrapper" };
  const isDark = document.documentElement.classList.contains("dark");

  const checkEl = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const cs = getComputedStyle(el);
    return {
      bg: cs.backgroundColor,
      color: cs.color,
      borderColor: cs.borderColor,
      accent: cs.getPropertyValue("--accent").trim(),
    };
  };

  return {
    isDark,
    rootAccent: getComputedStyle(document.documentElement).getPropertyValue("--accent").trim(),
    wrapperAccent: getComputedStyle(wrapper).getPropertyValue("--accent").trim(),
    sidebarItemActive: checkEl('[class*="bg-\\[var\\(--accent\\)\\]\\/10"]'),
    h1: checkEl('h1'),
    primaryButton: checkEl('button[type="submit"], button[class*="--accent"]'),
    bodyComputedAccent: checkEl('body'),
  };
});
console.log("DOM check:", JSON.stringify(debugDOM, null, 2));

// Inspeccionar el aside DESKTOP (md:flex)
const sidebarAside = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("aside"));
  const visible = all.find((a) => {
    const r = a.getBoundingClientRect();
    return r.left >= 0 && r.left < 50 && r.width > 100 && r.height > 400;
  });
  if (!visible) return { error: "no visible aside", count: all.length };
  const cs = getComputedStyle(visible);
  return {
    cls: visible.className,
    bgFull: cs.backgroundImage,
    bgColor: cs.backgroundColor,
    inlineStyle: visible.style.cssText.slice(0, 200),
  };
});
console.log("Aside desktop:", JSON.stringify(sidebarAside, null, 2));
console.log("Left sidebar elements:", JSON.stringify(sidebarColumn, null, 2));

await page.screenshot({ path: `${OUT}/debug-admin-current.png`, fullPage: false });
console.log("Screenshot saved");

await browser.close();
