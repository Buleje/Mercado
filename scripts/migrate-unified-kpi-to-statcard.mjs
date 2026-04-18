#!/usr/bin/env node
/**
 * migrate-unified-kpi-to-statcard.mjs — Sprint C4 ADR-075.
 *
 * Reemplaza <UnifiedKPITile ...props /> por <StatCard ...mapped-props /> del DS.
 *
 * Mapeo de props:
 *   label          → label
 *   value          → value
 *   Icon           → icon        (prop lowercase en StatCard)
 *   delta          → delta
 *   deltaLabel     → deltaLabel
 *   subValue       → subValue
 *   intent="danger"    → emphasis="error"
 *   intent="success"   → emphasis="success"
 *   intent="warning"   → emphasis="warning"
 *   intent="neutral"   → (omit — neutral es default)
 *   sparkline      → (dropped — StatCard no lo soporta aún)
 *   invertTrend    → (dropped — StatCard infiere trend de delta)
 *   onClick        → onClick
 *   className      → className
 *
 * También:
 *   - Remueve import de UnifiedKPITile si ya no se usa en el archivo.
 *   - Agrega import de StatCard desde @buleje/design-system si falta.
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const APPLY = process.argv.includes("--apply");

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

function migrate(source) {
  let changes = 0;

  // 1) Reemplazar <UnifiedKPITile ... /> (self-closing) con <StatCard .../>.
  //    Captura todo el bloque hasta el primer />.
  const tileRe = /<UnifiedKPITile\s+([\s\S]*?)\s*\/>/g;
  let result = source.replace(tileRe, (full, attrs) => {
    changes++;
    const newAttrs = mapAttrs(attrs);
    return `<StatCard ${newAttrs} />`;
  });

  // 2) Reemplazar <UnifiedKPITile ...>...</UnifiedKPITile> (con children — raro pero por si).
  const tileWithChildrenRe = /<UnifiedKPITile\s+([\s\S]*?)>([\s\S]*?)<\/UnifiedKPITile>/g;
  result = result.replace(tileWithChildrenRe, (full, attrs, children) => {
    changes++;
    const newAttrs = mapAttrs(attrs);
    return `<StatCard ${newAttrs}>${children}</StatCard>`;
  });

  if (changes === 0) return { result: source, changes: 0 };

  // 3) Update imports:
  //    a) Si UnifiedKPITile ya no está en el resto del código, eliminar su import.
  const stillUsed = /UnifiedKPITile/.test(result);
  if (!stillUsed) {
    // Borrar import line
    result = result.replace(
      /^import\s+\{\s*UnifiedKPITile\s*\}\s+from\s+["'][^"']+["']\s*;?\s*\n/gm,
      "",
    );
  }

  // b) Agregar import de StatCard desde DS si no está.
  const hasStatCardImport =
    /import\s+[^;]*\bStatCard\b[^;]*from\s+["']@buleje\/design-system["']/.test(result);
  if (!hasStatCardImport) {
    // Buscar import existente del DS y extender
    const dsRe = /import\s+\{([^}]+)\}\s+from\s+(["'])@buleje\/design-system\2/;
    const m = result.match(dsRe);
    if (m) {
      const names = m[1].split(",").map((s) => s.trim()).filter(Boolean);
      names.push("StatCard");
      const merged = [...new Set(names)].sort();
      result = result.replace(
        dsRe,
        `import { ${merged.join(", ")} } from "@buleje/design-system"`,
      );
    } else {
      // Agregar después de "use client"
      const useClientMatch = result.match(/^("use client";\s*\n)/);
      if (useClientMatch) {
        result = result.replace(
          useClientMatch[0],
          `${useClientMatch[0]}import { StatCard } from "@buleje/design-system";\n`,
        );
      } else {
        result = `import { StatCard } from "@buleje/design-system";\n${result}`;
      }
    }
  }

  return { result, changes };
}

function mapAttrs(attrs) {
  let out = attrs;

  // Icon=  →  icon=  (lowercase prop)
  out = out.replace(/\bIcon=/g, "icon=");

  // intent="danger"   → emphasis="error"
  out = out.replace(/\bintent=["']danger["']/g, 'emphasis="error"');
  // intent="success"  → emphasis="success"
  out = out.replace(/\bintent=["']success["']/g, 'emphasis="success"');
  // intent="warning"  → emphasis="warning"
  out = out.replace(/\bintent=["']warning["']/g, 'emphasis="warning"');
  // intent="neutral"  → (eliminar, neutral es default)
  out = out.replace(/\s*\bintent=["']neutral["']/g, "");

  // intent={expr} — ternario u otra expresión. Rename a emphasis y convertir
  // "danger" a "error" dentro del expr.
  out = out.replace(/\bintent=\{([^}]+)\}/g, (full, expr) => {
    const converted = expr.replace(/["']danger["']/g, '"error"');
    return `emphasis={${converted}}`;
  });

  // Drop sparkline={...}
  out = out.replace(/\s*sparkline=\{[^}]*\}/g, "");
  // Drop invertTrend={...}
  out = out.replace(/\s*invertTrend=\{[^}]*\}/g, "");
  out = out.replace(/\s*invertTrend\b/g, "");
  // Drop prefix={...} — StatCard no tiene prefix, se espera value como ReactNode ya formateado
  out = out.replace(/\s*prefix=\{[^}]*\}/g, "");
  out = out.replace(/\s*prefix=["'][^"']*["']/g, "");

  // Normalize whitespace
  return out.replace(/\s+/g, " ").trim();
}

const ROOTS = ["components/admin", "app/admin"];
const files = ROOTS.flatMap((r) => walk(resolve(process.cwd(), r)));
const results = [];
let total = 0;

for (const f of files) {
  // Skip el propio componente — contiene JSDoc example.
  if (/UnifiedKPITile\.tsx$/.test(f)) continue;
  const source = readFileSync(f, "utf8");
  if (!/<UnifiedKPITile\b/.test(source)) continue;
  const { result, changes } = migrate(source);
  if (changes === 0) continue;
  results.push({ file: f, after: result, changes });
  total += changes;
}

console.log(`${APPLY ? "APPLY" : "DRY RUN"} — ${results.length} archivos, ${total} <UnifiedKPITile> reemplazos`);
for (const r of results) {
  const rel = r.file.replace(process.cwd(), "").replace(/\\/g, "/").replace(/^\//, "");
  console.log(`  ${String(r.changes).padStart(3)}  ${rel}`);
}
if (APPLY) {
  for (const r of results) writeFileSync(r.file, r.after, "utf8");
}
