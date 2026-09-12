"use client";

/**
 * ForestalHerramientas — hub de herramientas especializadas forestales
 * (especialización `spec:forestal:herramientas`, ADR-124). Contenedor extensible:
 * hoy trae el cubicador de madera por voz; se le suman más herramientas como
 * sub-vistas sin tocar el cableado del sidebar.
 */
import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { Wrench, Calculator, Activity, Ruler, Gauge, BarChart3, Trees, Camera } from "@buleje/design-system/icons";
import LibroChrome, { type LibroGroup } from "@/components/admin/shared/libro-chrome";
import { TOOL_ONCE_STORAGE_KEY } from "@/lib/forestal/sembrar-reparto";

const cargando = (
  <div className="flex h-64 items-center justify-center rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-tertiary)]">
    <Activity className="mr-2 h-5 w-5 animate-pulse" /> Cargando herramienta…
  </div>
);
const CubicadorMadera = dynamic(() => import("./CubicadorMadera"), { ssr: false, loading: () => cargando });
const CubicadorTrozas = dynamic(() => import("./CubicadorTrozas"), { ssr: false, loading: () => cargando });
const CalculadoraRendimiento = dynamic(() => import("./CalculadoraRendimiento"), { ssr: false, loading: () => cargando });
const CubicacionResumenes = dynamic(() => import("./CubicacionResumenes"), { ssr: false, loading: () => cargando });
const EspeciesFotosBiblioteca = dynamic(() => import("./EspeciesFotosBiblioteca"), { ssr: false, loading: () => cargando });
const CamarasView = dynamic(() => import("./CamarasView"), { ssr: false, loading: () => cargando });

type Tool = "cubicador" | "trozas" | "rendimiento" | "resumenes" | "especies" | "camaras";
const HERRAMIENTAS_MODULE_ID = "forestal-herramientas";
/** Salto de una sola vez desde otro módulo (ej. «Resumen por permiso» en
 *  Consumo o «Llevar al cubicador» en Capacidad de la planta, que siembran
 *  bloques de rolliza y quieren abrir directo en Resúmenes). Se lee y se
 *  borra: no es la pestaña que se recuerda de ahí en más, sólo la de ESTA
 *  visita. La escribe `abrirResumenesDelCubicador()`. */
export const TOOL_ONCE_KEY = TOOL_ONCE_STORAGE_KEY;
const TOOLS: { key: Tool; label: string; icon: typeof Calculator; hint: string }[] = [
  { key: "cubicador", label: "Cubicador de madera", icon: Calculator, hint: "Aserrada: pie tablar + m³ por voz" },
  { key: "trozas", label: "Cubicador de trozas", icon: Ruler, hint: "Rolliza: Smalian en patio, contra la GTF" },
  { key: "resumenes", label: "Resúmenes", icon: BarChart3, hint: "Tablas por especie y tipo del lote cubicado" },
  { key: "rendimiento", label: "Rendimiento", icon: Gauge, hint: "Coeficiente de aserrío (%) con tu histórico del Libro" },
  { key: "especies", label: "Fotos de especies", icon: Trees, hint: "Referencia visual para no confundir dos maderas parecidas" },
  { key: "camaras", label: "Cámaras", icon: Camera, hint: "Lo que la cámara del patio mandó, con su hora" },
];
// Un solo grupo: la cabina dibuja las herramientas y omite la fila de fases
// (misma pieza que los libros — el módulo se ve parte de la misma familia).
const TOOL_GROUPS: LibroGroup[] = [
  { id: "herramientas", label: "Herramientas", views: TOOLS.map((t) => ({ key: t.key, label: t.label, icon: t.icon, hint: t.hint })) },
];

export default function ForestalHerramientas() {
  const [tool, setTool] = useState<Tool>("cubicador");

  /**
   * El salto de una sola vez se consume en un EFECTO, no en el initializer del
   * `useState` (bug real, encontrado 2026-09-08 llevando madera desde Saldos).
   *
   * Leer-y-borrar dentro del initializer parece equivalente, pero en desarrollo
   * React lo invoca DOS veces: la primera lectura devolvía «resumenes» y
   * borraba la clave, y el estado que quedaba era el de la segunda —que ya no
   * encontraba nada— así que la herramienta abría en el cubicador y el salto se
   * perdía en silencio. Un initializer no puede tener efectos secundarios.
   */
  useEffect(() => {
    try {
      const v = sessionStorage.getItem(TOOL_ONCE_KEY);
      if (!v) return;
      sessionStorage.removeItem(TOOL_ONCE_KEY);
      if (TOOLS.some((t) => t.key === v)) setTool(v as Tool);
    } catch {
      /* sin sessionStorage se abre la herramienta por defecto */
    }
  }, []);

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
        {tool === "camaras" && <CamarasView />}
      </div>
    </LibroChrome>
  );
}
