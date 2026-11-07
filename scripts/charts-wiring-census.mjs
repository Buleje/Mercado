#!/usr/bin/env node
/**
 * scripts/charts-wiring-census.mjs — quién importa recharts directo y quién ya usa el wrapper lazy.
 *
 * Reemplaza la lista escrita a mano de components/charts/WIRING.md (abril 2026), que al 22-09
 * mandaba a 2 archivos ya borrados y a 5 que se habían migrado por otra vía (un sub-componente
 * cargado con `next/dynamic`, que logra el mismo split sin pasar por LazyChart).
 *
 * OJO con el grep ingenuo: 38 de los 58 importan recharts en varias líneas
 * (`import {\n  BarChart,\n ...\n} from "recharts"`), así que un patrón anclado en `^import {...}`
 * de una sola línea cuenta 19 y miente. Acá se lee el archivo entero.
 */
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const PESADOS = ["BarChart", "LineChart", "PieChart", "AreaChart", "ComposedChart",
                 "RadarChart", "RadialBarChart", "ScatterChart", "Treemap", "FunnelChart", "Sankey"];

const files = execSync(
  `grep -rl 'from "recharts"' app components --include='*.tsx' || true`,
  { encoding: "utf8" },
).trim().split("\n").filter(Boolean);

const filas = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  const bloque = src.match(/import\s*\{[\s\S]*?\}\s*from\s*["']recharts["']/g)?.join(" ") ?? "";
  const pesados = PESADOS.filter((c) => new RegExp(`\\b${c}\\b`).test(bloque));
  if (!pesados.length) continue;
  filas.push({
    f,
    pesados,
    lineas: src.split("\n").length,
    yaLazy: src.includes('from "@/components/charts"'),
    // un `dynamic()` propio en el mismo archivo ya difiere el chart: no necesita el wrapper
    dynamicPropio: /dynamic\(\s*\(\)\s*=>/.test(src),
  });
}

const pendientes = filas.filter((r) => !r.yaLazy && !r.dynamicPropio);
console.log(`📊 ${files.length} archivos importan recharts · ${filas.length} traen un contenedor pesado`);
console.log(`   ya resueltos: ${filas.length - pendientes.length} (wrapper LazyChart o dynamic() propio)`);
console.log(`   PENDIENTES:   ${pendientes.length}\n`);
console.log("── pendientes, los más grandes primero ──");
for (const r of pendientes.sort((a, b) => b.lineas - a.lineas)) {
  console.log(`${String(r.lineas).padStart(5)} L  ${r.f}`);
  console.log(`          ${r.pesados.join(", ")}`);
}
