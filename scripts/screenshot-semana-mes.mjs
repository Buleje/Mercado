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
const ctx = await browser.newContext({ viewport: { width: 1280, height: 1100 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();
const errors = [];
const reqFails = [];
page.on("console", m => { if (m.type() === "error") errors.push(`[CONSOLE] ${m.text().slice(0,200)}`); });
page.on("pageerror", e => errors.push(`[PAGEERROR] ${e.message.slice(0,200)}`));
page.on("requestfailed", r => {
  const err = r.failure()?.errorText ?? "";
  if (!err.includes("ERR_ABORTED")) reqFails.push(`[REQFAIL] ${r.url().slice(-80)} -> ${err}`);
});

const resp = await page.goto("http://localhost:3000/t/main/admin?tab=metas-logros", { waitUntil: "domcontentloaded", timeout: 30000 });
console.log("HTTP:", resp?.status());
await page.waitForTimeout(2500);

// Click en tab "Semana/Mes"
try {
  await page.locator('button:has-text("Semana/Mes")').first().click({ timeout: 5000 });
  await page.waitForTimeout(3000);
} catch(e) { console.log("[INFO] tab no clickeado:", e.message.slice(0,100)); }

await page.screenshot({ path: "/tmp/semana-mes.png", fullPage: true });
console.log("\n=== ERRORS ===");
errors.slice(0, 10).forEach(e => console.log(e));
console.log(`Total errors: ${errors.length}`);
console.log("\n=== REQ FAILS (no aborted) ===");
reqFails.slice(0, 10).forEach(e => console.log(e));
console.log(`Total reqFails: ${reqFails.length}`);
await browser.close();
