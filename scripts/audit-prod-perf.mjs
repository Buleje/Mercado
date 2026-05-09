import { chromium } from "playwright";
import { writeFileSync } from "fs";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 375, height: 812 } });
const page = await ctx.newPage();

// Inject observers ANTES del navigate
await page.addInitScript(() => {
  window.__perf = { lcp: 0, cls: 0, fcp: 0 };
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__perf.lcp = e.startTime;
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (!e.hadRecentInput) window.__perf.cls += e.value;
    }
  }).observe({ type: "layout-shift", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.name === "first-contentful-paint") window.__perf.fcp = e.startTime;
    }
  }).observe({ type: "paint", buffered: true });
});

const start = Date.now();
const response = await page.goto("http://localhost:3001/marketplace", { waitUntil: "networkidle", timeout: 30000 });
const ttfb = Date.now() - start;
await page.waitForTimeout(4000);

// Web Vitals from Performance API
const metrics = await page.evaluate(() => {
  return new Promise((resolve) => {
    const result = {
      lcp: window.__perf?.lcp ?? 0,
      fcp: window.__perf?.fcp ?? 0,
      cls: window.__perf?.cls ?? 0,
      tbt: 0,
      navTiming: {},
    };
    // FCP
    const fcpEntry = performance.getEntriesByName("first-contentful-paint")[0];
    if (fcpEntry) result.fcp = fcpEntry.startTime;
    // LCP via PerformanceObserver
    let lcpFinal = 0;
    new PerformanceObserver((list) => {
      const entries = list.getEntries();
      for (const e of entries) lcpFinal = e.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });
    // CLS
    let clsFinal = 0;
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) {
        if (!e.hadRecentInput) clsFinal += e.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
    // Resource info
    const nav = performance.getEntriesByType("navigation")[0];
    if (nav) {
      result.navTiming = {
        ttfb: nav.responseStart - nav.requestStart,
        domLoaded: nav.domContentLoadedEventEnd - nav.startTime,
        loaded: nav.loadEventEnd - nav.startTime,
      };
    }
    setTimeout(() => {
      result.lcp = lcpFinal;
      result.cls = clsFinal;
      resolve(result);
    }, 2500);
  });
});

// Resource size
const resources = await page.evaluate(() => {
  const list = performance.getEntriesByType("resource");
  let totalJs = 0, totalCss = 0, totalImg = 0;
  for (const r of list) {
    const url = r.name;
    const size = r.encodedBodySize || r.transferSize || 0;
    if (url.includes(".js") || url.includes("/_next/static/chunks")) totalJs += size;
    else if (url.includes(".css")) totalCss += size;
    else if (/\.(png|jpg|jpeg|webp|gif|svg|avif)/.test(url)) totalImg += size;
  }
  return { totalJs, totalCss, totalImg, count: list.length };
});

console.log("\n=== /marketplace MOBILE (PROD BUILD) ===");
console.log(`TTFB:      ${ttfb}ms`);
console.log(`FCP:       ${metrics.fcp.toFixed(0)}ms`);
console.log(`LCP:       ${metrics.lcp.toFixed(0)}ms ${metrics.lcp < 2500 ? "✅" : metrics.lcp < 4000 ? "⚠️" : "❌"}`);
console.log(`CLS:       ${metrics.cls.toFixed(4)} ${metrics.cls < 0.1 ? "✅" : metrics.cls < 0.25 ? "⚠️" : "❌"}`);
console.log(`DOM ready: ${metrics.navTiming.domLoaded?.toFixed(0)}ms`);
console.log(`Loaded:    ${metrics.navTiming.loaded?.toFixed(0)}ms`);
console.log(`JS total:  ${(resources.totalJs / 1024).toFixed(0)} KB`);
console.log(`CSS total: ${(resources.totalCss / 1024).toFixed(0)} KB`);
console.log(`Img total: ${(resources.totalImg / 1024).toFixed(0)} KB`);
console.log(`Resources: ${resources.count}`);

await browser.close();
