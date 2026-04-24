#!/usr/bin/env node
/**
 * Inyecta `hideHeader` prop en todos los <DashboardSection> de
 * archivos de Ventas y Caja (NO toca Inicio).
 *
 * Estrategia: regex sobre el tag de apertura. Reemplaza:
 *   <DashboardSection\n
 * por:
 *   <DashboardSection hideHeader\n
 *
 * Solo modifica si no tiene ya hideHeader.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "components/admin/inicio/VentasCharts.tsx",
  "components/admin/inicio/VentasAdvancedCharts.tsx",
  "components/admin/inicio/CajaCharts.tsx",
  "components/admin/inicio/CajaAdvancedCharts.tsx",
];

for (const f of FILES) {
  const src = readFileSync(f, "utf8");
  if (src.includes("hideHeader")) {
    console.log("skip (already patched):", f);
    continue;
  }
  // Match <DashboardSection at start of open tag (no self-close, no existing props on same line)
  const patched = src.replace(/<DashboardSection\n/g, "<DashboardSection\n          hideHeader\n");
  if (patched === src) {
    console.log("no match:", f);
    continue;
  }
  writeFileSync(f, patched);
  const count = (src.match(/<DashboardSection\n/g) || []).length;
  console.log(`patched ${count} <DashboardSection> in:`, f);
}
