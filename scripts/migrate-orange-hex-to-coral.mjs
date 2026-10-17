#!/usr/bin/env node
/**
 * migrate-orange-hex-to-coral.mjs — Brandon 2026-06-17: "quita TODO el naranja".
 *
 * Reemplaza hex literales naranja/ámbar (charts, SVG fills, inline styles, emails)
 * por la escala CORAL de marca (#FF6B5B = --brand-secondary), preservando lightness.
 * Las CLASES tailwind amber y orange ya se remapean via @theme en globals.css;
 * este script cubre el hex hardcodeado que @theme NO alcanza.
 *
 *   node scripts/migrate-orange-hex-to-coral.mjs          # dry-run (cuenta)
 *   node scripts/migrate-orange-hex-to-coral.mjs --apply  # aplica
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const APPLY = process.argv.includes("--apply");
const ROOTS = ["app", "components", "packages"];
const EXTS = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".css"]);
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", "_archive", "_agents-archive", "generated", "dist", "build"]);
// globals.css ya migrado a mano (tokens + @theme) — no re-tocar.
const SKIP_FILES = new Set(["app/globals.css"]);

// orange/amber hex → coral por lightness (claro→oscuro). Claves en minúscula.
const MAP = {
  "#fff7ed": "#fff1ef", "#ffedd5": "#fff1ef", "#fef3c7": "#fff1ef", // 50 tints
  "#fed7aa": "#ffe1dd", "#fde68a": "#ffe1dd",                       // 100/200
  "#fdba74": "#ffa89d",                                              // 300
  "#fcd34d": "#ff8676", "#fbbf24": "#ff8676", "#fb923c": "#ff8676", // 400
  "#f59e0b": "#ff6b5b", "#f97316": "#ff6b5b",                       // 500 (los dominantes)
  "#d97706": "#f0503f", "#ea580c": "#f0503f",                       // 600
  "#b45309": "#c93b2c",                                              // 700/800
  "#92400e": "#842e25",                                              // 900
  "#78350f": "#481310",                                             // 950
};
const KEYS = Object.keys(MAP);

let filesChanged = 0, totalReplaced = 0;
const perFile = [];

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (SKIP_DIRS.has(name)) continue;
    const st = statSync(full);
    if (st.isDirectory()) { walk(full); continue; }
    if (!EXTS.has(extname(full))) continue;
    if (SKIP_FILES.has(full)) continue;
    let src = readFileSync(full, "utf8");
    let count = 0;
    for (const key of KEYS) {
      // case-insensitive: matchea #F59E0B y #f59e0b
      const re = new RegExp(key.replace("#", "#"), "gi");
      src = src.replace(re, (m) => { count++; return MAP[key]; });
    }
    if (count > 0) {
      filesChanged++; totalReplaced += count;
      perFile.push([full, count]);
      if (APPLY) writeFileSync(full, src);
    }
  }
}

for (const r of ROOTS) { try { walk(r); } catch {} }

perFile.sort((a, b) => b[1] - a[1]);
for (const [f, c] of perFile.slice(0, 20)) console.log(`  ${c.toString().padStart(4)}  ${f}`);
console.log(`\n${APPLY ? "APLICADO" : "DRY-RUN"}: ${totalReplaced} reemplazos en ${filesChanged} archivos`);
