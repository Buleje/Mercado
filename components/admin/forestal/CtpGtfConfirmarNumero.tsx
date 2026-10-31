"use client";

/**
 * CtpGtfConfirmarNumero — el paso de confirmar el N° antes de «Emitir GTF»
 * (ADR-446).
 *
 * Emitir era un clic que grababa el número que el sistema calculaba. En Blas
 * así salieron `19-00000-000001` y `-000002`: la Ficha tenía mal la serie y el
 * sistema no miraba los Anexos 04, donde estaba el último número real (064).
 * Ahora el número se PROPONE, se ve de dónde sale, y el operador lo confirma o
 * lo corrige contra el talonario que tiene en la mano.
 *
 * Dos respuestas del servidor se contestan acá mismo, sin perder lo escrito:
 *   · «ese N° ya lo lleva el despacho #N» → ¿es la misma guía (un camión con
 *     dos productos)? Sí reintenta con esa línea; si no, se usa el siguiente.
 *   · «saltea más de 20 números» → ¿seguro? Un tipeo corre el talonario para
 *     siempre, así que se pregunta antes de grabarlo.
 *
 * El input sigue a la propuesta mientras nadie lo toque; lo que el operador
 * escribió a mano no se pisa.
 */

import { useId, useState } from "react";
import { Loader2, Truck } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import {
  useProximaGtf,
  type ConfirmacionEmision,
  type PreguntaEmision,
  type RespuestaEmision,
} from "@/hooks/use-proxima-gtf";
import { correlativoEnSerie, fuenteGtfTexto } from "@/lib/forestal/gtf-talonario";
import { Btn, I } from "./ctp-shared";

const ORIGEN_DIGITOS = { ficha: "según la Ficha", ultimo: "como el último número", defecto: "por defecto" } as const;
const AVISO = "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]";

export default function CtpGtfConfirmarNumero({
  onConfirmar,
  onCancelar,
  ocupado,
  actual,
}: {
  /** Emite con ese número (y lo que el operador confirmó al responder una pregunta). */
  onConfirmar: (numero: string, confirmacion?: ConfirmacionEmision) => Promise<RespuestaEmision>;
  onCancelar: () => void;
  ocupado: boolean;
  /** El N° que la línea YA tiene, si tiene: de la serie no se re-numera. */
  actual?: string | null;
}) {
  const { propuesta, error, cargando, recargar } = useProximaGtf();
  /** `null` = sigue a la propuesta; un texto = lo que el operador escribió. */
  const [escrito, setEscrito] = useState<string | null>(null);
  const [pregunta, setPregunta] = useState<PreguntaEmision | null>(null);
  const valor = escrito ?? propuesta?.gtf ?? "";
  const idAyuda = useId();

  async function confirmar(confirmacion?: ConfirmacionEmision) {
    if (!valor.trim()) return;
    const r = await onConfirmar(valor.trim(), confirmacion);
    if (r.ok) return;
    setPregunta(r.pregunta);
    if (!r.pregunta) recargar();
  }

  function usarElSiguiente() {
    setPregunta(null);
    setEscrito(null);
    recargar();
  }

  const yaEsDeLaSerie = Boolean(actual && propuesta && correlativoEnSerie(actual, propuesta.serie));
  if (yaEsDeLaSerie) {
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="text-sm text-[var(--text-secondary)]">
          Esta guía ya tiene la GTF <b className="font-mono tabular-nums text-[var(--text-primary)]">{actual}</b>: no se re-numera.
        </span>
        <Btn variant="ghost" onClick={onCancelar}>Cerrar</Btn>
      </div>
    );
  }

  if (pregunta) {
    const esMisma = pregunta.tipo === "misma_guia";
    return (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <span role="alert" className={`text-sm font-medium ${AVISO}`}>
          {esMisma
            ? `${pregunta.gtf} ya lo lleva el despacho #${pregunta.lineNo ?? "—"}.`
            : `¿Seguro? El siguiente es ${pregunta.propuesta} y ${pregunta.gtf} saltea ${pregunta.salto} números.`}
        </span>
        {esMisma ? (
          <>
            <Btn variant="ghost" onClick={usarElSiguiente} disabled={ocupado}>Usar el siguiente</Btn>
            <Btn variant="primary" onClick={() => void confirmar({ mismaGuiaQue: pregunta.despachoId })} disabled={ocupado}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Es la misma guía que el #{pregunta.lineNo ?? "—"}
            </Btn>
          </>
        ) : (
          <>
            <Btn variant="ghost" onClick={() => setPregunta(null)} disabled={ocupado}>Corregir</Btn>
            <Btn variant="primary" onClick={() => void confirmar({ confirmarSalto: true })} disabled={ocupado}>
              {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
              Sí, emitir {pregunta.gtf}
            </Btn>
          </>
        )}
      </div>
    );
  }

  const detalle = cargando && !propuesta
    ? "Buscando el siguiente del talonario…"
    : error
      ? error
      : actual && propuesta
        ? `Hoy dice «${actual}», que no es de la serie ${propuesta.serie}: se reemplaza`
        : propuesta?.ultimo
          ? `Último usado: ${propuesta.ultimo.numero} · ${fuenteGtfTexto(propuesta.ultimo)}`
          : propuesta
            ? "Primera guía de esta serie"
            : "";

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <label className="flex items-center gap-2 text-sm">
        <span className="font-medium text-[var(--text-secondary)]">N° de GTF</span>
        <span className="w-52">
          <input
            className={`${I} font-mono tabular-nums`}
            value={valor}
            onChange={(e) => setEscrito(e.target.value.toUpperCase().slice(0, 40))}
            onKeyDown={(e) => { if (e.key === "Enter") void confirmar(); }}
            placeholder={cargando ? "…" : "19-001-0000065"}
            aria-describedby={idAyuda}
            disabled={ocupado}
          />
        </span>
      </label>
      <span id={idAyuda} className={`inline-flex items-center gap-1 text-xs ${error || actual ? AVISO : "text-[var(--text-tertiary)]"}`}>
        {detalle}
        {propuesta && (
          /* Arriba y no a la derecha: a la derecha tapaba «Confirmar y emitir»
             cuando el mouse quedaba sobre el ⓘ al volver de «Corregir». */
          <InfoTip
            side="top"
            title="De dónde sale el número"
            what="El mayor número ya usado de la serie + 1. Cuentan los despachos (también los anulados) y los Anexos 04 guardados."
            affects="Queda en la guía y no se cambia después. Si otra línea ya lo tiene, se pregunta si es la misma guía; si salta más de 20, se pide confirmar."
            example={`${propuesta.serie} · ${propuesta.digitos} dígitos ${ORIGEN_DIGITOS[propuesta.origenDigitos]} → ${propuesta.gtf}. También puedes escribir sólo el correlativo (${propuesta.correlativo}).`}
          />
        )}
      </span>
      <Btn variant="ghost" onClick={onCancelar} disabled={ocupado}>Cancelar</Btn>
      <Btn variant="primary" onClick={() => void confirmar()} disabled={ocupado || !valor.trim()}>
        {ocupado ? <Loader2 className="h-4 w-4 animate-spin" /> : <Truck className="h-4 w-4" />}
        Confirmar y emitir
      </Btn>
    </div>
  );
}
