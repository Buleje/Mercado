"use client";

/**
 * ForestalHerramientas — hub de herramientas especializadas forestales
 * (especialización `spec:forestal:herramientas`, ADR-124). Contenedor extensible:
 * hoy trae el cubicador de madera por voz; se le suman más herramientas como
 * sub-vistas sin tocar el cableado del sidebar.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { Wrench, Calculator, Activity, Ruler, Gauge, BarChart3, Trees } from "@buleje/design-system/icons";
import LibroChrome, { type LibroGroup } from "@/components/admin/shared/libro-chrome";

const cargando = (
  <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-tertiary)]">
    <Activity className="mr-2 h-5 w-5 animate-pulse" /> Cargando herramienta…
  </div>
);
const CubicadorMadera = dynamic(() => import("./CubicadorMadera"), { ssr: false, loading: () => cargando });
const CubicadorTrozas = dynamic(() => import("./CubicadorTrozas"), { ssr: false, loading: () => cargando });
const CalculadoraRendimiento = dynamic(() => import("./CalculadoraRendimiento"), { ssr: false, loading: () => cargando });
const CubicacionResumenes = dynamic(() => import("./CubicacionResumenes"), { ssr: false, loading: () => cargando });
const EspeciesFotosBiblioteca = dynamic(() => import("./EspeciesFotosBiblioteca"), { ssr: false, loading: () => cargando });

type Tool = "cubicador" | "trozas" | "rendimiento" | "resumenes" | "especies";
const HERRAMIENTAS_MODULE_ID = "forestal-herramientas";
/** Salto de una sola vez desde otro módulo (ej. «Resumen por permiso» en
 *  Consumo, que siembra bloques de rolliza y quiere abrir directo en
 *  Resúmenes). Se lee y se borra: no es la pestaña que se recuerda de ahí en
 *  más, sólo la de ESTA visita. */
export const TOOL_ONCE_KEY = "buleje-herramientas-tool-once";
const TOOLS: { key: Tool; label: string; icon: typeof Calculator; hint: string }[] = [
  { key: "cubicador", label: "Cubicador de madera", icon: Calculator, hint: "Aserrada: pie tablar + m³ por voz" },
  { key: "trozas", label: "Cubicador de trozas", icon: Ruler, hint: "Rolliza: Smalian en patio, contra la GTF" },
  { key: "resumenes", label: "Resúmenes", icon: BarChart3, hint: "Tablas por especie y tipo del lote cubicado" },
  { key: "rendimiento", label: "Rendimiento", icon: Gauge, hint: "Coeficiente de aserrío (%) con tu histórico del Libro" },
  { key: "especies", label: "Fotos de especies", icon: Trees, hint: "Referencia visual para no confundir dos maderas parecidas" },
];
// Un solo grupo: la cabina dibuja las herramientas y omite la fila de fases
// (misma pieza que los libros — el módulo se ve parte de la misma familia).
const TOOL_GROUPS: LibroGroup[] = [
  { id: "herramientas", label: "Herramientas", views: TOOLS.map((t) => ({ key: t.key, label: t.label, icon: t.icon, hint: t.hint })) },
];

export default function ForestalHerramientas() {
  const [tool, setTool] = useState<Tool>(() => {
    if (typeof window === "undefined") return "cubicador";
    try {
      const v = sessionStorage.getItem(TOOL_ONCE_KEY);
      sessionStorage.removeItem(TOOL_ONCE_KEY);
      if (v && TOOLS.some((t) => t.key === v)) return v as Tool;
    } catch { /* ignore */ }
    return "cubicador";
  });

  return (
    <LibroChrome
      moduleId={HERRAMIENTAS_MODULE_ID}
      eyebrow="Forestal · Herramientas"
      title="Herramientas Forestales"
      icon={Wrench}
      groups={TOOL_GROUPS}
      view={tool}
      onView={(v) => setTool(v as Tool)}
    >
      <div>
        {tool === "cubicador" && <CubicadorMadera />}
        {tool === "trozas" && <CubicadorTrozas />}
        {tool === "resumenes" && <CubicacionResumenes />}
        {tool === "rendimiento" && <CalculadoraRendimiento />}
        {tool === "especies" && <EspeciesFotosBiblioteca />}
      </div>
    </LibroChrome>
  );
}
