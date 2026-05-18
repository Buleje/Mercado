/**
 * Seed productos con stock bajo en mi-pollo para ver sugerencias pobladas.
 * Crea 6 productos con stock < stockMin para forzar urgency CRITICO/URGENTE/PLANIFICAR.
 */
import { chromium } from "playwright";
import path from "node:path";

const TENANT = "mi-pollo";
const BASE = "http://localhost:3000";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const PRODUCTS = [
  // CRITICO: daysOfStock <= 3
  { name: "Aceite vegetal Primor 1L",   category: "Aceites",   price: 9.50,  costPrice: 7.20, stock: 2,  stockMin: 30, unit: "und" },
  { name: "Arroz extra Costeño 5kg",    category: "Granos",    price: 24.90, costPrice: 19.00, stock: 1,  stockMin: 20, unit: "und" },
  // URGENTE: 4-7 días
  { name: "Azúcar rubia Cartavio 1kg",  category: "Endulzantes", price: 5.50,  costPrice: 4.10, stock: 8,  stockMin: 25, unit: "und" },
  { name: "Leche evaporada Gloria",     category: "Lácteos",   price: 4.20,  costPrice: 3.30, stock: 12, stockMin: 40, unit: "und" },
  // PLANIFICAR: > 7 días
  { name: "Atún Campomar lata 170g",    category: "Conservas", price: 6.80,  costPrice: 5.20, stock: 18, stockMin: 50, unit: "und" },
  { name: "Galleta soda Field 6 pack",  category: "Galletas",  price: 3.20,  costPrice: 2.40, stock: 20, stockMin: 60, unit: "und" },
];

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
const ctx = await browser.newContext({ extraHTTPHeaders: { "x-tenant-id": TENANT } });
const login = await ctx.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  data: { username: "qaadmin", password: "Qa-admin-1234" },
});
console.log("Login:", login.status());

const page = await ctx.newPage();
await page.goto(`${BASE}/t/${TENANT}/admin`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(1500);

const results = await page.evaluate(async (products) => {
  // Get CSRF token from cookie
  const csrf = document.cookie.split(";").find((c) => c.trim().startsWith("csrf-token="))?.split("=")[1] ?? "";
  const out = [];
  for (const p of products) {
    const res = await fetch("/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      credentials: "include",
      body: JSON.stringify({ ...p, active: true }),
    });
    const data = res.ok ? null : await res.json().catch(() => ({}));
    out.push({ name: p.name, status: res.status, ok: res.ok, err: data });
  }
  return out;
}, PRODUCTS);

console.log("Seeded:", JSON.stringify(results, null, 2));

await browser.close();
