#!/usr/bin/env node
// Renderiza public/founders/plan-fundador.html → public/founders/plan-fundador.pdf
// usando Playwright (chromium ya disponible). Output A4, 1 página.

import { chromium } from "playwright";
import path from "node:path";
import { pathToFileURL } from "node:url";
import fs from "node:fs/promises";

const root = process.cwd();
const htmlPath = path.join(root, "public/founders/plan-fundador.html");
const pdfPath = path.join(root, "public/founders/plan-fundador.pdf");

await fs.access(htmlPath);

// Playwright local apunta a chromium-1214 pero solo está chromium-1208 instalado.
// Usamos el binario disponible explícitamente.
const PW_CHROME = process.env.PW_CHROMIUM_PATH ?? `${process.env.HOME}/.cache/ms-playwright/chromium-1208/chrome-linux64/chrome`;
const browser = await chromium.launch({ executablePath: PW_CHROME });
const page = await browser.newPage();
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
await page.emulateMedia({ media: "print" });
await page.pdf({
  path: pdfPath,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();

const stat = await fs.stat(pdfPath);
console.log(`✓ PDF generado · ${pdfPath} · ${(stat.size / 1024).toFixed(1)} KB`);
