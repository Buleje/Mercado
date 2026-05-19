/**
 * Seed 3 OCs en mi-pollo para ver cards con datos.
 */
import { chromium } from "playwright";
import path from "node:path";

const TENANT = "mi-pollo";
const BASE = "http://localhost:3000";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
const ctx = await browser.newContext({ extraHTTPHeaders: { "x-tenant-id": TENANT } });
await ctx.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  data: { username: "qaadmin", password: "Qa-admin-1234" },
});

const page = await ctx.newPage();
await page.goto(`${BASE}/t/${TENANT}/admin?tab=compras&sub=ordenes-compra`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

const ORDERS = [
  { supplierName: "Distribuidora San Martín SAC", items: [{ productId: 9001, name: "Aceite Primor 1L", quantity: 12, unitCost: 7.20, unit: "und" }, { productId: 9002, name: "Arroz Costeño 5kg", quantity: 8, unitCost: 19.00, unit: "und" }], notes: "Pagar a 30 días", status: "pendiente" },
  { supplierName: "Mayorista Pucallpa EIRL", items: [{ productId: 9003, name: "Leche Gloria evaporada", quantity: 24, unitCost: 3.30, unit: "und" }], notes: "Entrega lunes 8am", status: "parcial" },
  { supplierName: "Distribuidora Lima Norte", items: [{ productId: 9004, name: "Atún Campomar 170g", quantity: 36, unitCost: 5.20, unit: "und" }, { productId: 9005, name: "Galleta Field 6 pack", quantity: 20, unitCost: 2.40, unit: "und" }], status: "recibido" },
];

const results = await page.evaluate(async (orders) => {
  const csrf = document.cookie.split(";").find((c) => c.trim().startsWith("csrf-token="))?.split("=")[1] ?? "";
  const out = [];
  for (const o of orders) {
    const res = await fetch("/api/purchases", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      credentials: "include",
      body: JSON.stringify({ supplierId: "", supplierName: o.supplierName, items: o.items, notes: o.notes ?? "" }),
    });
    if (res.ok && o.status !== "pendiente") {
      const po = await res.json();
      // Update status
      await fetch(`/api/purchases/${po.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
        credentials: "include",
        body: JSON.stringify({ status: o.status }),
      });
    }
    out.push({ supplier: o.supplierName, status: res.status, ok: res.ok });
  }
  return out;
}, ORDERS);

console.log("Seeded:", JSON.stringify(results, null, 2));
await browser.close();
