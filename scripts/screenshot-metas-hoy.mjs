import { chromium } from "playwright";
const cookieStr = process.env.BSM_COOKIE || "";
const cookies = cookieStr.split(";").map(s => s.trim()).filter(Boolean).map(c => {
  const [name, ...rest] = c.split("=");
  return { name: name.trim(), value: rest.join("=").trim(), domain: "localhost", path: "/" };
});

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const errors = [];
page.on("console", m => { if (m.type() === "error") errors.push(`[CONSOLE] ${m.text().slice(0,200)}`); });
page.on("pageerror", e => errors.push(`[PAGEERROR] ${e.message.slice(0,200)}`));
page.on("requestfailed", r => errors.push(`[REQFAIL] ${r.url().slice(0,80)} -> ${r.failure()?.errorText}`));

const url = "http://localhost:3000/t/main/admin?tab=metas-logros";
const resp = await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
console.log("HTTP:", resp?.status());
await page.waitForTimeout(3000);

// Click en tab "Hoy" si existe
try {
  await page.locator('button:has-text("Hoy")').first().click({ timeout: 3000 });
  await page.waitForTimeout(2500);
} catch(e) { console.log("[INFO] tab Hoy no clickeado:", e.message.slice(0,80)); }

await page.screenshot({ path: "/tmp/metas-hoy.png", fullPage: true });
console.log("\n=== ERRORS DETECTED ===");
errors.slice(0, 15).forEach(e => console.log(e));
console.log(`\n=== TOTAL: ${errors.length} ===`);
await browser.close();
