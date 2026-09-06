"use client";

/**
 * UnificarDuplicadosModal — borrar las copias de un gasto fijo.
 *
 * El panel ya detectaba que el alquiler estaba cargado dos veces y lo avisaba
 * («revisá el catálogo para no pagarlos doble»), pero el arreglo había que
 * hacerlo a mano en otra pestaña, borrando una por una. El riesgo del que
 * avisaba —pagar dos veces el mismo alquiler— seguía ahí después de leerlo.
 *
 * Se borran SÓLO las plantillas repetidas. Los pagos ya registrados son otros
 * registros (`recurring: false`) y no se tocan: el historial no cambia.
 */

import { useState } from "react";
import { undoToast } from "@buleje/design-system";
import { AlertTriangle, Copy, Loader2, Trash2 } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { borrarGasto, restaurarGasto, type GastoBorrado } from "./restaurar";
import { fmt } from "./shared";

export type GrupoRepetido = {
  /** Id de la plantilla que se conserva — la que ya se ve en el panel. */
  conservar: string;
  nombre: string;
  amount: number;
  /** Ids de las copias a borrar. */
  sobrantes: string[];
};

export default function UnificarDuplicadosModal({
  grupos, onListo, onClose,
}: {
  grupos: GrupoRepetido[];
  onListo: () => void;
  onClose: () => void;
}) {
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const aBorrar = grupos.flatMap((g) => g.sobrantes);

  const confirmar = async () => {
    setBorrando(true);
    setError(null);
    // `allSettled` y no `all`: si una copia falla, las otras ya se borraron y
    // hay que recargar igual para que el panel muestre el estado real.
    const res = await Promise.allSettled(aBorrar.map((id) => borrarGasto(id)));
    const fallaron = res.filter((r) => r.status === "rejected").length;
    setBorrando(false);
    if (fallaron > 0) {
      setError(
        fallaron === aBorrar.length
          ? "No se pudo borrar ninguna copia. Intentá de nuevo."
          : `Se borraron ${aBorrar.length - fallaron} de ${aBorrar.length}. Volvé a intentar con las que quedan.`,
      );
      onListo();
      return;
    }

    // Cada copia borrada vuelve con todos sus campos si el usuario se
    // arrepiente: `borrarGasto` devuelve el registro completo, no un id suelto.
    const restaurables = res
      .filter((r): r is PromiseFulfilledResult<GastoBorrado> => r.status === "fulfilled")
      .map((r) => r.value)
      .filter(Boolean);

    onListo();
    onClose();
    undoToast({
      message: `${aBorrar.length} ${aBorrar.length === 1 ? "copia borrada" : "copias borradas"}`,
      description: grupos.map((g) => g.nombre).join(", "),
      onUndo: async () => {
        try {
          await Promise.all(restaurables.map((g) => restaurarGasto(g)));
          onListo();
        } catch (err) {
          console.warn("[UnificarDuplicadosModal] restaurar falló", err);
        }
      },
    });
  };

  return (
    <AdminModal
      open
      onClose={borrando ? () => {} : onClose}
      variant="default"
      icon={Copy}
      title="Unificar gastos repetidos"
      description={`${grupos.length} ${grupos.length === 1 ? "gasto cargado" : "gastos cargados"} más de una vez`}
      footer={
        <div className="flex items-center justify-end gap-2 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={borrando}
            className="inline-flex h-11 items-center rounded-xl border-2 border-[var(--rule-base)] px-4 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={confirmar}
            disabled={borrando}
            className="inline-flex h-11 items-center gap-1.5 rounded-xl bg-[var(--data-error-500)] px-4 text-sm font-bold text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {borrando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Trash2 className="h-4 w-4" aria-hidden />}
            {borrando
              ? "Borrando…"
              : `Borrar ${aBorrar.length} ${aBorrar.length === 1 ? "copia" : "copias"}`}
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-base text-[var(--text-primary)]">
          De cada gasto queda <span className="font-bold">uno solo</span>. Esto no cambia lo que ya
          pagaste: sólo saca las fichas repetidas del catálogo.
        </p>

        <ul className="space-y-2">
          {grupos.map((g) => (
            <li
              key={g.conservar}
              className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2.5"
            >
              <div className="min-w-0">
                <p className="truncate text-base font-bold text-[var(--text-primary)]">{g.nombre}</p>
                <p className="text-sm text-[var(--text-secondary)]">
                  Queda 1 · se {g.sobrantes.length === 1 ? "borra" : "borran"}{" "}
                  {g.sobrantes.length} {g.sobrantes.length === 1 ? "copia" : "copias"}
                </p>
              </div>
              <span className="shrink-0 font-bold tabular-nums text-[var(--text-primary)]">
                {fmt(g.amount)}
              </span>
            </li>
          ))}
        </ul>

        <div className="flex items-start gap-2 rounded-xl border-2 border-[var(--data-warning-500)]/40 bg-[var(--data-warning-500)]/10 px-3 py-2.5">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-500)]" aria-hidden />
          <p className="text-sm text-[var(--text-primary)]">
            Vas a tener 5 segundos para deshacerlo. Pasados esos, las fichas repetidas quedan
            borradas del catálogo.
          </p>
        </div>

        {error && (
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--data-error-500)]" role="alert">
            <AlertTriangle className="h-4 w-4" aria-hidden />{error}
          </p>
        )}
      </div>
    </AdminModal>
  );
}
