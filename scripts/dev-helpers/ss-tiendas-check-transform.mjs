import { chromium, devices } from "playwright";
const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ ...devices["iPhone 14 Pro"], isMobile: true });
const page = await ctx.newPage();
await page.goto(`http://localhost:3000/tiendas?_t=${Date.now()}`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
for (const y of [200, 400, 600, 800, 1000]) {
  await page.evaluate((t) => window.scrollTo({ top: t, behavior: "auto" }), y);
  await page.waitForTimeout(120);
}
await page.waitForTimeout(1500);
const state = await page.evaluate(() => {
  const allP = document.querySelectorAll('p');
  const subEyebrow = Array.from(allP).find((p) => p.textContent === "SUBCATEGORÍA");
  const subSectionRect = subEyebrow?.parentElement?.getBoundingClientRect();
  const realScrollY = document.scrollingElement?.scrollTop ?? 0;
  const scrollEl = document.scrollingElement?.tagName ?? null;
  const sticky = Array.from(document.querySelectorAll('.fixed.top-16')).find((e) =>
    e.className.includes("sm:hidden"),
  );
  if (!sticky) return { found: false };
  const cs = window.getComputedStyle(sticky);
  return {
    found: true,
    classList: sticky.className.slice(0, 300),
    transform: cs.transform,
    opacity: cs.opacity,
    pointerEvents: cs.pointerEvents,
    transitionProperty: cs.transitionProperty,
    transitionDuration: cs.transitionDuration,
    rect: JSON.parse(JSON.stringify(sticky.getBoundingClientRect())),
    subSectionRect: subSectionRect ? JSON.parse(JSON.stringify(subSectionRect)) : null,
    realScrollY,
    scrollEl,
    windowScrollY: window.scrollY,
    innerHeight: window.innerHeight,
    docScrollHeight: document.documentElement.scrollHeight,
  };
});
console.log(JSON.stringify(state, null, 2));
import { mkdirSync } from "node:fs";
mkdirSync("reports/visual-verify/tiendas-mobile", { recursive: true });
await page.screenshot({ path: "reports/visual-verify/tiendas-mobile/combined-test.png", fullPage: false });
console.log("screenshot saved");
await ctx.close();
await browser.close();
