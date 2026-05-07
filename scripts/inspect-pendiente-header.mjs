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
await page.waitForTimeout(3500);
// Forzar render del tab marketplace
for (let i = 0; i < 5; i++) {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { moduleId: "marketplace", tabId: "marketplace" } })));
  await page.waitForTimeout(1000);
  const ok = await page.evaluate(() => /marketplace/i.test(window.location.href));
  if (ok) break;
}
await page.waitForTimeout(2500);
// click ordenes
await page.evaluate(() => { const a = Array.from(document.querySelectorAll("button, a")).find(e => /[óo]rdenes/i.test(e.textContent || "")); if (a) a.click(); });
await page.waitForTimeout(3000);
// Inspeccionar el header de la primera columna
const sample = await page.evaluate(() => {
  // buscar elemento que contenga "Pendiente" como label
  const all = Array.from(document.querySelectorAll("span, div"));
  const pending = all.find(e => (e.textContent || "").trim() === "Pendiente");
  if (!pending) return { error: "no pending found" };
  const parent = pending.closest('div[class*="rounded"]');
  return {
    parentCls: (parent?.className || "").toString().slice(0, 250),
    parentHeight: parent?.getBoundingClientRect().height,
    parentBg: parent ? getComputedStyle(parent).backgroundColor : null,
    pendingCls: pending.className.toString().slice(0, 100),
    pendingText: pending.textContent,
    siblings: Array.from(parent?.children || []).map(c => ({
      tag: c.tagName,
      text: (c.textContent || "").slice(0, 30),
      cls: (c.className || "").toString().slice(0, 100),
    })),
  };
});
console.log(JSON.stringify(sample, null, 2));
await browser.close();
