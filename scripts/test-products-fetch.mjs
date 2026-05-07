import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

console.log("=== Cargo /t/mi-pollo/tienda ===");
await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3000);

console.log("\n=== Inspecciono /api/products?active=true desde el navegador ===");
const productsInfo = await page.evaluate(async () => {
  const res = await fetch("/api/products?active=true", { cache: "no-store" });
  if (!res.ok) return { error: res.status };
  const data = await res.json();
  return {
    total: Array.isArray(data) ? data.length : 0,
    firstIds: Array.isArray(data) ? data.slice(0, 5).map(p => p.id) : [],
    has1252382: Array.isArray(data) ? data.some(p => p.id === 1252382) : false,
    has1252383: Array.isArray(data) ? data.some(p => p.id === 1252383) : false,
    tenantIds: Array.isArray(data) ? Array.from(new Set(data.slice(0, 30).map(p => p.tenantId))) : [],
  };
});
console.log("Resultado:", JSON.stringify(productsInfo, null, 2));

console.log("\n=== Probar endpoint check-exists con productId 1252382 ===");
const checkInfo = await page.evaluate(async () => {
  const res = await fetch("/api/marketplace/products/check-exists?ids=1252382&tenantSlug=mi-pollo");
  return res.ok ? await res.json() : { error: res.status };
});
console.log("Resultado:", checkInfo);

await browser.close();
