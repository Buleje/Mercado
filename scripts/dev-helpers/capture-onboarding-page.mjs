import { chromium } from "playwright";
import path from "node:path";

const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");
const out = process.argv[2] ?? "/tmp/onboarding.png";

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  extraHTTPHeaders: { "x-tenant-id": "main" },
});
const page = await ctx.newPage();

// Auth
const auth = await page.request.post("http://localhost:3000/api/auth/login", {
  headers: { "content-type": "application/json", "x-tenant-id": "main" },
  data: { username: "qaadmin", password: "Qa-admin-1234" },
});
console.log("auth:", auth.status());

await page.goto("http://localhost:3000/onboarding", { waitUntil: "networkidle", timeout: 30000 });
await page.waitForTimeout(3000);

// Inspect what's visible
const visible = await page.evaluate(() => {
  const card = document.querySelector('[class*="bg-white"][class*="rounded-2xl"]');
  if (!card) return { found: false };
  const rect = card.getBoundingClientRect();
  const text = card.textContent?.slice(0, 200) ?? "";
  const styles = window.getComputedStyle(card);
  return {
    found: true,
    visible: rect.width > 0 && rect.height > 0,
    width: rect.width,
    height: rect.height,
    opacity: styles.opacity,
    bg: styles.backgroundColor,
    text,
    childCount: card.children.length,
  };
});
console.log("Card inspection:", JSON.stringify(visible, null, 2));

await page.screenshot({ path: out, fullPage: false });
console.log("screenshot →", out);
await browser.close();
