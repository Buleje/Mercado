/**
 * scripts/td018-update-schema.ts
 *
 * TD-018 Sprint 1 — Fase 2.5: Actualizar prisma/schema.prisma para reflejar
 * los 71 campos migrados de Float → Decimal(12,2) en producción.
 *
 * Lee el reporte JSON generado por apply-td018-alters.ts y edita el schema
 * conservando el orden, comentarios, defaults y nullability originales.
 *
 * Transformación aplicada:
 *   `  price       Float`             → `  price       Decimal @db.Decimal(12, 2)`
 *   `  costPrice   Float?`            → `  costPrice   Decimal? @db.Decimal(12, 2)`
 *   `  total       Float @default(0)` → `  total       Decimal @default(0) @db.Decimal(12, 2)`
 *
 * Run: npx tsx scripts/td018-update-schema.ts
 *
 * Nota: después de correr este script, correr:
 *   npx prisma format
 *   npx prisma validate
 *   npx prisma generate
 */

import fs from "node:fs";
import path from "node:path";

type ApplyReport = {
  timestamp: string;
  results: Array<{
    table: string;
    column: string;
    status: "applied" | "skipped-drift" | "already-decimal" | "failed";
    before_type?: string;
    after_type?: string;
  }>;
};

function findLatestReport(): string {
  const docsDir = path.resolve(process.cwd(), "docs");
  const files = fs
    .readdirSync(docsDir)
    .filter((f) => f.startsWith("td018-apply-report-") && f.endsWith(".json"))
    .sort()
    .reverse();
  if (files.length === 0) throw new Error("No apply report found");
  return path.join(docsDir, files[0]);
}

function updateSchemaField(
  schemaContent: string,
  modelName: string,
  columnName: string,
): { newContent: string; changed: boolean } {
  const lines = schemaContent.split("\n");
  let inModel = false;
  let changed = false;

  const modelStartRegex = new RegExp(`^model\\s+${modelName}\\s*\\{`);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (modelStartRegex.test(line)) {
      inModel = true;
      continue;
    }

    if (inModel && line.trim().startsWith("}")) {
      inModel = false;
      continue;
    }

    if (!inModel) continue;

    // Match: indent + columnName + whitespace + Float[?] + optional rest
    // Ejemplos:
    //   `  price       Float`
    //   `  costPrice   Float?`
    //   `  total       Float @default(0)`
    //   `  total       Float           @default(0) @map("x")`
    const fieldRegex = new RegExp(
      `^(\\s+)${columnName}(\\s+)Float(\\??)(\\s*(?:@.*)?)?$`,
    );
    const match = line.match(fieldRegex);
    if (match) {
      const [, indent, spaces, nullable, rest = ""] = match;
      // Construir la línea nueva con Decimal @db.Decimal(12, 2)
      // Si hay rest (defaults, maps, etc.) lo mantenemos ANTES del @db.Decimal
      const trimmedRest = rest.trim();
      const newLine = trimmedRest
        ? `${indent}${columnName}${spaces}Decimal${nullable} ${trimmedRest} @db.Decimal(12, 2)`
        : `${indent}${columnName}${spaces}Decimal${nullable} @db.Decimal(12, 2)`;
      lines[i] = newLine;
      changed = true;
      break; // asumimos 1 match por (modelo, columna)
    }
  }

  return { newContent: lines.join("\n"), changed };
}

async function main() {
  console.log("🔧 TD-018 Fase 2.5 — Actualizar schema.prisma con los 71 Decimal migrados\n");

  const reportPath = findLatestReport();
  console.log(`📄 Reporte: ${path.basename(reportPath)}\n`);

  const report: ApplyReport = JSON.parse(fs.readFileSync(reportPath, "utf8"));
  const applied = report.results.filter((r) => r.status === "applied");
  console.log(`   ${applied.length} campos aplicados en el reporte\n`);

  const schemaPath = path.resolve(process.cwd(), "prisma", "schema.prisma");
  let schemaContent = fs.readFileSync(schemaPath, "utf8");

  const updated: string[] = [];
  const notFound: string[] = [];

  for (const r of applied) {
    const result = updateSchemaField(schemaContent, r.table, r.column);
    if (result.changed) {
      schemaContent = result.newContent;
      updated.push(`${r.table}.${r.column}`);
    } else {
      notFound.push(`${r.table}.${r.column}`);
    }
  }

  fs.writeFileSync(schemaPath, schemaContent);

  console.log(`✅ Actualizados: ${updated.length}`);
  console.log(`⚠️  No encontrados en schema: ${notFound.length}\n`);

  if (notFound.length > 0) {
    console.log("   Campos que NO se pudieron actualizar (revisar manualmente):");
    for (const f of notFound) console.log(`     · ${f}`);
    console.log("");
  }

  console.log("📌 Próximo paso:");
  console.log("   1. npx prisma format");
  console.log("   2. npx prisma validate");
  console.log("   3. npx prisma generate");
  console.log("   4. npx tsc --noEmit  (esperar errores de asignación number = Decimal)");
}

main().catch((err) => {
  console.error("❌ Error fatal:", err);
  process.exit(1);
});
