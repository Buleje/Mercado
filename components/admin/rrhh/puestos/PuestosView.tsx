"use client";

/**
 * PuestosView — catálogo de puestos (ADR-414 §2). Catálogo vacío ofrece chips
 * de un clic; no se siembra nada que no se haya elegido.
 */

import { useState } from "react";
import { Briefcase, Clock, Loader2, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import { EmptyState, LoadingState } from "@buleje/design-system";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { BOTON, CLASE_CHIP, claseChipFiltro } from "../rrhh-form";
import { etiquetaModalidad, formatearPEN, pluralizar } from "../rrhh-ui";
import { cn } from "@/lib/utils";
import PuestoFormModal from "./PuestoFormModal";
import type { NivelRrhh, PuestoDTO } from "@/lib/rrhh/tipos";
import { formatNumber } from "@/lib/format";

const CHIPS = ["Motosierrista", "Ayudante de sierra", "Estibador", "Chofer", "Vigilante", "Cajero", "Almacenero"];

export default function PuestosView({ nivel }: { nivel: NivelRrhh }) {
  const { puestos, loading, error, crear, eliminar, recargar } = useRrhhPuestos();
  const { confirm, notice } = useConfirm();
  const [formAbierto, setFormAbierto] = useState<{ editar: PuestoDTO | null } | null>(null);
  const [creandoChip, setCreandoChip] = useState<string | null>(null);

  const crearDeChip = async (nombre: string) => {
    setCreandoChip(nombre);
    const res = await crear({ nombre });
    setCreandoChip(null);
    if (!res.ok) await notice({ title: "No se pudo crear el puesto", description: res.error.message, intent: "danger" });
  };

  const borrar = async (p: PuestoDTO) => {
    const ok = await confirm({ title: `¿Eliminar «${p.nombre}»?`, intent: "danger", confirmLabel: "Sí, eliminar" });
    if (!ok) return;
    const res = await eliminar(p.id);
    if (!res.ok) {
      await notice({
        title: "No se pudo eliminar",
        description: res.error.error === "puesto_en_uso" ? `Lo usan ${pluralizar(res.error.n ?? 0, "persona", "personas")} — cámbialas de puesto primero.` : (res.error.message ?? "Intenta de nuevo"),
        intent: "warning",
      });
    }
  };

  // Sólo la primera carga tapa la vista: tras crear, editar o borrar, `recargar()` hacía parpadear la grilla entera.
  if (loading && puestos.length === 0) return <LoadingState message="Cargando puestos..." />;
  if (error) return <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-prose text-sm text-[var(--text-secondary)]">
          La tarifa del puesto sólo <strong className="text-[var(--text-primary)]">prellena</strong> la de la persona — cambiarla acá no le toca el sueldo a nadie ya contratado.
        </p>
        <button type="button" onClick={() => setFormAbierto({ editar: null })} className={cn(BOTON.primario, "shrink-0")}>
          <Plus className="h-4 w-4" /> Nuevo puesto
        </button>
      </div>

      {puestos.length === 0 ? (
        <>
          <EmptyState icon={Briefcase} title="Sin puestos todavía" description="Elige uno de un clic o crea el tuyo con «Nuevo puesto»." />
          <div className="flex flex-wrap gap-2">
            {CHIPS.map((nombre) => (
              <button
                key={nombre}
                type="button"
                disabled={creandoChip !== null}
                onClick={() => crearDeChip(nombre)}
                className={claseChipFiltro(false)}
              >
                {creandoChip === nombre ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} {nombre}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {puestos.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-base font-semibold text-[var(--text-primary)]">{p.nombre}</p>
                <div className="flex shrink-0 items-center gap-1">
                  <button type="button" onClick={() => setFormAbierto({ editar: p })} className={BOTON.icono} aria-label={`Editar «${p.nombre}»`}>
                    <Pencil className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => borrar(p)}
                    className={cn(BOTON.icono, "hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]")}
                    aria-label={`Eliminar «${p.nombre}»`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <span className={cn(CLASE_CHIP, "bg-[var(--surface-sunken)] text-[var(--text-secondary)]")}>{pluralizar(p.personas, "persona", "personas")}</span>
                <span className={cn(CLASE_CHIP, "bg-[var(--surface-sunken)] font-semibold tabular-nums text-[var(--text-secondary)]")}>
                  Jornada de {formatNumber(p.horasJornada, { max: 2 })} h
                </span>
                {/* El horario se ve en la lista (ADR-417): de un vistazo se sabe a quién se le juzga sola la tardanza y a quién no. */}
                <span
                  title={p.horaEntrada ? `Entra ${p.horaEntrada}, con ${p.toleranciaMin} min de tolerancia antes de contar tardanza` : "Sin hora de entrada: la tardanza se marca a mano"}
                  className={cn(
                    CLASE_CHIP,
                    "gap-1 bg-[var(--surface-sunken)] tabular-nums",
                    p.horaEntrada ? "font-semibold text-[var(--text-secondary)]" : "text-[var(--text-tertiary)]",
                  )}
                >
                  <Clock className="h-3.5 w-3.5" aria-hidden />
                  {p.horaEntrada ? `${p.horaEntrada} · ${p.toleranciaMin} min` : "Sin horario"}
                </span>
              </div>
              {p.descripcion && <p className="text-sm text-[var(--text-tertiary)]">{p.descripcion}</p>}
              {nivel === "completo" && p.tarifaSugerida && (
                <p className="text-sm font-medium text-[var(--text-secondary)]">
                  Sugerida: <span className="text-[var(--text-primary)]">{formatearPEN(p.tarifaSugerida.monto)}</span> {etiquetaModalidad(p.tarifaSugerida.modalidad)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {formAbierto && (
        <PuestoFormModal
          open
          onClose={() => setFormAbierto(null)}
          puesto={formAbierto.editar}
          nivel={nivel}
          onGuardado={() => { setFormAbierto(null); recargar(); }}
        />
      )}
    </div>
  );
}
