import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

mkdirSync("reports/i18n-audit", { recursive: true });

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await ctx.newPage();

// dismiss welcome modal
await page.addInitScript(() => {
  localStorage.setItem("first-visit-coupon-shown", "true");
});

const visitAndAudit = async (locale) => {
  // Pre-set locale in localStorage so it loads with that
  await page.addInitScript((loc) => {
    localStorage.setItem("buleje-locale", loc);
  }, locale);
  await page.goto("http://localhost:3000/#como-funciona", { waitUntil: "networkidle", timeout: 45000 });
  await page.waitForTimeout(2000);
  // Click the language switcher to FORCE the change (in case localStorage init didn't apply)
  if (locale !== "es") {
    await page.evaluate((targetLocale) => {
      const btns = document.querySelectorAll('button[aria-label*="idioma" i], button[aria-haspopup="listbox"]');
      const trigger = Array.from(btns).find((b) => /ES|EN|SHI|QU/i.test((b).textContent || ''));
      if (trigger) (trigger).click();
    }, locale);
    await page.waitForTimeout(700);
    await page.evaluate((targetLocale) => {
      const opts = document.querySelectorAll('[role="option"]');
      const labelMap = { en: "English", qu: "Runa Simi", shi: "Shipibo-Konibo" };
      const target = labelMap[targetLocale];
      const found = Array.from(opts).find((o) => (o).textContent?.includes(target));
      if (found) (found).click();
    }, locale);
  }
  await page.waitForTimeout(8000); // wait for AutoTranslator + API
  await page.screenshot({ path: `reports/i18n-audit/${locale}-fullpage.png`, fullPage: true });
  // Also viewport snapshots
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `reports/i18n-audit/${locale}-1-top.png` });
  await page.evaluate(() => {
    const el = document.querySelector('[id="como-funciona"]');
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `reports/i18n-audit/${locale}-2-como-funciona.png` });
  await page.evaluate(() => {
    const el = document.querySelector('[id="planes"]');
    if (el) el.scrollIntoView({ behavior: "instant", block: "start" });
  });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `reports/i18n-audit/${locale}-3-planes.png` });
  // Sample remaining spanish words detected after translation
  const sample = await page.evaluate(() => {
    const SP_HINTS = ["Cómo", "Más", "Pagás", "tu", "Probá", "negocio", "Empezar", "Tienda", "tienda", "Pedí", "Comprá"];
    const found = [];
    document.querySelectorAll("h1, h2, h3, p, button, a, span, li").forEach((el) => {
      const txt = (el.textContent || "").trim();
      if (txt.length < 1 || txt.length > 200) return;
      for (const hint of SP_HINTS) {
        if (txt.includes(hint)) {
          found.push(txt.slice(0, 80));
          break;
        }
      }
    });
    return Array.from(new Set(found)).slice(0, 25);
  });
  console.log(`[${locale}] still spanish:`);
  sample.forEach((s) => console.log("  -", s));
};

for (const loc of ["es", "en", "qu"]) {
  await ctx.clearCookies();
  await visitAndAudit(loc);
}

await browser.close();
console.log("OK");
