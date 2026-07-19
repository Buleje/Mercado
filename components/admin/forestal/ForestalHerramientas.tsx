"use client";

/**
 * ForestalHerramientas — hub de herramientas especializadas forestales
 * (especialización `spec:forestal:herramientas`, ADR-124). Contenedor extensible:
 * hoy trae el cubicador de madera por voz; se le suman más herramientas como
 * sub-vistas sin tocar el cableado del sidebar.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { Wrench, Calculator, Activity } from "@buleje/design-system/icons";
import AdminModuleHeader from "@/components/admin/shared/AdminModuleHeader";
import AdminTabBar from "@/components/admin/shared/AdminTabBar";

const CubicadorMadera = dynamic(() => import("./CubicadorMadera"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-tertiary)]">
      <Activity className="mr-2 h-5 w-5 animate-pulse" /> Cargando cubicador…
    </div>
  ),
});

type Tool = "cubicador";
const HERRAMIENTAS_MODULE_ID = "forestal-herramientas";
const TOOLS: { key: Tool; label: string; icon: typeof Calculator; hint: string }[] = [
  { key: "cubicador", label: "Cubicador de madera", icon: Calculator, hint: "Pie tablar + m³ por voz" },
];
const TOOL_TAB_ITEMS = TOOLS.map((t) => ({ id: t.key, label: t.label, icon: t.icon, title: t.hint }));

export default function ForestalHerramientas() {
  const [tool, setTool] = useState<Tool>("cubicador");

  return (
    <div className="space-y-6">
      <AdminModuleHeader
        eyebrow="Forestal · Herramientas"
        title="Herramientas Forestales"
        description="Utilidades especializadas para el negocio forestal. Empezá dictando medidas al cubicador; se sumarán más herramientas acá."
        icon={Wrench}
      />

      {/* Sub-nav de herramientas — AdminTabBar (coherente con el resto del admin).
          Con una sola herramienta el reorden por drag no aplica todavía. */}
      <AdminTabBar
        moduleId={HERRAMIENTAS_MODULE_ID}
        tabs={TOOL_TAB_ITEMS}
        activeTab={tool}
        onTabChange={(id) => setTool(id as Tool)}
        draggable={TOOLS.length > 1}
        rightSlot={
          <span className="hidden text-[length:var(--ts-2xs)] italic text-[var(--text-tertiary)] sm:inline">
            más herramientas pronto
          </span>
        }
      />

      <div className="mt-6">{tool === "cubicador" && <CubicadorMadera />}</div>
    </div>
  );
}
