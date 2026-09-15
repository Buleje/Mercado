import { chromium } from "playwright";
const BASE = "http://localhost:3000";
const SLUG = "main";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ extraHTTPHeaders: { "x-tenant-id": SLUG } });
const page = await context.newPage();
const loginResp = await page.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": SLUG },
  data: { username: "qaadmin", password: "Qa-admin-1234", tenantSlug: SLUG },
});
console.log("login status", loginResp.status());
const r = await page.request.get(`${BASE}/api/platform/admin-template`, { headers: { "x-tenant-id": SLUG } });
console.log("status", r.status());
const json = await r.json().catch(async () => ({ raw: await r.text() }));
console.log(JSON.stringify(json, null, 2).slice(0, 6000));
await browser.close();
