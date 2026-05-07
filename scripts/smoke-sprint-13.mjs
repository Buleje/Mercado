import { chromium } from "playwright";

const ROUTES = [
  { url: "http://localhost:3000/", name: "home" },
  { url: "http://localhost:3000/marketplace", name: "marketplace" },
  { url: "http://localhost:3000/marketplace/main", name: "store-main" },
  { url: "http://localhost:3000/t/main", name: "tenant-page" },
  { url: "http://localhost:3000/admin/login", name: "admin-login" },
];

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.HOME + "/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome",
});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const results = [];

for (const route of ROUTES) {
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 120)); });
  page.on("pageerror", (err) => { consoleErrors.push("PAGE_ERROR: " + err.message.slice(0, 120)); });
  try {
    const start = Date.now();
    const resp = await page.goto(route.url, { waitUntil: "domcontentloaded", timeout: 15000 });
    await page.waitForTimeout(800);
    const status = resp?.status() ?? 0;
    const ms = Date.now() - start;
    results.push({ name: route.name, status, ms, errors: consoleErrors.length, sampleErrors: consoleErrors.slice(0, 2) });
  } catch (err) {
    results.push({ name: route.name, status: 0, ms: 0, errors: -1, sampleErrors: [err.message.slice(0, 120)] });
  }
  await page.close();
}

await browser.close();

console.log("\n┌─────────────────┬────────┬──────────┬─────────┐");
console.log("│ Ruta            │ Status │ Tiempo   │ Errors  │");
console.log("├─────────────────┼────────┼──────────┼─────────┤");
for (const r of results) {
  console.log(`│ ${r.name.padEnd(15)} │ ${String(r.status).padEnd(6)} │ ${String(r.ms + "ms").padEnd(8)} │ ${String(r.errors).padEnd(7)} │`);
}
console.log("└─────────────────┴────────┴──────────┴─────────┘");
const failed = results.filter(r => r.status !== 200 || r.errors > 5);
if (failed.length > 0) {
  console.log("\n❌ Errores detectados:");
  failed.forEach(r => {
    console.log(`  ${r.name}:`);
    r.sampleErrors.forEach(e => console.log(`    · ${e}`));
  });
  process.exit(1);
}
console.log("\n✅ Todas las rutas críticas OK");
