import { chromium } from "playwright";
const out = "reports/landing-redesign";
import fs from "fs"; fs.mkdirSync(out, { recursive: true });
const b = await chromium.launch({ executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome", headless: true });
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const p = await ctx.newPage();
await p.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 30000 });
await p.waitForTimeout(4000);
await p.screenshot({ path: `${out}/home-desktop-light.png`, fullPage: false });
console.log("✓", `${out}/home-desktop-light.png`);
// Scroll a sección "Sumate a Buleje" (PromoBanners) y capturar viewport
const promoTop = await p.evaluate(() => {
  const el = document.querySelector('section[aria-label="Sumate a Buleje"]');
  return el ? el.getBoundingClientRect().top + window.scrollY : null;
});
if (promoTop != null) {
  await p.evaluate((y) => window.scrollTo({ top: y - 50, behavior: "instant" }), promoTop);
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}/home-promobanners.png`, fullPage: false });
  console.log("✓", `${out}/home-promobanners.png`);
}
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p2 = await ctx2.newPage();
await p2.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 30000 });
await p2.waitForTimeout(4000);
await p2.screenshot({ path: `${out}/home-mobile-light.png`, fullPage: false });
console.log("✓", `${out}/home-mobile-light.png`);
// /abrir-tienda full
const ctxAt = await b.newContext({ viewport: { width: 1440, height: 900 } });
const pAt = await ctxAt.newPage();
await pAt.goto("http://localhost:3000/abrir-tienda", { waitUntil: "networkidle", timeout: 30000 });
await pAt.waitForTimeout(4000);
await pAt.screenshot({ path: `${out}/abrir-tienda-hero.png`, fullPage: false });
console.log("✓", `${out}/abrir-tienda-hero.png`);
// Scroll a ROI
const roiTop = await pAt.evaluate(() => {
  const el = Array.from(document.querySelectorAll("section")).find((s) => s.textContent?.includes("Calculá tu ganancia"));
  return el ? el.getBoundingClientRect().top + window.scrollY : null;
});
if (roiTop != null) {
  await pAt.evaluate((y) => window.scrollTo({ top: y - 30, behavior: "instant" }), roiTop);
  await pAt.waitForTimeout(1200);
  await pAt.screenshot({ path: `${out}/abrir-tienda-roi.png`, fullPage: false });
  console.log("✓", `${out}/abrir-tienda-roi.png`);
}
// Scroll a benefits
const benTop = await pAt.evaluate(() => {
  const el = Array.from(document.querySelectorAll("section")).find((s) => s.textContent?.includes("Cuatro músculos"));
  return el ? el.getBoundingClientRect().top + window.scrollY : null;
});
if (benTop != null) {
  await pAt.evaluate((y) => window.scrollTo({ top: y - 30, behavior: "instant" }), benTop);
  await pAt.waitForTimeout(1200);
  await pAt.screenshot({ path: `${out}/abrir-tienda-benefits.png`, fullPage: false });
  console.log("✓", `${out}/abrir-tienda-benefits.png`);
}
// Scroll a planes
const planTop = await pAt.evaluate(() => {
  const el = document.getElementById("planes");
  return el ? el.getBoundingClientRect().top + window.scrollY : null;
});
if (planTop != null) {
  await pAt.evaluate((y) => window.scrollTo({ top: y - 30, behavior: "instant" }), planTop);
  await pAt.waitForTimeout(1200);
  await pAt.screenshot({ path: `${out}/abrir-tienda-plans.png`, fullPage: false });
  console.log("✓", `${out}/abrir-tienda-plans.png`);
}

// Dark mode desktop
const ctx3 = await b.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: "dark" });
const p3 = await ctx3.newPage();
await p3.goto("http://localhost:3000/", { waitUntil: "networkidle", timeout: 30000 });
await p3.waitForTimeout(4000);
await p3.screenshot({ path: `${out}/home-desktop-dark.png`, fullPage: false });
console.log("✓", `${out}/home-desktop-dark.png`);
await b.close();
