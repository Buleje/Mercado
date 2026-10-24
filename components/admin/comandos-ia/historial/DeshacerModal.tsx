"use client";

import { useEffect, useState } from "react";
import { Loader2, Undo2, AlertTriangle } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cuandoLima, deshacerPrecios, type ReciboIA, type ResultadoDeshacer } from "./use-recibos";
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from "../papel/formato";

interface Props {
  /** El recibo `precios` a deshacer; `null` = cerrado. */
  recibo: ReciboIA | null;
  onClose: () => void;
  /** Se deshizo: el padre recarga la lista y avisa. */
  onHecho: (recibo: ReciboIA, r: Extract<ResultadoDeshacer, { ok: true }>) => void;
  /** La lista quedó vieja (el cambio ya no existe o alguien tocó un precio): el padre la recarga detrás. */
  onDesactualizado?: () => void;
}

/** Confirma el Deshacer de un cambio de precios en bloque (lo ejecuta la ruta del carril de precios). */
export default function DeshacerModal({ recibo, onClose, onHecho, onDesactualizado }: Props) {
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<{ mensaje: string; final: boolean } | null>(null);

  useEffect(() => {
    setError(null);
    setEnviando(false);
  }, [recibo?.id]);

  if (!recibo) return null;
  const n = recibo.filas ?? 0;
  const cuantos = n > 0 ? `${n} ${n === 1 ? "precio" : "precios"}` : "los precios";

  const confirmar = async () => {
    setEnviando(true);
    setError(null);
    const r = await deshacerPrecios(recibo.id);
    setEnviando(false);
    if (r.ok) return onHecho(recibo, r);
    setError({ mensaje: r.mensaje, final: r.final });
    if (r.final) onDesactualizado?.();
  };
  // Tras un «no se puede» definitivo, repetir el botón daría el mismo error: queda sólo «Entendido».
  const final = error?.final === true;

  const cerrar = () => {
    if (!enviando) onClose();
  };

  return (
    <AdminModal
      open
      onClose={cerrar}
      variant="centered-sm"
      icon={Undo2}
      title="Deshacer precios"
      description={`${cuandoLima(recibo.createdAt)} · ${recibo.user}`}
      claveVentana="comandos-ia-deshacer"
      footer={
        <div className="flex items-center justify-end gap-2 max-sm:*:flex-1">
          {final ? (
            <button type="button" onClick={onClose} className={BOTON_PRIMARIO}>
              Entendido
            </button>
          ) : (
            <>
              <button type="button" onClick={cerrar} disabled={enviando} className={BOTON_SECUNDARIO}>
                Cancelar
              </button>
              <button type="button" onClick={confirmar} disabled={enviando} className={BOTON_PRIMARIO}>
                {enviando ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                ) : (
                  <Undo2 className="h-4 w-4" aria-hidden />
                )}
                {enviando ? "Deshaciendo…" : error ? "Reintentar" : `Deshacer ${cuantos}`}
              </button>
            </>
          )}
        </div>
      }
    >
      <div className={`space-y-3 ${MODAL_BODY}`}>
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
          <p className="break-words text-sm font-semibold text-[var(--text-primary)]">
            {recibo.resumen}
          </p>
          {!final && (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
              {n === 1 ? "Vuelve 1 precio a como estaba" : `Vuelven ${cuantos} a como estaban`}
              <InfoTip
                title="Cómo se deshace"
                what="Cada precio vuelve al valor que tenía antes de que la IA lo cambiara."
                affects="Si alguien cambió uno de esos precios después, ése se queda como está y te decimos cuál."
                example="Arroz pasó de S/ 4.20 a S/ 4.40 → vuelve a S/ 4.20."
                side="bottom"
              />
            </p>
          )}
        </div>
        {error && (
          <p
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-[var(--data-error-500)]/40 bg-[var(--data-error-500)]/10 px-3 py-2 text-sm text-[var(--data-error)]"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <span className="min-w-0 break-words">{error.mensaje}</span>
          </p>
        )}
      </div>
    </AdminModal>
  );
}
