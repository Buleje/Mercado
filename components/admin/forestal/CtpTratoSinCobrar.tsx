"use client";

/**
 * «El trato empieza después de la corrida», en la ficha del cliente (ADR-430).
 *
 * Caso real (Blas, 23-09): WASACO con trato desde el 14/09 y 6 corridas del
 * 07/09 quedaron sin precio — 3 238,90 PT sin cobrar — y la ficha mostraba el
 * saldo en cero sin decir por qué. Va debajo del saldo porque es lo que lo
 * explica: quien abre la ficha para ver cuánto le deben ve por qué falta.
 *
 * El botón adelanta el trato a la corrida más vieja sin cobrar y cobra por la
 * vía de siempre (`cobrarCorrida`); lo que se lee acá lo calculó el servidor.
 */
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2 } from "@buleje/design-system/icons";
import { arreglarTrato, useArregloTrato } from "@/hooks/use-arreglo-trato";
import { etiquetaLarga } from "@/lib/forestal/semana-de-registro";
import { resumenDelResultado, textoDelAviso, textoDelResultado } from "@/lib/forestal/trato-sin-cobrar";
import { limaDateKey } from "@/lib/utils";
import CtpCorridasDelArreglo from "./CtpCorridasDelArreglo";
import { Btn } from "./ctp-shared";

export default function CtpTratoSinCobrar({
  parteId,
  onCobrado,
}: {
  /** `null` = no es cliente: no se pregunta nada. */
  parteId: string | null;
  /** Se cobró algo: la ficha relee el saldo. */
  onCobrado?: () => void;
}) {
  const { propuesta } = useArregloTrato(parteId);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /* Con su cliente: si la ficha pasa a otra parte, el «Listo» no queda bajo ella. */
  const [hecho, setHecho] = useState<{ parteId: string; texto: string; faltan: number } | null>(null);
  const hoy = limaDateKey();
  const a = propuesta?.arreglo ?? null;

  if (hecho && hecho.parteId === parteId) {
    return (
      <p
        role="status"
        className="mt-2 flex items-start gap-2 rounded-xl border border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/10 px-3 py-2 text-sm text-[var(--data-success-700)] dark:text-[var(--data-success-500)]"
      >
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          {hecho.texto}
          {hecho.faltan > 0 && (
            <b className="block text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
              {hecho.faltan === 1 ? "Una no se pudo cobrar" : `${hecho.faltan} no se pudieron cobrar`}: vuelve a abrir la
              ficha e inténtalo otra vez.
            </b>
          )}
        </span>
      </p>
    );
  }
  if (!a || !propuesta) return null;

  const texto = textoDelAviso(a, propuesta.parteNombre, hoy);

  async function arreglar() {
    if (!a || !propuesta) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await arreglarTrato({
        parteId: a.parteId,
        tarifaId: a.mover?.tarifaId ?? null,
        desde: a.mover?.desde ?? null,
      });
      /* Lo creado y lo recotizado por separado, cada uno con su signo: una
         recotización que BAJA la deuda no se lee «+S/ -40» ni «sin precio». */
      const { cobros, cuenta } = textoDelResultado(r);
      setHecho({
        parteId: a.parteId,
        texto:
          `Listo: ${cobros ?? "no quedaba nada nuevo que cobrar"}; ${cuenta}.` +
          (r.movio ? ` El trato rige desde el ${etiquetaLarga(r.movio.a, hoy)}.` : ""),
        faltan: resumenDelResultado(r).faltan,
      });
      onCobrado?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div
      role="status"
      className="mt-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] px-3 py-2.5 text-sm dark:bg-[var(--data-warning-500)]/12"
    >
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]"
          aria-hidden
        />
        {/* `basis-64`: a 400 px el botón baja a su propia línea en vez de
            aplastar el texto a una columna de una palabra (medido 23-09). */}
        <div className="min-w-0 grow basis-64 space-y-0.5">
          <p className="font-semibold text-[var(--text-primary)]">{texto.titulo}</p>
          <p className="text-[var(--text-secondary)]">{texto.detalle}</p>
        </div>
        <Btn variant="primary" size="sm" disabled={enviando} onClick={() => void arreglar()}>
          {enviando && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {texto.boton}
        </Btn>
      </div>
      <CtpCorridasDelArreglo a={a} hoy={hoy} className="mt-1.5 pl-7" />
      {error && (
        <p role="alert" className="mt-1.5 pl-7 font-medium text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">
          {error}
        </p>
      )}
    </div>
  );
}
