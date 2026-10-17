"use client";

/**
 * Herramientas › Planillas de campo (17-10). Las hojas que se imprimen para
 * anotar a mano en el monte, el patio y el aserradero, agrupadas por dónde se
 * llenan. Cada una trae su Excel, el prompt con que la IA lee su foto y el
 * camino a su importador. No son los «Formatos» (esos son trámites SERFOR).
 */
import { useState } from "react";
import { m as motion } from "framer-motion";
import { SectionTitle } from "@buleje/design-system";
import { Axe, Loader2, Mountain, RotateCcw, Warehouse, type LucideIcon } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { VistaHeader } from "@/components/admin/shared/module-primitives";
import { staggerChild, staggerContainer } from "@/components/ui-system/motion";
import { useTenant } from "@/contexts/tenant-context";
import type { PlanillaCampo, PlanillaId } from "@/lib/forestal/planillas/tipos";
import TarjetaPlanilla from "./TarjetaPlanilla";
import VentanaPrompt from "./VentanaPrompt";
import { usePlanillas } from "./use-planillas";

const GRUPOS: { para: PlanillaCampo["para"]; titulo: string; icono: LucideIcon; ayuda: string }[] = [
  { para: "bosque", titulo: "En el bosque", icono: Mountain, ayuda: "Se llenan en la parcela de corta, árbol por árbol." },
  { para: "patio", titulo: "En el patio", icono: Warehouse, ayuda: "Se llenan con las trozas en el patio o recién llegadas del monte." },
  { para: "aserradero", titulo: "En el aserradero", icono: Axe, ayuda: "Se llenan al pie de la sierra o al cubicar la madera aserrada." },
];

const GRILLA = "grid gap-3 md:grid-cols-2 xl:grid-cols-3";

export default function PlanillasDeCampo({ onIrA }: { onIrA: (vista: "cubicador" | "trozas") => void }) {
  const { planillas, guardados, cargando, error, recargar, alCambiarPrompt } = usePlanillas();
  const { branding } = useTenant();
  const [abierta, setAbierta] = useState<PlanillaId | null>(null);
  const enVentana = abierta ? planillas.find((p) => p.id === abierta) : undefined;

  return (
    <div className="space-y-5">
      <VistaHeader
        titulo="Planillas de campo"
        meta={`${planillas.length} hojas`}
        hint="Hojas para anotar a mano donde no hay computadora. Imprímela, llénala, tómale foto y la IA pasa las filas al sistema; revisas antes de guardar. Si prefieres digitar, baja el Excel con las mismas columnas."
      />

      {cargando && (
        <p className="flex items-center gap-2 text-sm text-[var(--text-secondary)]" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Leyendo los prompts de tu negocio…
        </p>
      )}
      {error && (
        <p role="alert" className="flex flex-wrap items-center gap-2 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          No se pudieron leer tus prompts ({error}); se muestran los de fábrica.
          <button type="button" onClick={recargar} className="inline-flex min-h-11 items-center gap-1.5 font-semibold underline underline-offset-2">
            <RotateCcw className="h-4 w-4" aria-hidden /> Reintentar
          </button>
        </p>
      )}

      {GRUPOS.map((g) => {
        const lista = planillas.filter((p) => p.para === g.para);
        if (lista.length === 0) return null;
        return (
          <section key={g.para} className="space-y-3" aria-labelledby={`planillas-${g.para}`}>
            <div className="flex flex-wrap items-center gap-1.5 border-b-2 border-[var(--rule-soft)] pb-2">
              <g.icono className="h-4 w-4 text-[var(--text-secondary)]" aria-hidden />
              <SectionTitle as="h3" id={`planillas-${g.para}`} className="text-sm font-bold text-[var(--text-primary)]">
                {g.titulo}
              </SectionTitle>
              <span className="font-mono text-xs tabular-nums text-[var(--text-tertiary)]">{lista.length}</span>
              <InfoTip title={g.titulo} what={g.ayuda} />
            </div>
            <motion.div variants={staggerContainer} initial="hidden" animate="show" className={GRILLA}>
              {lista.map((p) => (
                <motion.div key={p.id} variants={staggerChild} className="min-w-0">
                  <TarjetaPlanilla
                    planilla={p}
                    guardado={guardados[p.id] ?? null}
                    negocio={branding.name ?? ""}
                    onPrompt={() => setAbierta(p.id)}
                    onIrAVista={onIrA}
                  />
                </motion.div>
              ))}
            </motion.div>
          </section>
        );
      })}

      {enVentana && (
        <VentanaPrompt
          planilla={enVentana}
          guardado={guardados[enVentana.id] ?? null}
          onCambio={(g) => alCambiarPrompt(enVentana.id, g)}
          onCerrar={() => setAbierta(null)}
        />
      )}
    </div>
  );
}
