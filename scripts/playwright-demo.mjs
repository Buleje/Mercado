#!/usr/bin/env node
/**
 * scripts/playwright-demo.mjs
 *
 * Demo: muestra que Claude puede manejar un browser real via Playwright npm
 * (no necesita el MCP — puede lanzarse directo desde Bash).
 *
 * Uso:
 *   node scripts/playwright-demo.mjs <URL> <output.png>
 *
 * Ejemplo:
 *   node scripts/playwright-demo.mjs https://mercado-hazel.vercel.app /tmp/screenshot.png
 */

import { chromium } from "playwright";

const url = process.argv[2] || "https://mercado-hazel.vercel.app";
const output = process.argv[3] || "/tmp/playwright-shot.png";

console.log(`[playwright] Lanzando Chromium...`);
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
});
const page = await context.newPage();

console.log(`[playwright] Navegando a ${url}`);
const response = await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
console.log(`[playwright] Status: ${response?.status()}`);
console.log(`[playwright] Title: ${await page.title()}`);

await page.screenshot({ path: output, fullPage: false });
console.log(`[playwright] Screenshot guardado en: ${output}`);

await browser.close();
console.log(`[playwright] Listo`);
