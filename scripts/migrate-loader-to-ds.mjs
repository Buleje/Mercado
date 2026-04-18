#!/usr/bin/env node
/**
 * migrate-loader-to-ds.mjs — Sprint C3 ADR-075 addendum.
 *
 * Reemplaza patrones de loader bloque en admin por <LoadingState> del DS.
 *
 * Patrones detectados y transformados:
 *
 * 1) Block loader sin mensaje (div wrapper + Loader2 sin texto):
 *
 *    <div className="flex items-center justify-center py-12">
 *      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
 *    </div>
 *    →
 *    <LoadingState />
 *
 * 2) Block loader con texto en un <p> sibling:
 *
 *    <div className="flex flex-col items-center justify-center py-12">
 *      <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
 *      <p className="...">Cargando productos...</p>
 *    </div>
 *    →
 *    <LoadingState message="Cargando productos..." />
 *
 * 3) Block loader con <span> de texto:
 *
 *    <div className="flex items-center gap-2 py-10">
 *      <Loader2 className="h-6 w-6 animate-spin" />
 *      <span>Cargando...</span>
 *    </div>
 *    →
 *    <LoadingState message="Cargando..." />
 *
 * No toca:
 *   - Loader2 inline en botones (h-3/h-4 sin wrapper).
 *   - Loader2 dentro de componentes custom que pasan props (Icon={Loader2}).
 *   - Archivos en la whitelist (DS, store, landing, customer, tenant).
 *
 * Modos:
 *   --dry-run / --apply / --report FILE
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const REPORT_IDX = args.indexOf("--report");
const REPORT_FILE = REPORT_IDX >= 0 ? args[REPORT_IDX + 1] : null;

const EXCLUDE = [
  /packages[\\/]design-system[\\/]/,
  /components[\\/]landing[\\/]/,
  /components[\\/]store[\\/]/,
  /components[\\/]customer[\\/]/,
  /app[\\/]\(store\)[\\/]/,
  /app[\\/]marketplace[\\/]/,
  /app[\\/]t[\\/]/,
  /\.stories\.tsx?$/,
];

// Pattern 1: simple wrapper div + Loader2 big → LoadingState
// Captura multiline. El wrapper debe tener "flex" + "justify-center" o "items-center" + "py-".
// Group 1: optional text from <p> sibling.
const PATTERN_FULL = /<div\s+className=(?:"[^"]*?\bflex[^"]*?\bjustify-center[^"]*?\bpy-\d+[^"]*?"|"[^"]*?\bpy-\d+[^"]*?\bflex[^"]*?\bjustify-center[^"]*?")\s*>\s*<Loader2\s+className="[^"]*?\bh-(?:6|7|8|10|12|16)\b[^"]*?animate-spin[^"]*?"\s*\/?>\s*(?:<(?:p|span)\s+className="[^"]*?"\s*>([^<]+?)<\/(?:p|span)>)?\s*<\/div>/g;

// Simple case — no text.
const PATTERN_SIMPLE = /<div\s+className="[^"]*?flex[^"]*?justify-center[^"]*?py-\d+[^"]*?"\s*>\s*<Loader2\s+className="[^"]*?\bh-(?:6|7|8|10|12|16)\b[^"]*?animate-spin[^"]*?"\s*\/?>\s*<\/div>/g;

function transform(source) {
  let count = 0;
  let messagesInjected = 0;

  // Pass 1: full pattern with optional text.
  let result = source.replace(PATTERN_FULL, (full, text) => {
    count++;
    if (text && text.trim()) {
      messagesInjected++;
      // Escapar comillas en el texto
      const clean = text.trim().replace(/"/g, '\\"');
      return `<LoadingState message="${clean}" />`;
    }
    return `<LoadingState />`;
  });

  // Pass 2: simple pattern (no text). PATTERN_FULL probablemente ya lo cazó, pero doble check.
  result = result.replace(PATTERN_SIMPLE, (full) => {
    count++;
    return `<LoadingState />`;
  });

  return { result, count, messagesInjected };
}

function ensureLoadingStateImport(source) {
  if (/\bimport\b[^;]*\bLoadingState\b[^;]*from\s+["']@buleje\/design-system["']/.test(source)) {
    return source;
  }
  // Buscar import existente del DS y extender:
  const dsImportRe = /import\s+\{([^}]+)\}\s+from\s+(["'])@buleje\/design-system\2/;
  const match = source.match(dsImportRe);
  if (match) {
    const names = match[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!names.includes("LoadingState")) {
      names.push("LoadingState");
      const newImport = `import { ${[...new Set(names)].sort().join(", ")} } from "@buleje/design-system"`;
      return source.replace(dsImportRe, newImport);
    }
    return source;
  }
  // Agregar import nuevo después de "use client" (si existe) o tras primer import.
  const useClientMatch = source.match(/^("use client";\s*\n)/);
  if (useClientMatch) {
    return source.replace(
      useClientMatch[0],
      `${useClientMatch[0]}import { LoadingState } from "@buleje/design-system";\n`,
    );
  }
  // Al principio del archivo.
  return `import { LoadingState } from "@buleje/design-system";\n${source}`;
}

const ROOTS = ["components/admin", "components/superadmin", "app/admin", "app/superadmin"];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry === "dist") continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, acc);
    else if (st.isFile() && full.endsWith(".tsx")) acc.push(full);
  }
  return acc;
}

function main() {
  const files = ROOTS.flatMap((r) => walk(resolve(process.cwd(), r)));
  const filtered = files.filter((f) => !EXCLUDE.some((r) => r.test(f)));

  const results = [];
  let totalCount = 0;
  let totalMsgs = 0;

  for (const f of filtered) {
    const source = readFileSync(f, "utf8");
    const { result, count, messagesInjected } = transform(source);
    if (count === 0) continue;
    const finalSource = ensureLoadingStateImport(result);
    results.push({ file: f, before: source, after: finalSource, count, messagesInjected });
    totalCount += count;
    totalMsgs += messagesInjected;
  }

  const lines = [];
  lines.push(`migrate-loader-to-ds — ${APPLY ? "APPLY" : "DRY RUN"}`);
  lines.push(`Archivos escaneados: ${filtered.length}`);
  lines.push(`Archivos afectados: ${results.length}`);
  lines.push(`LoadingState injected: ${totalCount}`);
  lines.push(`Con mensaje: ${totalMsgs}`);
  lines.push("");
  lines.push("Top archivos:");
  const sorted = [...results].sort((a, b) => b.count - a.count).slice(0, 40);
  for (const r of sorted) {
    const rel = r.file.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, "");
    lines.push(`  ${String(r.count).padStart(3)}  ${rel}`);
  }
  const report = lines.join("\n");
  console.log(report);
  if (REPORT_FILE) writeFileSync(REPORT_FILE, report, "utf8");

  if (!APPLY) {
    console.log("\n(dry-run — usar --apply para escribir)");
    return;
  }
  for (const r of results) writeFileSync(r.file, r.after, "utf8");
  console.log(`\nAplicados ${totalCount} LoadingState en ${results.length} archivos.`);
}

main();
