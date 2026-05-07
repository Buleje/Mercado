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

// Bypass de onboarding y tours que tapen el viewport
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("onboarding-completed-main", "1");
    localStorage.setItem("onboarding-dismissed", "1");
    localStorage.setItem("buleje-tour-marketplace-2026-04", "done");
    localStorage.setItem("admin-onboarding-checklist-dismissed", "1");
    sessionStorage.setItem("admin-onboarding-checklist-shown", "1");
  } catch {}
});

const page = await ctx.newPage();
const errors = [];
const reqFails = [];
const fourOhFours = [];
page.on("console", m => { if (m.type() === "error") errors.push(`[CONSOLE] ${m.text().slice(0,200)}`); });
page.on("pageerror", e => errors.push(`[PAGEERROR] ${e.message.slice(0,200)}`));
page.on("requestfailed", r => {
  const err = r.failure()?.errorText ?? "";
  if (!err.includes("ERR_ABORTED")) reqFails.push(`[REQFAIL] ${r.url().slice(-80)} -> ${err}`);
});
page.on("response", r => {
  if (r.status() === 404) fourOhFours.push(r.url().slice(-100));
});

await page.goto("http://localhost:3000/t/main/admin?tab=metas-logros", { waitUntil: "domcontentloaded", timeout: 30000 });
await page.waitForTimeout(2500);

// Cerrar modal de onboarding "Buenos días" / "Configura tu bodega"
for (const sel of [
  'button:has-text("Más tarde")',
  'button:has-text("Saltar")',
  '[aria-label="Cerrar"]',
  'button:has-text("✕")',
]) {
  try {
    await page.locator(sel).first().click({ timeout: 1500 });
    await page.waitForTimeout(500);
  } catch {}
}
// Press Escape también por si acaso
try { await page.keyboard.press("Escape"); } catch {}
await page.waitForTimeout(600);

// Click tab Logros (después de cerrar el modal)
try {
  await page.locator('button:has-text("Logros")').first().click({ timeout: 5000 });
  await page.waitForTimeout(3500);
} catch(e) { console.log("[INFO] tab no clickeado:", e.message.slice(0,100)); }

await page.screenshot({ path: "/tmp/logros.png", fullPage: true });
console.log("\n=== ERRORS ===");
errors.slice(0, 10).forEach(e => console.log(e));
console.log(`Total: ${errors.length}`);
console.log("\n=== REQ FAILS (no aborted) ===");
reqFails.slice(0, 10).forEach(e => console.log(e));
console.log(`Total: ${reqFails.length}`);
console.log("\n=== 404s ===");
fourOhFours.slice(0, 10).forEach(u => console.log(`[404] ${u}`));
console.log(`Total: ${fourOhFours.length}`);
await browser.close();
