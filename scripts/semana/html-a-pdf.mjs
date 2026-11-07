#!/usr/bin/env node
/**
 * html-a-pdf.mjs — convierte un HTML en PDF A4 con el Chromium de Playwright
 * (revisión de los domingos, Brandon 28-10-2026). Sin servidor: el HTML va
 * entero en el archivo (estilos incluidos).
 *
 * Uso: node scripts/semana/html-a-pdf.mjs <entrada.html> <salida.pdf>
 */
import { readFileSync, statSync } from "node:fs";
import { chromium } from "playwright";
import { resolverChromium } from "../dev-helpers/chromium-path.mjs";

const [entrada, salida] = process.argv.slice(2);
if (!entrada || !salida) {
  console.error("Uso: node scripts/semana/html-a-pdf.mjs <entrada.html> <salida.pdf>");
  process.exit(2);
}
const navegador = await chromium.launch({ executablePath: resolverChromium() ?? undefined });
try {
  const pagina = await navegador.newPage();
  await pagina.setContent(readFileSync(entrada, "utf8"), { waitUntil: "load" });
  await pagina.pdf({ path: salida, format: "A4", printBackground: true, margin: { top: "14mm", bottom: "14mm", left: "12mm", right: "12mm" } });
  console.log(JSON.stringify({ ok: true, salida, kb: Math.round(statSync(salida).size / 1024) }));
} finally {
  await navegador.close();
}
