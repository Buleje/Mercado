import { chromium, devices } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({ ...devices["iPhone 14 Pro"], isMobile: true });
const page = await ctx.newPage();

await page.addInitScript(() => {
  try {
    window.sessionStorage.setItem("buleje-theme-session-v2", "dark");
  } catch {}
});

await page.goto(`http://localhost:3000/marketplace/pizza-pucallpa?_t=${Date.now()}`, { waitUntil: "domcontentloaded" });

// Read state IMMEDIATELY after domcontentloaded (before any React)
const immediate = await page.evaluate(() => ({
  html: document.documentElement.className,
  scheme: document.documentElement.style.colorScheme,
  session: window.sessionStorage.getItem("buleje-theme-session-v2"),
  scripts: Array.from(document.head.querySelectorAll("script")).slice(0, 6).map(s => ({
    src: s.src,
    nonce: s.nonce,
    hasInline: !!s.innerText,
    inlinePreview: s.innerText?.slice(0, 80),
  })),
}));
console.log("IMMEDIATE", JSON.stringify(immediate, null, 2));

await page.waitForLoadState("networkidle").catch(() => {});
await page.waitForTimeout(5000);

const after = await page.evaluate(() => ({
  html: document.documentElement.className,
  scheme: document.documentElement.style.colorScheme,
  bodyBg: window.getComputedStyle(document.body).backgroundColor,
}));
console.log("AFTER networkidle+5s", JSON.stringify(after, null, 2));

await ctx.close(); await browser.close();
