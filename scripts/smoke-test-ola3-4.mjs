import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";

const BASE = "http://localhost:3000";
const OUT = "reports/smoke-test/2026-04-18-ola3-4";

const ROUTES = [
  { name: "01-home", url: "/" },
  { name: "02-marketplace", url: "/marketplace" },
  { name: "03-descubri", url: "/descubri" },
  { name: "04-cuenta", url: "/cuenta" },
  { name: "05-comparar", url: "/marketplace/comparar" },
  { name: "06-gift-cards-hub", url: "/marketplace/gift-cards" },
  { name: "07-gift-cards-comprar", url: "/marketplace/gift-cards/comprar" },
  { name: "08-en-vivo", url: "/marketplace/en-vivo" },
  { name: "09-ofertas", url: "/marketplace/ofertas" },
  { name: "10-vender", url: "/vender" },
  { name: "11-vender-registro", url: "/vender/registro" },
  { name: "12-socio-buleje", url: "/socio-buleje" },
  { name: "13-asistente", url: "/asistente" },
  { name: "14-cuenta-gift-cards", url: "/cuenta/gift-cards" },
  { name: "15-cuenta-cupones", url: "/cuenta/cupones" },
  { name: "16-cuenta-suscripciones", url: "/cuenta/suscripciones" },
  { name: "17-cuenta-socio", url: "/cuenta/socio-buleje" },
];

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  const results = [];

  for (const route of ROUTES) {
    const start = Date.now();
    const errors = [];
    page.removeAllListeners("pageerror");
    page.on("pageerror", (e) => errors.push(String(e.message).slice(0, 120)));

    try {
      const resp = await page.goto(`${BASE}${route.url}`, {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });
      await page.waitForTimeout(1500);
      await page.screenshot({
        path: `${OUT}/${route.name}.png`,
        fullPage: false,
      });
      const ms = Date.now() - start;
      results.push({
        name: route.name,
        url: route.url,
        status: resp?.status() ?? 0,
        ms,
        errors: errors.length,
        errorSamples: errors.slice(0, 2),
      });
      console.log(`[${resp?.status()}] ${route.url} — ${ms}ms — ${errors.length} errors`);
    } catch (e) {
      results.push({
        name: route.name,
        url: route.url,
        status: 0,
        error: String(e.message).slice(0, 100),
      });
      console.log(`[ERR] ${route.url} — ${String(e.message).slice(0, 80)}`);
    }
  }

  await writeFile(`${OUT}/results.json`, JSON.stringify(results, null, 2));
  await browser.close();

  const ok = results.filter((r) => r.status === 200).length;
  const fail = results.length - ok;
  console.log(`\nOK ${ok}/${results.length}${fail ? ` · ${fail} fallas` : ""}`);
  console.log(`Screenshots: ${OUT}/`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
