#!/usr/bin/env node
/**
 * Inyecta `hideHeader` prop en todos los <DashboardSection> de los
 * archivos de charts de tabs del Inicio (Ventas, Caja, Inventario,
 * Compras, Productos, Clientes).
 *
 * Estrategia: regex sobre el tag de apertura. Reemplaza:
 *   <DashboardSection\n
 * por:
 *   <DashboardSection\n          hideHeader\n
 *
 * Solo modifica si no tiene ya hideHeader.
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILES = [
  "components/admin/inicio/VentasCharts.tsx",
  "components/admin/inicio/VentasAdvancedCharts.tsx",
  "components/admin/inicio/CajaCharts.tsx",
  "components/admin/inicio/CajaAdvancedCharts.tsx",
  "components/admin/inicio/InventarioCharts.tsx",
  "components/admin/inicio/InventarioAdvancedCharts.tsx",
  "components/admin/inicio/ComprasCharts.tsx",
  "components/admin/inicio/ComprasAdvancedCharts.tsx",
  "components/admin/inicio/ProductosCharts.tsx",
  "components/admin/inicio/ProductosAdvancedCharts.tsx",
  "components/admin/inicio/ClientesCharts.tsx",
  "components/admin/inicio/ClientesAdvancedCharts.tsx",
];

let patchedTotal = 0;
for (const f of FILES) {
  let src;
  try {
    src = readFileSync(f, "utf8");
  } catch {
    console.log("skip (missing):", f);
    continue;
  }
  if (src.includes("hideHeader")) {
    console.log("skip (already patched):", f);
    continue;
  }
  const count = (src.match(/<DashboardSection\n/g) || []).length;
  if (!count) {
    console.log("no <DashboardSection> found:", f);
    continue;
  }
  const patched = src.replace(/<DashboardSection\n/g, "<DashboardSection\n          hideHeader\n");
  writeFileSync(f, patched);
  console.log(`patched ${count} <DashboardSection> in:`, f);
  patchedTotal += count;
}
console.log(`\nTotal: ${patchedTotal} sections patched.`);
