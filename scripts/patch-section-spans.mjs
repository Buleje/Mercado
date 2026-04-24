#!/usr/bin/env node
/**
 * Inyecta `span: "full"` en DraggableItem objetos cuyo id esta en el
 * whitelist FULL_IDS. Criterio: charts que necesitan ancho horizontal
 * completo — heatmaps, series temporales largas, Pareto, forecasts,
 * cohort retention, waterfall.
 *
 * Tambien cambia `return <DraggableSections items=... storageKey=... />`
 * a `layout="grid"` si no lo tiene.
 *
 * Idempotente (skip si ya tiene span).
 */
import { readFileSync, writeFileSync } from "node:fs";

const FILES_AND_FULL_IDS = [
  {
    file: "components/admin/inicio/InventarioCharts.tsx",
    full: ["movimiento-diario", "stockout-proyeccion"],
  },
  {
    file: "components/admin/inicio/InventarioAdvancedCharts.tsx",
    full: ["abc-analysis", "salidas-stacked", "heatmap-cat-dia"],
  },
  {
    file: "components/admin/inicio/ComprasCharts.tsx",
    full: ["compras-diarias", "tendencia-mensual"],
  },
  {
    file: "components/admin/inicio/ComprasAdvancedCharts.tsx",
    full: ["pareto-proveedores", "comparativa-anual", "waterfall-deuda"],
  },
  {
    file: "components/admin/inicio/ProductosCharts.tsx",
    full: ["abc-pareto", "stock-proyeccion"],
  },
  {
    file: "components/admin/inicio/ProductosAdvancedCharts.tsx",
    full: ["heatmap-cat-dia"],
  },
  {
    file: "components/admin/inicio/ClientesCharts.tsx",
    full: ["clientes-por-dia"],
  },
  {
    file: "components/admin/inicio/ClientesAdvancedCharts.tsx",
    full: ["cohort-retention", "heatmap-actividad", "churn-risk"],
  },
];

for (const { file, full } of FILES_AND_FULL_IDS) {
  let src;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    console.log("skip (missing):", file);
    continue;
  }
  let patched = src;
  let spanCount = 0;
  for (const id of full) {
    // Match: id: "x", → add `span: "full",` right after if not present
    const idRegex = new RegExp(`(id:\\s*"${id}",)(\\s*\\n\\s*span:)?`, "g");
    patched = patched.replace(idRegex, (match, idPart, hasSpan) => {
      if (hasSpan) return match; // already has span
      spanCount++;
      return `${idPart}\n      span: "full",`;
    });
  }
  // Layout grid
  const layoutBefore = patched;
  patched = patched.replace(
    /return <DraggableSections items=\{sections\} storageKey="([^"]+)" \/>/g,
    (_m, key) => `return <DraggableSections items={sections} storageKey="${key}" layout="grid" />`,
  );
  const layoutChanged = patched !== layoutBefore;

  if (spanCount === 0 && !layoutChanged) {
    console.log("no-op:", file);
    continue;
  }
  writeFileSync(file, patched);
  console.log(`patched ${file}: ${spanCount} spans, layout=${layoutChanged ? "grid" : "unchanged"}`);
}
