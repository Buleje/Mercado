import { chromium } from "playwright";
const cookieStr = process.env.BSM_COOKIE || "";
const cookies = cookieStr.split(";").map(s => s.trim()).filter(Boolean).map(c => {
  const [name, ...rest] = c.split("=");
  return { name: name.trim(), value: rest.join("=").trim(), domain: "localhost", path: "/" };
});

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies(cookies);

// SIMULAR el bug: pre-poblar localStorage con productId 1252383 (que existe en main, no en mi-pollo)
await ctx.addInitScript(() => {
  try {
    const fakeCart = JSON.stringify([{
      id: 1252383,
      name: "Azúcar Rubia (carrito viejo de main)",
      price: 4.8,
      quantity: 1,
      unit: "bolsa",
      category: "Abarrotes",
      image: "",
      addedAt: Date.now()
    }]);
    localStorage.setItem("buleje-mi-pollo-cart", fakeCart);
    console.log("[TEST] Pre-poblado carrito mi-pollo con productId 1252383 (debería quedar vacío post-fix)");
  } catch (e) { console.log("[TEST] error:", e.message); }
});

const page = await ctx.newPage();
const consoleMessages = [];
page.on("console", m => consoleMessages.push(`[${m.type()}] ${m.text().slice(0,180)}`));

// Navegar al storefront tenant-scoped
await page.goto("http://localhost:3000/t/mi-pollo/tienda", { waitUntil: "domcontentloaded", timeout: 20000 });
await page.waitForTimeout(3500); // Esperar hidratación + check-exists

// Leer el carrito DESPUÉS de hidratación
const cartAfter = await page.evaluate(() => {
  try { return localStorage.getItem("buleje-mi-pollo-cart"); }
  catch { return null; }
});

console.log("\n=== RESULTADO ===");
console.log("Carrito ANTES (set por initScript): productId 1252383 (de main)");
console.log("Carrito DESPUÉS:", cartAfter);

if (cartAfter === "[]" || cartAfter === null) {
  console.log("\n✅ PASS: el carrito se limpió correctamente — producto fantasma de main fue removido en mi-pollo");
} else {
  const parsed = JSON.parse(cartAfter || "[]");
  if (parsed.some(i => i.id === 1252383)) {
    console.log("\n❌ FAIL: el productId 1252383 sigue en el carrito");
  } else {
    console.log("\n✅ PASS: 1252383 fue removido (otros items del carrito quedaron OK)");
  }
}

console.log("\n=== CONSOLE LOGS ===");
consoleMessages.slice(0, 5).forEach(m => console.log(m));

await browser.close();
