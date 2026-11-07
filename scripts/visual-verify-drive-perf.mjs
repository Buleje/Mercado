/**
 * Verifica que el drive siga funcionando igual después de las optimizaciones,
 * y mide lo que efectivamente baja el navegador al abrirlo.
 *
 *   node scripts/visual-verify-drive-perf.mjs
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BSM_BASE ?? "http://localhost:3000";
const SLUG = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const OUT = "reports/contratos";

function kb(n) {
  return `${(n / 1024).toFixed(1)} KB`;
}

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
  });
  const page = await context.newPage();
  await page.addInitScript((slug) => {
    try {
      localStorage.setItem(`onboarding-completed-${slug}`, "1");
    } catch {
      /* storage bloqueado: no afecta la medición */
    }
  }, SLUG);

  const login = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: USER, password: PASS, tenantSlug: SLUG },
  });
  if (login.status() !== 200) {
    console.error("Login falló:", login.status());
    process.exit(1);
  }

  // Contabilidad de lo que baja el navegador, separado por tipo.
  const cuenta = { listado: 0, miniaturas: 0, raw: 0, nMiniaturas: 0, nRaw: 0 };
  page.on("response", async (res) => {
    const url = res.url();
    if (!url.includes("/api/admin/documents")) return;
    let largo = 0;
    try {
      largo = Number((await res.headerValue("content-length")) ?? 0);
    } catch {
      largo = 0;
    }
    if (url.includes("/thumbnail")) {
      cuenta.miniaturas += largo;
      cuenta.nMiniaturas++;
    } else if (url.includes("/raw")) {
      cuenta.raw += largo;
      cuenta.nRaw++;
    } else if (/\/api\/admin\/documents(\?|$)/.test(url)) {
      cuenta.listado += largo;
    }
  });

  await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(9000);

  await page.screenshot({ path: `${OUT}/drive-grilla.png`, fullPage: false });

  // Las miniaturas cargaron de verdad (no quedaron todas en el ícono de respaldo).
  const imagenes = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll("img")].filter((i) =>
      i.src.includes("/api/admin/documents/"),
    );
    return {
      total: imgs.length,
      cargadas: imgs.filter((i) => i.complete && i.naturalWidth > 0).length,
    };
  });

  console.log("Al abrir el drive, el navegador bajó:");
  console.log("  listado:    ", kb(cuenta.listado));
  console.log(`  miniaturas: ${kb(cuenta.miniaturas)}  (${cuenta.nMiniaturas} pedidos)`);
  console.log(`  archivos originales por /raw: ${kb(cuenta.raw)}  (${cuenta.nRaw} pedidos)`);
  console.log(`Miniaturas dibujadas: ${imagenes.cargadas}/${imagenes.total}`);

  await browser.close();
}

main().catch((err) => {
  console.error("Falló la verificación:", err);
  process.exitCode = 1;
});
