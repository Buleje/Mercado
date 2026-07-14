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

const CubicadorMadera = dynamic(() => import("./CubicadorMadera"), {
  ssr: false,
  loading: () => (
    <div className="flex h-64 items-center justify-center rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-sm text-[var(--text-tertiary)]">
      <Activity className="mr-2 h-5 w-5 animate-pulse" /> Cargando cubicador…
    </div>
  ),
});

type Tool = "cubicador";
const TOOLS: { key: Tool; label: string; icon: typeof Calculator; hint: string }[] = [
  { key: "cubicador", label: "Cubicador de madera", icon: Calculator, hint: "Pie tablar + m³ por voz" },
];

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

      {/* Sub-nav de herramientas (extensible: crece parejo en pantalla chica) */}
      <div className="flex flex-wrap items-center gap-2 border-b-2 border-[var(--rule-soft)] pb-3">
        {TOOLS.map((t) => {
          const Icon = t.icon;
          const active = tool === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTool(t.key)}
              title={t.hint}
              className={`inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-bold transition max-sm:grow max-sm:justify-center ${active ? "bg-[var(--accent)] text-white shadow-sm" : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"}`}
            >
              <Icon className="h-4 w-4" />
              <span>{t.label}</span>
            </button>
          );
        })}
        <span className="ml-1 hidden text-[length:var(--ts-2xs)] italic text-[var(--text-tertiary)] sm:inline">más herramientas pronto</span>
      </div>

      {tool === "cubicador" && <CubicadorMadera />}
    </div>
  );
}
