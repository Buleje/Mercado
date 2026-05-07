import { chromium } from "playwright";
const browser = await chromium.launch({ headless: true, executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome" });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  try { localStorage.setItem("onboarding-completed-main", "1"); } catch {}
});
await page.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(800);
await page.locator("#username").first().pressSequentially("qaadmin", { delay: 25 });
await page.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 25 });
await page.waitForTimeout(400);
await page.locator("#password").first().press("Enter");
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(4000);
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { moduleId: "marketplace", tabId: "marketplace" } })));
  await page.waitForTimeout(1500);
  const ok = await page.evaluate(() => /marketplace/i.test(window.location.href));
  if (ok) break;
}
await page.waitForTimeout(2500);
await page.evaluate(() => { const a = Array.from(document.querySelectorAll("button, a")).find(e => /[óo]rdenes/i.test(e.textContent || "")); if (a) a.click(); });
await page.waitForTimeout(4000);
// Inspect what's in DOM
const html = await page.evaluate(() => {
  const all = Array.from(document.querySelectorAll("span, div"));
  const pending = all.find(e => (e.textContent || "").trim() === "Pendiente");
  if (!pending) return { error: "no pending found", url: window.location.href };
  // Get the parent (header) HTML
  const parent = pending.parentElement;
  return {
    parentHTML: parent?.outerHTML?.slice(0, 600) || null,
    parentParentHTML: parent?.parentElement?.outerHTML?.slice(0, 600) || null,
  };
});
console.log(JSON.stringify(html, null, 2));
await browser.close();
