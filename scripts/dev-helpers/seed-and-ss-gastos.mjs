/**
 * Seed 3 gastos recurrentes en mi-pollo (con metadata extra) y toma screenshot
 * del catálogo poblado.
 */
import { chromium } from "playwright";
import path from "node:path";

const TENANT = "mi-pollo";
const BASE = "http://localhost:3000";
const OUT = "reports/visual-verify/punto-compra-baseline";
const CHROMIUM = path.join(process.env.HOME ?? "", ".cache/ms-playwright/chromium-1208/chrome-linux64/chrome");

const SEP = "\n---META---\n";

const GASTOS = [
  {
    category: "Alquiler",
    humanDesc: "Alquiler local San Martín",
    amount: 850.0,
    meta: { frequency: "mensual", paymentDay: 5, paymentMethod: "yape", supplierName: "Don Juan Pérez", reminderEnabled: true, iconKey: "home", colorKey: "violet" },
  },
  {
    category: "Servicios",
    humanDesc: "Internet + cable Movistar",
    amount: 129.9,
    meta: { frequency: "mensual", paymentDay: 15, paymentMethod: "transferencia", supplierName: "Movistar", iconKey: "wifi", colorKey: "amber" },
  },
  {
    category: "Transporte",
    humanDesc: "Combustible camioneta delivery",
    amount: 80.0,
    meta: { frequency: "semanal", paymentDay: 1, paymentMethod: "efectivo", supplierName: "Grifo Repsol", iconKey: "fuel", colorKey: "orange" },
  },
];

const browser = await chromium.launch({ headless: true, executablePath: CHROMIUM });
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 1100 },
  extraHTTPHeaders: { "x-tenant-id": TENANT },
});

const login = await ctx.request.post(`${BASE}/api/auth/login`, {
  headers: { "content-type": "application/json", "x-tenant-id": TENANT },
  data: { username: "qaadmin", password: "Qa-admin-1234" },
});
console.log("Login:", login.status());

// Obtener CSRF
const page = await ctx.newPage();
await page.goto(`${BASE}/t/${TENANT}/admin?tab=compras`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(2000);

// Crear los 3 gastos via fetch en contexto del browser (CSRF automático)
const created = await page.evaluate(async ({ gastos, sep }) => {
  const csrfMeta = document.querySelector('meta[name="csrf-token"]');
  const csrfCookie = document.cookie.split(";").find((c) => c.trim().startsWith("csrf-token="));
  const csrf = csrfMeta?.getAttribute("content") || csrfCookie?.split("=")[1] || "";
  const results = [];
  for (const g of gastos) {
    const description = `${g.humanDesc}${sep}${JSON.stringify(g.meta)}`;
    const res = await fetch("/api/expenses", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-csrf-token": csrf },
      body: JSON.stringify({ category: g.category, description, amount: g.amount, recurring: true }),
    });
    results.push({ category: g.category, status: res.status });
  }
  return results;
}, { gastos: GASTOS, sep: SEP });

console.log("Created:", JSON.stringify(created));

// Reload para ver el catálogo poblado
for (const theme of ["light", "dark"]) {
  await page.goto(`${BASE}/t/${TENANT}/admin?tab=compras&sub=punto-compra&_fresh=${Date.now()}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.waitForTimeout(2500);
  await page.evaluate((t) => {
    document.documentElement.classList.toggle("dark", t === "dark");
    try {
      localStorage.setItem("theme", t);
      localStorage.setItem("onboarding-completed-mi-pollo", "1");
    } catch {}
  }, theme);
  await page.waitForTimeout(800);
  try { await page.waitForSelector("text=Artículos para Comprar", { timeout: 15000 }); } catch {}
  await page.waitForTimeout(1200);
  // Eliminar onboarding y cualquier backdrop modal residual
  await page.evaluate(() => {
    document.querySelectorAll("[role='dialog']").forEach((el) => {
      const txt = el.textContent ?? "";
      if (txt.includes("Configura tu bodega") || txt.includes("Personaliza") || txt.includes("primer producto") || txt.includes("Continuar")) {
        el.remove();
      }
    });
    // Cualquier overlay z-50 con fixed inset-0
    document.querySelectorAll(".fixed.inset-0").forEach((el) => {
      const txt = el.textContent ?? "";
      if (txt.includes("Configura") || txt.includes("Continuar") || txt.includes("Personaliza")) el.remove();
    });
    document.body.style.overflow = "";
  });
  await page.waitForTimeout(400);

  const out = path.join(OUT, `03-populated-${theme}.png`);
  await page.screenshot({ path: out, fullPage: false });
  console.log(`OK ${out}`);
}

await browser.close();
