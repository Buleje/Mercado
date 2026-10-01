// Auditoría de runtime del panel admin: recorre los 58 tabs y captura
// errores de consola, excepciones de página y respuestas HTTP fallidas.
// No juzga estética — mide lo que el navegador realmente reporta.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const BASE = "http://localhost:3000";
const SLUG = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const OUT = "reports/audit-admin-runtime";

const TABS = process.env.TABS
  ? process.env.TABS.split(",")
  : ("vendor-dashboard asistente-ia ai-command sugerencias-ia metas-logros ventas-caja inventario recetas productos compras dropship plata clientes leads-funnel campanas puntos canales gift-cards-admin socio-members subscriptions lives-admin tareas notas config pedidos turnos fiados analytics-pro forecasting prestamos adelantos activos por-cobrar scoring plan facturacion documentos cotizaciones guias-remision notas-credito contratos marketplace delivery-partners delivery-live marketplace-chat whatsapp-inbox store-customizer pagina-inicio rendimiento auditoria colas mi-perfil support-inbox ctp-libro-operaciones forestal-lotes loth-libro-operaciones forestal-herramientas cacao-acopio").split(
      /\s+/,
    );

// Ruido conocido que no es defecto del panel.
const IGNORE = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /Turbopack/i,
  /favicon/i,
  /webpack-hmr|_next\/static\/chunks\/.*\.hot-update/i,
];
const isNoise = (t) => IGNORE.some((r) => r.test(t));

async function dismissModal(page) {
  await page.evaluate(() => {
    try {
      for (const s of ["main", "luis", "buleje", "tienda-3"]) {
        localStorage.setItem(`onboarding-completed-${s}`, "1");
      }
      localStorage.setItem("buleje-tour-marketplace-2026-04", "1");
    } catch {}
  });
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach((el) => {
      if ((el.textContent ?? "").includes("Configura tu bodega")) el.remove();
    });
    document.body.style.overflow = "";
  });
}

async function main() {
  if (!existsSync(OUT)) await mkdir(OUT, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "x-tenant-id": SLUG },
  });
  const page = await context.newPage();

  const loginResp = await page.request.post(`${BASE}/api/auth/login`, {
    headers: { "content-type": "application/json", "x-tenant-id": SLUG },
    data: { username: USER, password: PASS, tenantSlug: SLUG },
  });
  if (loginResp.status() !== 200) {
    console.error("Login fail", loginResp.status());
    process.exit(1);
  }

  // Buffers que se vacían por tab.
  let consoleErrors = [];
  let pageErrors = [];
  let httpFails = [];

  page.on("console", (msg) => {
    if (msg.type() !== "error" && msg.type() !== "warning") return;
    const text = msg.text();
    if (isNoise(text)) return;
    consoleErrors.push({ type: msg.type(), text: text.slice(0, 400) });
  });
  page.on("pageerror", (err) => {
    pageErrors.push(String(err?.message ?? err).slice(0, 400));
  });
  page.on("response", (res) => {
    const s = res.status();
    if (s < 400) return;
    const u = res.url();
    if (isNoise(u)) return;
    httpFails.push({ status: s, url: u.replace(BASE, "").slice(0, 200) });
  });

  const results = [];
  for (let i = 0; i < TABS.length; i++) {
    const tab = TABS[i];
    consoleErrors = [];
    pageErrors = [];
    httpFails = [];

    const url = `${BASE}/t/${SLUG}/admin?tab=${tab}`;
    let navOk = true;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
    } catch (e) {
      navOk = false;
      pageErrors.push(`NAV_TIMEOUT: ${String(e?.message ?? e).slice(0, 200)}`);
    }
    await page.waitForTimeout(1500);
    await dismissModal(page);
    await page.waitForTimeout(2500);
    try {
      await page.waitForLoadState("networkidle", { timeout: 8_000 });
    } catch {}

    // ¿Se ve el error boundary o una pantalla vacía?
    const diag = await page.evaluate(() => {
      const body = document.body.innerText ?? "";
      const main = document.querySelector("main") ?? document.body;
      const text = (main.innerText ?? "").trim();
      return {
        crashed: /Algo salió mal|Something went wrong|Application error|Error inesperado/i.test(body),
        textLen: text.length,
        nan: (body.match(/\bNaN\b/g) ?? []).length,
        undef: (body.match(/\bundefined\b/g) ?? []).length,
        infinity: (body.match(/\bInfinity\b/g) ?? []).length,
      };
    });

    const row = {
      tab,
      navOk,
      ...diag,
      pageErrors: [...pageErrors],
      consoleErrors: consoleErrors.slice(0, 8),
      consoleErrorCount: consoleErrors.length,
      httpFails: httpFails.slice(0, 10),
      httpFailCount: httpFails.length,
    };
    results.push(row);

    const flags = [
      row.crashed ? "CRASH" : "",
      row.pageErrors.length ? `EXC:${row.pageErrors.length}` : "",
      row.httpFailCount ? `HTTP:${row.httpFailCount}` : "",
      row.consoleErrorCount ? `CON:${row.consoleErrorCount}` : "",
      row.nan ? `NaN:${row.nan}` : "",
      row.infinity ? `Inf:${row.infinity}` : "",
      row.textLen < 400 ? `VACIO:${row.textLen}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    console.log(`${String(i + 1).padStart(2, "0")} ${tab.padEnd(28)} ${flags || "ok"}`);

    if (row.crashed || row.pageErrors.length || row.textLen < 400) {
      await page.screenshot({ path: `${OUT}/${tab}.png` }).catch(() => {});
    }
  }

  await writeFile(`${OUT}/report.json`, JSON.stringify(results, null, 2));
  await browser.close();

  const bad = results.filter(
    (r) => r.crashed || r.pageErrors.length || r.httpFailCount || r.nan || r.infinity || r.textLen < 400,
  );
  console.log(`\n=== ${bad.length}/${results.length} tabs con hallazgos ===`);
  console.log(`report: ${OUT}/report.json`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
