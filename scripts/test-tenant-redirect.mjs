import { chromium } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

console.log("=== Test: entrar a /t/mi-pollo/tienda SIN admin (sin cookies) ===\n");
const resp = await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "domcontentloaded", timeout: 20000 });
console.log("HTTP:", resp?.status());
console.log("URL final (no debe redirigir):", page.url());
await page.waitForTimeout(2500);

const info = await page.evaluate(() => {
  // Leer todas las localStorage keys que tocan tenant
  const keys = Object.keys(localStorage);
  const customerKeys = keys.filter(k => k.includes("customer") || k.includes("tenant"));
  const result = {};
  for (const k of customerKeys) result[k] = localStorage.getItem(k);
  return {
    pathname: window.location.pathname,
    customerStorageKeys: customerKeys,
    customerKeyValues: result,
  };
});
console.log("\nLocalStorage post-load:");
console.log("  pathname:", info.pathname);
console.log("  keys:", info.customerStorageKeys);

console.log("\n=== Fix verificación ===");
const correctTenant = info.pathname.includes("/t/mi-pollo/");
const usingMainKey = info.customerStorageKeys.some(k => k.includes("buleje-main-"));
const usingMiPolloKey = info.customerStorageKeys.some(k => k.includes("buleje-mi-pollo-"));

if (correctTenant) {
  console.log("✅ URL: en /t/mi-pollo/tienda (no redirigió a main)");
}
if (usingMainKey && !usingMiPolloKey) {
  console.log("❌ FAIL: storage usa buleje-main-* (bug NO arreglado)");
} else {
  console.log("✅ Storage NO contaminado con buleje-main-*");
}

await browser.close();
