/**
 * Verifica que el bug "negative time stamp" del runtime turbopack RSC ya no
 * aparezca en la consola al cargar un StoreDetailPage.
 */
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

const errors = [];
page.on("pageerror", (err) => errors.push({ kind: "pageerror", msg: err.message }));
page.on("console", (msg) => {
  if (msg.type() === "error" && msg.text().includes("negative time stamp")) {
    errors.push({ kind: "console", msg: msg.text() });
  }
});

// Necesitamos descubrir un slug real de tienda. Intentamos /marketplace primero.
console.log("→ /marketplace");
await page.goto("http://localhost:3000/marketplace", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(1500);

// Buscamos un link a alguna tienda
const storeLink = await page.evaluate(() => {
  const a = document.querySelector('a[href^="/marketplace/"]');
  return a ? a.getAttribute("href") : null;
});
console.log(`  store link encontrado: ${storeLink}`);

// Forzamos también un store slug específico que aparece en logs como StoreDetailPage
const candidateSlugs = ["main", "bodega-san-martin", "demo"];
for (const slug of candidateSlugs) {
  const url = `http://localhost:3000/marketplace/${slug}`;
  console.log(`→ ${url}`);
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 20000 });
    await page.waitForTimeout(1500);
  } catch {}
}

if (storeLink && storeLink.startsWith("/marketplace/") && !storeLink.includes("/repartidor")) {
  console.log(`→ ${storeLink}`);
  await page.goto(`http://localhost:3000${storeLink}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2500);

  // Navegar de vuelta y otra vez para reproducir el error
  await page.goto("http://localhost:3000/marketplace", { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(800);
  await page.goto(`http://localhost:3000${storeLink}`, { waitUntil: "networkidle", timeout: 30000 });
  await page.waitForTimeout(2500);
}

console.log(`\n--- Errores 'negative time stamp': ${errors.length} ---`);
errors.slice(0, 5).forEach((e) => console.log(`  [${e.kind}] ${e.msg.slice(0, 200)}`));

await ctx.close();
await browser.close();

if (errors.length === 0) {
  console.log("\n✓ ✓ ✓ PASS — patch aplicado, sin error");
} else {
  console.log("\n✗ FAIL — el patch no silenció el error");
  process.exit(1);
}
