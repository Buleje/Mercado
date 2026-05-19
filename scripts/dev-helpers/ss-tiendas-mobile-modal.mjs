import { chromium, devices } from "playwright";
import { mkdirSync } from "node:fs";

const OUT = process.env.OUT || "reports/visual-verify/tiendas-mobile";
const LABEL = process.env.LABEL || "modal";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({
  ...devices["iPhone 14 Pro"],
  isMobile: true,
  hasTouch: true,
});
const page = await ctx.newPage();
await page.goto(`http://localhost:3000/tiendas?_t=${Date.now()}`, { waitUntil: "load", timeout: 60000 });
await page.waitForTimeout(5000);

await page.waitForTimeout(1500);

// El boton "Filtros" mobile vive en el toolbar (scroll-x). Lo abrimos via evaluate
// para evitar problemas de scrollIntoView con contenedores horizontales.
await page.evaluate(() => {
  const btns = Array.from(document.querySelectorAll('button[aria-label="Filtros"]'));
  // Tomamos el visible (el de mobile)
  const visible = btns.find((b) => {
    const rect = b.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  });
  if (visible) visible.click();
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/${LABEL}-open.png`, fullPage: false });
console.log("OK modal-open");

// Scroll the sheet content to see Zona section if hidden
await page.evaluate(() => {
  const sheet = document.querySelector('[role="dialog"] .overflow-y-auto');
  if (sheet) sheet.scrollTo({ top: 0, behavior: "instant" });
});
await page.waitForTimeout(300);
await page.screenshot({ path: `${OUT}/${LABEL}-zona.png`, fullPage: false });
console.log("OK modal-zona");

// Cerrar modal click en backdrop
await page.evaluate(() => {
  const closeBtn = document.querySelector('[role="dialog"] button[aria-label="Cerrar filtros"], [role="dialog"] button[aria-label="Cerrar"]');
  if (closeBtn) closeBtn.click();
});
await page.waitForTimeout(600);

// Scrollear hasta pasar la seccion de subcategorias
await page.evaluate(() => window.scrollTo({ top: 1400, behavior: "instant" }));
await page.waitForTimeout(700);
await page.screenshot({ path: `${OUT}/${LABEL}-sticky.png`, fullPage: false });
console.log("OK sticky-bar");

// Click en una subcategoria del sticky para verificar interactividad
await page.evaluate(() => {
  const grp = document.querySelector('[aria-label="Filtrar por subcategoría (sticky)"]');
  if (grp) {
    const btns = grp.querySelectorAll('button');
    if (btns.length > 1) btns[1].click();
  }
});
await page.waitForTimeout(800);
await page.screenshot({ path: `${OUT}/${LABEL}-sticky-active.png`, fullPage: false });
console.log("OK sticky-active");

await browser.close();
