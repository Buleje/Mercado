// Script ADR-111 Fase 2 — Aplica onDelete explícito a las 45 relaciones.
// Plan documentado en docs/adr/111-ondelete-relations-audit.md.
//
// Categorías y políticas:
//  - Tenant → Cascade (offboarding limpio)
//  - Customer → SetNull (preservar histórico)
//  - Order → Cascade (items mueren con la order)
//  - Product → Restrict (no borrar producto con orders/recetas)
//  - Store → Cascade
//  - Supplier → Restrict
//  - CreditProfile → Cascade (installments)
//  - AdminUser → SetNull
//  - TreasuryCuenta → Restrict
//  - Receta → Cascade
//  - DeliveryPartner → SetNull
//  - DocumentFolder → SetNull/Cascade según relación
//  - TenantSunatConfig → Cascade
//  - WholesaleOrder → Cascade
//  - StoreProduct → Cascade

import { readFileSync, writeFileSync } from "node:fs";

const SCHEMA = "/home/usuario/proyectos/Mercado/prisma/schema.prisma";
const lines = readFileSync(SCHEMA, "utf8").split("\n");

// Map referenceModelName → policy
const POLICY = {
  Tenant: "Cascade",
  Customer: "SetNull",
  Order: "Cascade",
  WholesaleOrder: "Cascade",
  Product: "Restrict",
  Store: "Cascade",
  Supplier: "Restrict",
  CreditProfile: "Cascade",
  AdminUser: "SetNull",
  TreasuryCuenta: "Restrict",
  Receta: "Cascade",
  DeliveryPartner: "SetNull",
  TenantSunatConfig: "Cascade",
  StoreProduct: "Cascade",
};

const SPECIAL_POLICY = {
  // DocumentFolder: rel "folder" en Document → SetNull (documents quedan huérfanos)
  // DocumentFolder: rel "parent" (DocumentFolderTree) → Cascade (subfolders mueren)
  "DocumentFolder?-folder": "SetNull",
  "DocumentFolder?-parent": "Cascade",
};

let modifiedCount = 0;
const skipped = [];

const newLines = lines.map((line, idx) => {
  // Match @relation con references pero sin onDelete
  if (!/@relation\(.+references:/.test(line)) return line;
  if (/onDelete:/.test(line)) return line;

  // Detectar el modelo referenciado: "tenant Tenant @relation..." → "Tenant"
  // O con genérico: "tenant Tenant? @relation..." → "Tenant"
  // O con named: "origen TreasuryCuenta @relation("TransferenciaOrigen", ..."
  // Patrón: identificador campo, luego TipoModelo (con ? opcional), luego @relation
  const m = line.match(/^\s+(\w+)\s+(\w+)(\??)\s+@relation\(/);
  if (!m) {
    skipped.push(`L${idx + 1}: ${line.trim()}`);
    return line;
  }

  const fieldName = m[1];
  const modelName = m[2];

  // Lookup
  let policy = POLICY[modelName];

  // Special cases para DocumentFolder
  const specialKey = `${modelName}?-${fieldName}`;
  if (SPECIAL_POLICY[specialKey]) {
    policy = SPECIAL_POLICY[specialKey];
  }

  if (!policy) {
    skipped.push(`L${idx + 1}: modelo "${modelName}" sin política definida: ${line.trim()}`);
    return line;
  }

  // Inyectar onDelete antes del último `)`
  // Patrón: ", references: [id])" → ", references: [id], onDelete: Cascade)"
  const newLine = line.replace(
    /(references:\s*\[[^\]]+\])(\s*\))/,
    `$1, onDelete: ${policy}$2`,
  );

  if (newLine === line) {
    skipped.push(`L${idx + 1}: NO se modificó (regex no match): ${line.trim()}`);
    return line;
  }

  modifiedCount++;
  return newLine;
});

console.log(`✅ ${modifiedCount} relaciones modificadas`);
console.log(`⚠️  ${skipped.length} relaciones skipeadas:`);
skipped.forEach((s) => console.log("   " + s));

if (process.argv.includes("--write")) {
  writeFileSync(SCHEMA, newLines.join("\n"));
  console.log("\n💾 Schema escrito a disco");
} else {
  console.log("\n(dry-run, usar --write para aplicar)");
}
