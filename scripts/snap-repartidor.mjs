import { chromium } from "playwright";
import { mkdirSync } from "node:fs";
const OUT = "reports/delivery-redesign";
mkdirSync(OUT, { recursive: true });

const ROUTES = [
  { name: "rep-wizard-1", url: "http://localhost:3000/marketplace/repartidor", interact: "step1" },
  { name: "rep-wizard-2", url: "http://localhost:3000/marketplace/repartidor", interact: "step2" },
  { name: "rep-wizard-3", url: "http://localhost:3000/marketplace/repartidor", interact: "step3" },
  { name: "rep-wizard-4", url: "http://localhost:3000/marketplace/repartidor", interact: "step4" },
  { name: "rep-bienvenida", url: "http://localhost:3000/marketplace/repartidor/bienvenida" },
];

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 },
  { name: "desktop", width: 1440, height: 900 },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    storageState: {
      cookies: [],
      origins: [
        {
          origin: "http://localhost:3000",
          localStorage: [
            { name: "browser-tour-completed", value: "1" },
            { name: "buleje-tour-seen", value: "1" },
            { name: "marketplace-tour-completed", value: "1" },
          ],
        },
      ],
    },
  });
  const page = await ctx.newPage();
  for (const r of ROUTES) {
    try {
      await page.goto(r.url, { waitUntil: "networkidle", timeout: 30000 });
      await page.evaluate(() => {
        document.querySelectorAll('[data-tour-overlay], [role="dialog"]').forEach((el) => {
          el.style.display = "none";
        });
      });
      await page.waitForTimeout(1200);

      // Interacción: avanzar el wizard llenando datos
      if (["step2", "step3", "step4"].includes(r.interact)) {
        await page.fill('#rep-name', "Carlos Pérez Vargas").catch(() => {});
        await page.fill('#rep-dni', "12345678").catch(() => {});
        await page.fill('#rep-birth', "1995-06-15").catch(() => {});
        await page.fill('#rep-phone', "999111222").catch(() => {});
        await page.click('button:has-text("Siguiente")').catch(() => {});
        await page.waitForTimeout(800);
      }
      if (["step3", "step4"].includes(r.interact)) {
        // Step 2: pick bicicleta (no kyc) + cualquier zona + mañanas
        await page.click('button[aria-pressed]:has-text("Bicicleta")').catch(() => {});
        await page.waitForTimeout(300);
        await page.click('button:has-text("Cualquier zona de Pucallpa")').catch(() => {});
        await page.click('button:has-text("Mañanas")').catch(() => {});
        await page.click('button:has-text("Siguiente")').catch(() => {});
        await page.waitForTimeout(800);
      }
      if (r.interact === "step4") {
        // Step 3: bicicleta no requiere docs → directo siguiente
        await page.click('button:has-text("Siguiente")').catch(() => {});
        await page.waitForTimeout(800);
      }

      await page.screenshot({ path: `${OUT}/${r.name}-${vp.name}.png`, fullPage: false });
      await page.screenshot({ path: `${OUT}/${r.name}-${vp.name}-full.png`, fullPage: true });
      console.log(`OK ${r.name} ${vp.name}`);
    } catch (e) {
      console.log(`FAIL ${r.name} ${vp.name}: ${e.message}`);
    }
  }
  await ctx.close();
}
await browser.close();
