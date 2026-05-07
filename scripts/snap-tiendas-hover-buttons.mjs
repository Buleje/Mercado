import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/tiendas", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

// Hover sobre Ingresar / Buscar / botones de filtros y capturar
const targets = ["Ingresar", "Buscar", "Tiendas", "Restaurantes", "Bodegas", "Polleria", "Sumate gratis", "Quiero ser repartidor"];
for (const t of targets) {
  try {
    const btn = page.locator(`button:has-text("${t}"), a:has-text("${t}")`).first();
    await btn.hover({ timeout: 3000 });
    await page.waitForTimeout(400);
    const styles = await btn.evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        bg: cs.backgroundColor,
        color: cs.color,
        border: cs.borderColor,
      };
    });
    console.log(`HOVER ${t.padEnd(25)} → bg=${styles.bg} color=${styles.color}`);
  } catch (e) {
    console.log(`SKIP ${t}: not found`);
  }
}

// Mover el mouse fuera y capturar el hero buttons
await page.mouse.move(0, 0);
await page.waitForTimeout(500);
await page.screenshot({ path: "reports/design-system/tiendas-hero.png", fullPage: false, clip: { x: 0, y: 0, width: 1440, height: 700 } });

await browser.close();
