"use client";

/**
 * Socios e inversión › Socios (ADR-497): quiénes son dueños, cuánto puso cada
 * uno y qué parte les toca. La parte escrita a mano manda; la vacía se
 * reparte según el aporte (`participacion()`); si no suma 100 %, se avisa.
 */
import { useState } from "react";
import { DataTable } from "@buleje/design-system";
import { AlertTriangle, Pencil, Plus, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useConfirm } from "@/components/admin/shared/ConfirmDialog";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useSeccionPlan } from "@/hooks/use-plan-empresa";
import { participacion } from "@/lib/planificacion/calculos";
import { formatCurrency } from "@/lib/format";
import { CabeceraSeccion } from "../comun/CabeceraSeccion";
import { BarraParticipacion, porciento } from "./BarraParticipacion";
import { ROTULO_APORTE, SocioModal, type Socio } from "./SocioModal";

const ORIGEN: Record<"manual" | "aporte" | "igual", string> = {
  manual: "acordado",
  aporte: "por aporte",
  igual: "en partes iguales",
};

export function SociosTabla() {
  const { datos, cambiar, puedeEditar } = useSeccionPlan("socios");
  const { confirm } = useConfirm();
  const [editando, setEditando] = useState<Socio | null | undefined>(undefined);
  const part = participacion(datos.items);
  const parteDe = new Map(part.socios.map((p) => [p.id, p]));
  const totalAporte = datos.items.reduce((a, s) => a + s.aporte, 0);

  const guardar = (s: Socio) =>
    cambiar((prev) => {
      const existe = prev.items.some((x) => x.id === s.id);
      return { ...prev, items: existe ? prev.items.map((x) => (x.id === s.id ? s : x)) : [...prev.items, s] };
    });

  const quitar = async (s: Socio) => {
    const ok = await confirm({
      title: `¿Quitar a ${s.nombre}?`,
      description: "La inversión que figura como su aporte queda como «aporte de un socio». Puedes recuperarlo desde Versiones anteriores.",
      confirmLabel: "Quitar",
      intent: "danger",
    });
    if (ok) cambiar((prev) => ({ ...prev, items: prev.items.filter((x) => x.id !== s.id) }));
  };

  return (
    <section className="space-y-3" aria-label="Socios">
      <CabeceraSeccion
        seccion="socios"
        titulo="Socios"
        ayuda="Quiénes son dueños del negocio, cuánto puso cada uno y qué parte les toca. Si no escribes la participación, se reparte según lo que aportó cada uno."
        ejemplo="Ana pone S/ 6,000 y Luis S/ 4,000 sin escribir porcentajes: Ana tiene 60 % y Luis 40 %."
      >
        {puedeEditar ? (
          <button type="button" className={button({ variant: "primary" })} onClick={() => setEditando(null)}>
            <Plus className="h-4 w-4" aria-hidden />
            Agregar
          </button>
        ) : null}
      </CabeceraSeccion>

      {datos.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--rule-base)] p-6 text-sm text-[var(--text-secondary)]">
          Todavía no anotas socios. Si el negocio es sólo tuyo, agrégate como único socio.
        </div>
      ) : (
        <>
          <BarraParticipacion socios={part.socios} />
          {!part.cuadra ? (
            <div role="status" className="flex items-center gap-2 rounded-xl bg-[var(--data-warning-500)]/10 px-3 py-2 text-sm text-[var(--data-warning-ink)]">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden />
              <span>La participación suma {porciento(part.total)}, no 100 %.</span>
              <InfoTip
                what="Los porcentajes escritos a mano pasan de 100, o suman menos y nadie quedó vacío para repartir el resto."
                example="Corrige el porcentaje de alguno, o déjalo vacío para que se reparta según su aporte."
              />
            </div>
          ) : null}
          <DataTable aria-label="Socios">
            <thead>
              <tr>
                <th>Socio</th>
                <th>Documento</th>
                <th>Cargo</th>
                <th className="text-right">Aporte</th>
                <th>Tipo de aporte</th>
                <th className="text-right">Participación</th>
                <th className="w-12">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {datos.items.map((s) => {
                const p = parteDe.get(s.id);
                const acciones: MenuAccion[] = puedeEditar
                  ? [
                      { id: "editar", label: "Editar", icon: Pencil, onSelect: () => setEditando(s) },
                      { id: "quitar", label: "Quitar", icon: Trash2, tone: "danger", onSelect: () => void quitar(s) },
                    ]
                  : [];
                return (
                  <tr key={s.id}>
                    <td className="font-medium">{s.nombre}</td>
                    <td>{s.documento || "—"}</td>
                    <td>{s.cargo || "—"}</td>
                    <td className="text-right whitespace-nowrap tabular-nums">{formatCurrency(s.aporte)}</td>
                    <td>{ROTULO_APORTE[s.tipoAporte]}</td>
                    <td className="text-right whitespace-nowrap">
                      <span className="font-semibold tabular-nums">{p ? porciento(p.porcentaje) : "—"}</span>
                      {p ? <span className="ml-1.5 text-xs text-[var(--text-tertiary)]">{ORIGEN[p.origen]}</span> : null}
                    </td>
                    <td className="text-right">
                      {acciones.length > 0 ? <ActionMenu label={`Opciones de ${s.nombre}`} actions={acciones} soloIcono size="sm" /> : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td className="font-semibold">Total</td>
                <td />
                <td />
                <td className="text-right font-semibold whitespace-nowrap tabular-nums">{formatCurrency(totalAporte)}</td>
                <td />
                <td className="text-right font-semibold tabular-nums">{porciento(part.total)}</td>
                <td />
              </tr>
            </tfoot>
          </DataTable>
        </>
      )}

      {editando !== undefined ? (
        <SocioModal
          key={editando?.id ?? "nuevo"}
          abierto
          inicial={editando}
          porAporte={editando ? (parteDe.get(editando.id)?.porcentaje ?? null) : null}
          onCerrar={() => setEditando(undefined)}
          onGuardar={guardar}
        />
      ) : null}
    </section>
  );
}
