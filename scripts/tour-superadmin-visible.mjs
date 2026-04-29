// Tour visible del /superadmin via CDP — se conecta al Chrome lanzado aparte
// (puerto 9222) y navega lentamente para que Brandon vea cada movimiento sin
// que se le tome el control del mouse/teclado real.
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const USER = "superadmin";
const PASS = "Super2026!";

const STOPS = [
  { url: "/superadmin/marketplace",                  desc: "Hub Marketplace (recién creado)" },
  { url: "/superadmin/marketplace/suppliers",        desc: "Cola de proveedores" },
  { url: "/superadmin/marketplace/category-images",  desc: "Imágenes de categorías" },
  { url: "/superadmin/dashboard",                    desc: "Dashboard ejecutivo (widgets ya optimizado)" },
  { url: "/superadmin/analytics",                    desc: "Analytics (executive ya optimizado)" },
  { url: "/superadmin/tenants",                      desc: "Tiendas / tenants" },
  { url: "/superadmin/health",                       desc: "Salud del sistema" },
];

async function main() {
  console.log("→ Conectando al Chrome en :9222...");
  const browser = await chromium.connectOverCDP("http://localhost:9222");
  const ctx = browser.contexts()[0];
  const page = ctx.pages()[0] ?? await ctx.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });

  // Login (programático para no andar tipeando en pantalla)
  console.log("→ Login superadmin...");
  const r = await page.request.post(`${BASE}/api/superadmin/auth`, {
    headers: { "content-type": "application/json" },
    data: { username: USER, password: PASS },
  });
  console.log("   login status:", r.status());

  // Tour
  for (const stop of STOPS) {
    console.log(`\n▶ ${stop.url}  — ${stop.desc}`);
    await page.goto(`${BASE}${stop.url}`, { waitUntil: "networkidle", timeout: 30_000 });
    await page.waitForTimeout(900);

    // Scroll suave para que se vea el contenido completo
    await page.evaluate(async () => {
      const total = Math.min(document.body.scrollHeight, 2400);
      const steps = 18;
      for (let i = 0; i <= steps; i++) {
        window.scrollTo({ top: (total * i) / steps, behavior: "smooth" });
        await new Promise((res) => setTimeout(res, 110));
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      await new Promise((res) => setTimeout(res, 400));
    });

    // Mover el mouse del CDP page (NO el del sistema) por el viewport — solo
    // se ve dentro del Chrome, no afecta tu mouse real.
    const targets = [
      [200, 200],
      [720, 350],
      [1100, 220],
      [600, 600],
      [200, 600],
    ];
    for (const [x, y] of targets) {
      await page.mouse.move(x, y, { steps: 25 });
      await page.waitForTimeout(180);
    }
    await page.waitForTimeout(900);
  }

  console.log("\n✅ Tour terminado. Chrome sigue abierto en :9222.");
  // No cerramos browser para que Brandon siga viendo la última página.
  await browser.close().catch(() => {});
}

main().catch((e) => {
  console.error("Tour error:", e);
  process.exit(1);
});
