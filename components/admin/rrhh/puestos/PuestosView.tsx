"use client";

/**
 * PuestosView — catálogo de puestos (ADR-414 §2). Catálogo vacío ofrece chips
 * de un clic; no se siembra nada que no se haya elegido.
 */

import { useState } from "react";
import { Briefcase, Loader2, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import { EmptyState, LoadingState } from "@buleje/design-system";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { useRrhhPuestos } from "@/hooks/use-rrhh-puestos";
import { etiquetaModalidad, formatearPEN, pluralizar } from "../rrhh-ui";
import PuestoFormModal from "./PuestoFormModal";
import type { NivelRrhh, PuestoDTO } from "@/lib/rrhh/tipos";

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

  if (loading) return <LoadingState message="Cargando puestos..." />;
  if (error) return <div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--text-secondary)]">La tarifa del puesto sólo PRELLENA la de la persona — cambiarla acá no toca a nadie.</p>
        <button type="button" onClick={() => setFormAbierto({ editar: null })} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-sm font-bold text-white hover:brightness-110">
          <Plus className="h-4 w-4" /> Puesto
        </button>
      </div>

      {puestos.length === 0 && (
        <>
          <EmptyState icon={Briefcase} title="Sin puestos todavía" description="Elige uno de un clic o crea el tuyo con «+ Puesto»." />
          <div className="flex flex-wrap gap-1.5">
            {CHIPS.map((nombre) => (
              <button
                key={nombre}
                type="button"
                disabled={creandoChip !== null}
                onClick={() => crearDeChip(nombre)}
                className="inline-flex items-center gap-1 rounded-full border border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary disabled:opacity-50"
              >
                {creandoChip === nombre ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} {nombre}
              </button>
            ))}
          </div>
        </>
      )}

      <ul className="space-y-2">
        {puestos.map((p) => (
          <li key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-[var(--rule-base)] p-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{p.nombre} <span className="font-normal text-[var(--text-tertiary)]">· {pluralizar(p.personas, "persona", "personas")}</span></p>
              {p.descripcion && <p className="truncate text-xs text-[var(--text-tertiary)]">{p.descripcion}</p>}
              {nivel === "completo" && p.tarifaSugerida && (
                <p className="text-xs text-[var(--text-secondary)]">Sugerida: {formatearPEN(p.tarifaSugerida.monto)} {etiquetaModalidad(p.tarifaSugerida.modalidad)}</p>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button type="button" onClick={() => setFormAbierto({ editar: p })} className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]" title="Editar" aria-label={`Editar «${p.nombre}»`}>
                <Pencil className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => borrar(p)} className="rounded-lg p-1.5 text-[var(--text-tertiary)] hover:bg-[var(--data-error-500)]/10 hover:text-[var(--data-error-700)] dark:hover:text-[var(--data-error-500)]" title="Eliminar" aria-label={`Eliminar «${p.nombre}»`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          </li>
        ))}
      </ul>

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
