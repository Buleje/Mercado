import { chromium } from "playwright";
const b = await chromium.launch({ headless: true, executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome" });
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
  const today = new Date().toISOString().slice(0, 10);
  try { localStorage.setItem(`morning-summary-${today}`, "shown"); } catch {}
});
await page.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
await page.locator("#username").first().pressSequentially("qaadmin", { delay: 25 });
await page.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 25 });
await page.waitForTimeout(400);
await page.locator("#password").first().press("Enter");
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(4500);
// Click "Comenzar el día" para cerrar modal
await page.locator('button:has-text("Comenzar el día")').click({ force: true, timeout: 3000 }).catch(() => {});
await page.waitForTimeout(1500);
// Navegar marketplace
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { moduleId: "marketplace", tabId: "marketplace" } })));
  await page.waitForTimeout(1500);
  const ok = await page.evaluate(() => /marketplace/i.test(window.location.href));
  if (ok) break;
}
await page.waitForTimeout(2500);
// Click ordenes
await page.evaluate(() => { const a = Array.from(document.querySelectorAll("button, a")).find(e => /[óo]rdenes/i.test(e.textContent || "")); if (a) a.click(); });
await page.waitForTimeout(4000);
await page.screenshot({ path: "reports/design-system/check-bundle.png", fullPage: false });
console.log("URL:", page.url());
// Verificar HTML del header
const html = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("span, div"));
  const pending = all.find(e => (e.textContent || "").trim() === "Pendiente");
  return pending ? pending.parentElement?.outerHTML?.slice(0, 800) : "not found";
});
console.log("HTML del header Pendiente:", html);
await b.close();
