// One-shot: siembra cart + customer + address y screenshot de /checkout/confirmar,
// abriendo el campo de cupón nuevo (feature: cupón editable en confirmar).
import { chromium } from "playwright";
import path from "node:path";

const BASE = "http://localhost:3000";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");
const out = process.argv[2] || "/tmp/checkout-confirmar.png";
const dark = process.argv.includes("--dark");
const urlArg = process.argv.find((a) => a.startsWith("--url="));
const targetPath = urlArg ? urlArg.split("=")[1] : "/checkout/confirmar";
const couponArg = process.argv.find((a) => a.startsWith("--coupon-text="));
const couponText = couponArg ? couponArg.split("=")[1] : "¿Tienes un cupón? Agrégalo";

const CART = {
  items: [{
    storeId: "demo", storeName: "Bodega Demo", storeSlug: "mi-pollo",
    storeProductId: "demo-1", productId: 999999, name: "Arroz Costeño 5kg",
    price: 2490, quantity: 2, image: null, unit: "und", basePrice: 2490, stock: null,
  }],
};
const CUSTOMER = { name: "María Pérez", phone: "987654321", email: "" };
const ADDRESS = {
  address: "Jr. Los Cedros 123", notes: "Casa azul, portón negro",
  departmentName: "Pasco", provinceName: "Oxapampa", districtName: "Ciudad Constitución",
  departmentCode: "", provinceCode: "", districtCode: "", zone: "",
};

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
try {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 1300 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/marketplace`, { waitUntil: "domcontentloaded", timeout: 25000 });
  await page.evaluate(({ cart, customer, address }) => {
    try {
      localStorage.setItem("marketplace-cart", JSON.stringify(cart));
      localStorage.setItem("marketplace-checkout-customer", JSON.stringify(customer));
      localStorage.setItem("marketplace-checkout-address", JSON.stringify(address));
    } catch {}
  }, { cart: CART, customer: CUSTOMER, address: ADDRESS });
  if (dark) await page.evaluate(() => { document.documentElement.classList.add("dark"); try { localStorage.setItem("theme", "dark"); } catch {} });
  try {
    await page.goto(`${BASE}${targetPath}`, { waitUntil: "commit", timeout: 30000 });
  } catch (e) {
    console.error("goto abort (esperado si hubo redirect):", String(e).slice(0, 80));
  }
  if (dark) await page.evaluate(() => document.documentElement.classList.add("dark"));
  try { await page.waitForLoadState("networkidle", { timeout: 8000 }); } catch {}
  await page.waitForTimeout(2500);
  console.error("URL final:", page.url());
  // Abrir el campo de cupón nuevo
  try {
    const btn = page.getByText(couponText, { exact: false });
    await btn.click({ timeout: 4000 });
    await page.waitForTimeout(800);
  } catch (e) {
    console.error("no se pudo abrir cupón:", String(e).slice(0, 120));
  }
  await page.screenshot({ path: out, fullPage: true });
  console.log(JSON.stringify({ ok: true, url: page.url(), title: await page.title(), out }));
} finally {
  await browser.close();
}
