// Atribución de CLS: captura cada layout-shift con el nodo culpable (tag+clase)
// para saber QUÉ se mueve antes de fixear. Uso: node scripts/dev-helpers/cls-attribution.mjs /chat
import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const path = process.argv[2] ?? "/chat";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await ctx.newPage();
await page.addInitScript(() => {
  window.__shifts = [];
  new PerformanceObserver((l) => {
    for (const e of l.getEntries()) {
      if (e.hadRecentInput) continue;
      const srcs = (e.sources ?? []).map((s) => {
        const n = s.node;
        if (!n) return "(no node)";
        const tag = n.tagName?.toLowerCase() ?? n.nodeName;
        const cls = (n.className?.baseVal ?? n.className ?? "").toString().slice(0, 80);
        const prev = s.previousRect, cur = s.currentRect;
        const dy = cur && prev ? Math.round(cur.top - prev.top) : 0;
        return `${tag}.${cls} Δy=${dy}`;
      });
      window.__shifts.push({ value: +e.value.toFixed(4), at: Math.round(e.startTime), srcs });
    }
  }).observe({ type: "layout-shift", buffered: true });
});

await page.goto(`${BASE}${path}`, { waitUntil: "networkidle", timeout: 35000 });
await page.waitForTimeout(2500);
const shifts = await page.evaluate(() => window.__shifts);
await browser.close();

const total = shifts.reduce((a, s) => a + s.value, 0);
console.log(`\nCLS total ${path}: ${total.toFixed(4)}  (${shifts.length} shifts)\n`);
for (const s of shifts.sort((a, b) => b.value - a.value).slice(0, 8)) {
  console.log(`  ${String(s.value).padStart(7)}  @${s.at}ms`);
  for (const src of s.srcs) console.log(`      └ ${src}`);
}
