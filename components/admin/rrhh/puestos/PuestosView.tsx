"use client";

/**
 * PuestosView — catálogo de puestos (ADR-414 §2). Catálogo vacío ofrece chips
 * de un clic; no se siembra nada que no se haya elegido.
 */

import { useState } from "react";
import { Briefcase, Clock, Loader2, MoreHorizontal, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import { EmptyState, LoadingState } from "@buleje/design-system";
import ActionMenu from "@/components/admin/shared/action-menu";
import EncabezadoDeVista from "../EncabezadoDeVista";
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
  /* Una fila (noche 11-10). La frase «la tarifa sólo prellena…» que iba acá
     repetía palabra por palabra la ⓘ del título: queda sólo ahí. */
  const encabezado = (
    <EncabezadoDeVista
      vista="puestos"
      acciones={
        <button type="button" onClick={() => setFormAbierto({ editar: null })} className={BOTON.primario}>
          <Plus className="h-4 w-4" aria-hidden /> Nuevo puesto
        </button>
      }
    />
  );

  if (loading && puestos.length === 0) return <div className="space-y-3">{encabezado}<LoadingState message="Cargando puestos..." /></div>;
  if (error) return <div className="space-y-3">{encabezado}<div className="rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-500)]/5 p-4 text-sm text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</div></div>;

  return (
    <div className="space-y-3">
      {encabezado}

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
                {creandoChip === nombre ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {nombre}
              </button>
            ))}
          </div>
        </>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {puestos.map((p) => (
            <div key={p.id} className="flex flex-col gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4">
              <div className="flex items-start justify-between gap-2">
                <button type="button" onClick={() => setFormAbierto({ editar: p })} className="-my-3 min-h-12 min-w-0 truncate rounded-lg text-left text-base font-semibold text-[var(--text-primary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]" title="Editar el puesto">{p.nombre}</button>
                {/* Editar y eliminar en «⋯» (antes dos íconos de 36 px por tarjeta). */}
                <ActionMenu
                  label={`Más de «${p.nombre}»`}
                  icon={MoreHorizontal}
                  soloIcono
                  size="md"
                  className="-mr-2 -mt-2 w-12 shrink-0"
                  title="Editar o eliminar"
                  actions={[
                    { id: "editar", label: "Editar", hint: "Nombre, jornada, horario y tarifa sugerida", icon: Pencil, onSelect: () => setFormAbierto({ editar: p }) },
                    { id: "eliminar", label: "Eliminar", hint: p.personas > 0 ? `Lo usan ${pluralizar(p.personas, "persona", "personas")}: cámbialas de puesto primero` : undefined, icon: Trash2, tone: "danger", onSelect: () => void borrar(p) },
                  ]}
                />
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
