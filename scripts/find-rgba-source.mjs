/**
 * Encuentra exactamente dónde está la rgba(0,180,166,...) que persiste en cada admin module.
 */
import { chromium } from "playwright";

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});

const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();

await page.goto("http://localhost:3000/", { waitUntil: "domcontentloaded" });
await page.evaluate(() => {
  localStorage.setItem("active-tenant-slug", "main");
  localStorage.setItem("active-tenant", "main");
});
await page.goto("http://localhost:3000/admin/login", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(500);
await page.locator("#username").first().pressSequentially("qaadmin", { delay: 30 });
await page.locator("#password").first().pressSequentially("Qa-admin-1234", { delay: 30 });
await page.waitForTimeout(400);
await page.locator("#password").first().press("Enter");
await page.waitForURL((u) => !u.toString().includes("/login"), { timeout: 25000 }).catch(() => {});
await page.waitForTimeout(3500);

const findRgba = await page.evaluate(() => {
  const html = document.documentElement.outerHTML;
  const rePattern = /rgba\(\s*0\s*,\s*180\s*,\s*166[^)]*\)/g;
  const results = [];
  let match;
  while ((match = rePattern.exec(html)) !== null) {
    const start = Math.max(0, match.index - 100);
    const end = Math.min(html.length, match.index + 200);
    results.push(html.slice(start, end).replace(/\n/g, " ").replace(/\s+/g, " "));
    if (results.length >= 5) break;
  }

  // Buscar específicamente en stylesheets inline y atributos style
  const inStyleAttr = [];
  document.querySelectorAll("[style]").forEach((el) => {
    const s = el.getAttribute("style");
    if (s && /rgba\(\s*0\s*,\s*180\s*,\s*166/.test(s)) {
      inStyleAttr.push({
        tag: el.tagName,
        cls: (el.className || "").toString().slice(0, 50),
        style: s.slice(0, 200),
      });
    }
  });

  // Y en <style> tags
  const inStyleTags = [];
  document.querySelectorAll("style").forEach((s) => {
    const t = s.textContent || "";
    const matches = t.match(/rgba\(\s*0\s*,\s*180\s*,\s*166[^)]*\)/g);
    if (matches) {
      // Log surrounding context
      let i = t.indexOf("rgba(0,180,166");
      if (i === -1) i = t.indexOf("rgba(0, 180, 166");
      if (i >= 0) {
        const start = Math.max(0, i - 60);
        const end = Math.min(t.length, i + 120);
        inStyleTags.push({
          stylesheetSnippet: t.slice(start, end).replace(/\s+/g, " "),
          matches: matches.length,
        });
      }
    }
  });

  return { textMatches: results.slice(0, 3), inStyleAttr, inStyleTags };
});

console.log(JSON.stringify(findRgba, null, 2));
await browser.close();
