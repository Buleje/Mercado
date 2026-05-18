import { chromium, devices } from "playwright";

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

await page.goto(`http://localhost:3000/tiendas?_t=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(3500);

async function snap(label) {
  const data = await page.evaluate(() => {
    const bar = document.querySelector('[aria-label="Filtrar por subcategoría"]');
    // The sticky bar wrapper
    const sticky = document.querySelector('.sm\\:hidden.fixed.top-16, [class*="sticky-sub"]') ||
      Array.from(document.querySelectorAll('.fixed.top-16')).find(el => el.classList.contains('sm:hidden') || true);
    const navEl = document.querySelector('[class*="nav-smooth-transition"][class*="sticky"]');
    return {
      scrollY: window.scrollY,
      scrollMax: document.documentElement.scrollHeight - window.innerHeight,
      stickyFound: !!sticky,
      stickyClasses: sticky?.className?.slice(0, 200) ?? null,
      navClasses: navEl?.className?.slice(0, 200) ?? null,
    };
  });
  console.log(label, JSON.stringify(data, null, 2));
}

await snap("01 top");

for (const y of [200, 400, 600, 800, 1000]) {
  await page.evaluate((t) => window.scrollTo({ top: t, behavior: "auto" }), y);
  await page.waitForTimeout(100);
}
await page.waitForTimeout(1500);
await snap("02 scrolled-down");

for (const y of [800, 600]) {
  await page.evaluate((t) => window.scrollTo({ top: t, behavior: "auto" }), y);
  await page.waitForTimeout(100);
}
await page.waitForTimeout(1500);
await snap("03 scrolled-up");

await ctx.close();
await browser.close();
