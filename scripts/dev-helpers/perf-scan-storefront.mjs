// Perf scan del storefront (DEV :3000). Captura señales PROD-VÁLIDAS aunque
// dev infle el JS absoluto: nº de requests, payloads de /api/ (over-fetch),
// CLS (no se infla), waterfall de API. Uso: node scripts/dev-helpers/perf-scan-storefront.mjs
import { chromium } from "playwright";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const PAGES = [
  ["inicio", "/"],
  ["tiendas", "/tiendas"],
  ["marketplace", "/marketplace"],
  ["ofertas", "/marketplace/ofertas"],
  ["chat", "/chat"],
  ["abrir-tienda", "/abrir-tienda"],
  ...(process.env.PDP_URL ? [["pdp", process.env.PDP_URL]] : []),
];

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const rows = [];
for (const [label, path] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  // Recolectar respuestas de API con su tamaño real (payload de datos = prod-válido)
  const api = [];
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("/api/")) return;
    let bytes = 0;
    try {
      const buf = await res.body();
      bytes = buf.length;
    } catch {
      /* respuesta sin body accesible (redirect, 204) */
    }
    api.push({ url: url.replace(BASE, ""), status: res.status(), bytes });
  });
  await page.addInitScript(() => {
    window.__cls = 0;
    new PerformanceObserver((l) => {
      for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
    }).observe({ type: "layout-shift", buffered: true });
  });

  const t0 = Date.now();
  let httpStatus = 0;
  try {
    const resp = await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 35000 });
    httpStatus = resp?.status() ?? 0;
  } catch (err) {
    rows.push({ label, path, error: String(err).slice(0, 80) });
    await ctx.close();
    continue;
  }
  const wall = Date.now() - t0;
  await page.waitForTimeout(2500);

  const m = await page.evaluate(() => {
    const nav = performance.getEntriesByType("navigation")[0];
    const fcp = performance.getEntriesByName("first-contentful-paint")[0];
    const res = performance.getEntriesByType("resource");
    let js = 0, css = 0, img = 0;
    for (const r of res) {
      const s = r.encodedBodySize || r.transferSize || 0;
      if (/\.css/.test(r.name)) css += s;
      else if (/\.(png|jpg|jpeg|webp|gif|svg|avif)/.test(r.name)) img += s;
      else if (/\.js|_next\/static\/chunks/.test(r.name)) js += s;
    }
    return {
      ttfb: nav ? Math.round(nav.responseStart - nav.requestStart) : 0,
      domLoaded: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : 0,
      fcp: fcp ? Math.round(fcp.startTime) : 0,
      cls: +(window.__cls ?? 0).toFixed(4),
      resCount: res.length,
      jsKB: Math.round(js / 1024),
      cssKB: Math.round(css / 1024),
      imgKB: Math.round(img / 1024),
    };
  });

  const apiTotal = api.reduce((a, r) => a + r.bytes, 0);
  const topApi = [...api].sort((a, b) => b.bytes - a.bytes).slice(0, 3);
  rows.push({ label, path, httpStatus, wall, ...m, apiCount: api.length, apiKB: Math.round(apiTotal / 1024), topApi });
  await ctx.close();
}
await browser.close();

console.log("\n════════ PERF SCAN STOREFRONT (DEV :3000 — JS KB inflado ~3-5×, el resto prod-válido) ════════\n");
for (const r of rows) {
  if (r.error) { console.log(`${r.label.padEnd(13)} ERROR ${r.error}`); continue; }
  console.log(
    `${r.label.padEnd(13)} HTTP ${r.httpStatus}  wall ${String(r.wall).padStart(5)}ms  FCP ${String(r.fcp).padStart(5)}ms  CLS ${String(r.cls).padStart(6)}  DOM ${String(r.domLoaded).padStart(5)}ms  ` +
    `res ${String(r.resCount).padStart(3)}  JS ${String(r.jsKB).padStart(4)}KB  IMG ${String(r.imgKB).padStart(4)}KB  ││  API: ${r.apiCount} reqs ${r.apiKB}KB`
  );
  for (const a of r.topApi) {
    if (a.bytes > 8000) console.log(`                └─ ⚠ ${(a.bytes/1024).toFixed(0)}KB  ${a.status}  ${a.url.slice(0, 70)}`);
  }
}
console.log("");
