import { chromium } from "playwright";
import fs from "fs";

const COOKIES_RAW = fs.readFileSync("/tmp/bsm-auth.env", "utf8");
const cookieMatch = COOKIES_RAW.match(/BSM_COOKIE='([^']+)'/);
const cookieStr = cookieMatch[1];
const cookies = cookieStr.split("; ").map((kv) => {
  const i = kv.indexOf("=");
  return { name: kv.slice(0, i), value: kv.slice(i + 1), domain: "localhost", path: "/" };
});

const browser = await chromium.launch({
  headless: true,
  executablePath: "/home/usuario/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addCookies(cookies);
const page = await ctx.newPage();

await page.addInitScript(() => {
  localStorage.setItem("onboarding-completed-main", "1");
  // Capturar errores globales
  window.addEventListener("error", (e) => {
    console.log("[window.error]", e.message, e.filename, e.lineno);
  });
  window.addEventListener("unhandledrejection", (e) => {
    console.log("[unhandledrejection]", String(e.reason));
  });
});

page.on("console", (msg) => {
  const t = msg.type();
  if (t === "error" || t === "warn" || msg.text().includes("[window.error]") || msg.text().includes("[unhandledrejection]")) {
    console.log(`[${t}]`, msg.text().slice(0, 400));
  }
});
page.on("pageerror", (err) => console.log("[pageerror]", err.message));
page.on("requestfailed", (req) => console.log("[reqfail]", req.url().slice(0, 120), req.failure()?.errorText));
page.on("response", (res) => {
  if (res.status() >= 400) console.log("[http", res.status() + "]", res.url().slice(0, 140));
});

await page.goto("http://localhost:3000/admin?tab=documentos", { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForTimeout(15000);

// Estado actual del DOM
const bodyLen = await page.evaluate(() => document.body.innerText.length);
const headingText = await page.evaluate(() => {
  const h = document.querySelector("h1, h2, [role=heading]");
  return h ? h.textContent?.slice(0, 200) : null;
});
const visibleNodes = await page.evaluate(() => {
  return Array.from(document.querySelectorAll("body *"))
    .filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 50 && r.height > 20;
    })
    .slice(0, 5)
    .map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className ? "." + (typeof el.className === "string" ? el.className.split(" ")[0] : "") : ""}`);
});

console.log("---SUMMARY---");
console.log("body text length:", bodyLen);
console.log("h1/h2/heading:", headingText);
console.log("first 5 visible elements:", visibleNodes);

await page.screenshot({ path: "reports/visual-verify/2026-05-10T22-56-40-docs-live/diagnose.png" });
await browser.close();
