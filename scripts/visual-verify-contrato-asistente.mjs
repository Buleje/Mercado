/**
 * Recorre el asistente de contratos de punta a punta con una plantilla que NO
 * define vencimiento, y comprueba que:
 *   1. el último paso pregunta hasta cuándo vale el contrato;
 *   2. al crearlo se abre su ficha (revisor, firmantes, WhatsApp), en vez de
 *      dejarte en el listado sin saber qué sigue.
 *
 * Al terminar borra el contrato de prueba.
 *
 *   node scripts/visual-verify-contrato-asistente.mjs
 */
import { chromium } from "playwright";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";

const BASE = process.env.BSM_BASE ?? "http://localhost:3000";
const SLUG = "main";
const USER = "qaadmin";
const PASS = "Qa-admin-1234";
const OUT = "reports/contratos";
/** Plantilla sin fecha de fin ni plazo: obliga a preguntar el vencimiento. */
const PLANTILLA = "Contrato de Trabajo a Plazo Indeterminado";

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
      /* storage bloqueado */
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

  await page.goto(`${BASE}/t/${SLUG}/admin?tab=documentos`, {
    waitUntil: "domcontentloaded",
    timeout: 60_000,
  });
  await page.waitForTimeout(3500);
  await page.getByRole("button", { name: /^Contratos$/i }).first().click();
  await page.waitForTimeout(2500);

  // Plantillas → la que no define vencimiento
  await page.getByRole("button", { name: /Plantillas/i }).first().click();
  await page.waitForTimeout(1500);
  await page.getByText(PLANTILLA, { exact: true }).first().click();
  await page.waitForTimeout(1500);

  // Rellenar cada paso con lo mínimo requerido y avanzar.
  for (let paso = 0; paso < 4; paso++) {
    const inputs = page.locator("input:visible, textarea:visible, select:visible");
    const n = await inputs.count();
    for (let i = 0; i < n; i++) {
      const el = inputs.nth(i);
      const tipo = await el.getAttribute("type");
      const tag = await el.evaluate((e) => e.tagName.toLowerCase());
      if (tipo === "checkbox" || tipo === "radio") continue;
      const valor = await el.inputValue().catch(() => "x");
      if (valor) continue; // ya viene autocompletado
      if (tag === "select") {
        // Los desplegables (Cargo, Jornada) también son obligatorios: sin
        // elegirlos, el asistente frena con "campos requeridos faltantes".
        const opciones = await el.locator("option").allTextContents();
        const primera = opciones.find((o) => o.trim() && !/^selecc/i.test(o) && !/^Otro/i.test(o));
        if (primera) await el.selectOption({ label: primera }).catch(() => {});
        continue;
      }
      if (tipo === "date") await el.fill("2026-09-01");
      else if (tipo === "number") await el.fill("1200");
      else await el.fill("Prueba QA asistente");
    }
    await page.getByRole("button", { name: /^Siguiente$/ }).first().click();
    await page.waitForTimeout(1200);
  }

  // Paso final: tiene que preguntar el vencimiento.
  const pregunta = page.getByText(/Hasta cuándo vale este contrato/i);
  const preguntaVisible = await pregunta.isVisible().catch(() => false);
  console.log(`¿Pregunta el vencimiento cuando la plantilla no lo trae? ${preguntaVisible ? "sí" : "NO"}`);
  await page.screenshot({ path: `${OUT}/asistente-paso-final.png`, fullPage: true });

  if (preguntaVisible) {
    await page.locator("#venc-manual").fill("2027-09-01");
    await page.waitForTimeout(400);
  }

  // Crear. OJO: los chips de los pasos también dicen "Confirmar y Generar";
  // el botón que guarda de verdad es el del pie.
  await page.getByRole("button", { name: /^Guardar Contrato$/ }).first().click();
  await page.waitForTimeout(7000);

  // Tiene que haberse abierto la ficha con los paneles nuevos.
  const ficha = await page.evaluate(() => {
    const t = document.body.innerText;
    return {
      abrio: /Contrato CONT-\d{4}-\d{4}/.test(t),
      revisor: t.includes("Qué revisar antes de firmar"),
      firmantes: t.includes("Quiénes firman"),
    };
  });
  console.log("Al terminar el asistente:");
  console.log(`  se abre la ficha del contrato: ${ficha.abrio ? "sí" : "NO"}`);
  console.log(`  con el revisor de cláusulas:   ${ficha.revisor ? "sí" : "NO"}`);
  console.log(`  con el panel de firmantes:     ${ficha.firmantes ? "sí" : "NO"}`);
  await page.screenshot({ path: `${OUT}/asistente-ficha-recien-creada.png`, fullPage: true });

  // Limpieza: borrar el contrato de prueba.
  const creados = await page.request.get(`${BASE}/api/contratos`, {
    headers: { "x-tenant-id": SLUG },
  });
  if (creados.ok()) {
    const { contratos } = await creados.json();
    const prueba = (contratos ?? []).filter((c) => /Prueba QA asistente/i.test(c.clienteNombre ?? ""));
    for (const c of prueba) {
      await page.request.delete(`${BASE}/api/contratos/${c.id}`, {
        headers: { "x-tenant-id": SLUG },
      });
    }
    console.log(`Contratos de prueba anulados: ${prueba.length}`);
  }

  await browser.close();
}

main().catch((err) => {
  console.error("Falló la verificación:", err);
  process.exitCode = 1;
});
