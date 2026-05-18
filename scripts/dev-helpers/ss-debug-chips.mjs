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

const allTodas = await page.evaluate(() => {
  const buttons = Array.from(document.querySelectorAll('button'));
  const matches = buttons.filter((b) => b.textContent?.trim() === "Todas" || b.textContent?.includes("Todas"));
  return matches.slice(0, 5).map((b) => {
    const cs = window.getComputedStyle(b);
    const r = b.getBoundingClientRect();
    return {
      textContent: b.textContent?.trim().slice(0, 50),
      classes: b.className.slice(0, 200),
      parentClass: b.parentElement?.className?.slice(0, 150) ?? null,
      grandClass: b.parentElement?.parentElement?.className?.slice(0, 150) ?? null,
      opacity: cs.opacity,
      visibility: cs.visibility,
      display: cs.display,
      position: cs.position,
      top: cs.top,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height, top: r.top },
    };
  });
});
console.log(JSON.stringify(allTodas, null, 2));
await ctx.close(); await browser.close();
