"use client";

/**
 * «Contar el patio» guiado (Brandon 2026-10-05): la tira de pasos
 * (1 Etiquetas · 2 Recorrer · 3 Acta) y el paso 1.
 *
 * Pensado para el celular frente a la pila: una mano, guantes y sol. Por eso
 * los botones miden 56 px, el primario va en `--accent-dark` (blanco encima da
 * ~4,9:1 en los dos temas; el turquesa del logo con blanco no llega a 3:1) y
 * el secundario lleva borde fuerte de 2 px.
 */

import { ArrowRight, Check, QrCode, Tags } from "@buleje/design-system/icons";
import { CardTitle } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { PASOS_DEL_CONTEO, type EtiquetasDelPatio, type PasoConteo } from "@/lib/forestal/conteo-patio-pasos";

export const BOTON =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl px-4 py-2 text-lg font-bold leading-tight transition-colors";
export const BOTON_PRIMARIO = `${BOTON} bg-[var(--accent-dark)] text-white hover:opacity-90 disabled:opacity-40`;
export const BOTON_BORDE = `${BOTON} border-2 border-[var(--rule-strong)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--accent)]`;
export const AVISO_AMBAR =
  "flex items-start gap-2 rounded-2xl border-2 border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/10 px-4 py-3 text-base font-bold text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]";
export const TARJETA = "rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-4";

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/**
 * La tira de pasos. Se puede volver a «Etiquetas» mientras se recorre (para
 * imprimir las que faltan) y saltarla; al «Acta» se llega terminando.
 */
export function PasosDelConteo({
  paso,
  onIr,
}: {
  paso: PasoConteo;
  onIr: (p: Exclude<PasoConteo, 3>) => void;
}) {
  return (
    <ol className="grid grid-cols-3 gap-1.5" aria-label="Pasos del conteo" data-pasos-conteo>
      {PASOS_DEL_CONTEO.map((p) => {
        const actual = p.paso === paso;
        const hecho = p.paso < paso;
        const puede = !actual && paso !== 3 && p.paso !== 3;
        const cuerpo = (
          <>
            <span
              className={cn(
                "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base font-bold tabular-nums",
                actual
                  ? "bg-[var(--accent-dark)] text-white"
                  : hecho
                    ? "bg-[var(--data-success-500)]/15 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
              )}
              aria-hidden
            >
              {hecho ? <Check className="h-5 w-5" /> : p.paso}
            </span>
            <span data-paso-titulo className={cn("min-w-0 max-w-full truncate text-base", actual ? "font-bold text-[var(--text-primary)]" : "text-[var(--text-secondary)]")}>
              {p.titulo}
            </span>
          </>
        );
        const marco = cn(
          /* A 400 px, número arriba y título abajo: en fila no entraba «Etiquetas». */
          "flex min-h-12 w-full items-center gap-2 rounded-2xl px-2 py-1.5 max-sm:flex-col max-sm:gap-1 max-sm:py-2",
          actual ? "bg-[var(--surface-raised)] ring-2 ring-[var(--accent)]" : "bg-[var(--surface-sunken)]",
        );
        return (
          <li key={p.paso} aria-current={actual ? "step" : undefined}>
            {puede ? (
              <button type="button" onClick={() => onIr(p.paso as Exclude<PasoConteo, 3>)} className={cn(marco, "text-left hover:ring-2 hover:ring-[var(--rule-strong)]")}>
                {cuerpo}
              </button>
            ) : (
              <span className={marco}>{cuerpo}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Paso 1: cuántas piezas del patio no tienen etiqueta; imprimirlas o seguir sin ellas. */
export function PasoEtiquetas({
  etiquetas,
  onImprimir,
  onSeguir,
}: {
  etiquetas: EtiquetasDelPatio;
  onImprimir: () => void;
  onSeguir: () => void;
}) {
  const { esperadas, sin, conocido } = etiquetas;
  const faltan = sin.length;

  return (
    <section className={cn(TARJETA, "space-y-4")} data-paso-etiquetas>
      <div className="flex items-start gap-3">
        <Tags className="mt-1 h-7 w-7 shrink-0 text-[var(--accent)]" aria-hidden />
        <div className="min-w-0 flex-1 space-y-1">
          {/* El ⓘ va AL LADO del título, no adentro (un botón dentro de un h2: guardián infotip-no-anidado). */}
          <div className="flex items-center gap-1.5">
            <CardTitle as="h2" className="text-[length:var(--ts-xl)] font-bold text-[var(--text-primary)]">Etiquetas</CardTitle>
            <InfoTip
              title="¿Por qué etiquetar antes?"
              what="Con la etiqueta QR pegada, la cámara del celular lee cada troza de un toque, sin tipear."
              affects="Sin etiqueta igual se cuenta: tipeas el código pintado en la troza (código de planta o del bosque) y Enter."
              example="13 piezas sin etiqueta → imprimes 13 en el rollo, las pegas y recorres la pila con la cámara."
              side="bottom"
            />
          </div>
          {esperadas === 0 ? (
            <p className="text-base text-[var(--text-secondary)]">
              El libro no tiene piezas en el patio: todo lo que escanees saldrá como «sobra».
            </p>
          ) : !conocido ? (
            <p className="text-base text-[var(--text-secondary)]">
              No se sabe cuáles tienen etiqueta (lo esperado es de antes): puedes recorrer igual.
            </p>
          ) : faltan === 0 ? (
            <p className="text-lg font-bold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]">
              Las {esperadas} piezas del patio tienen su etiqueta.
            </p>
          ) : (
            <p className="text-lg text-[var(--text-primary)]" data-sin-etiqueta={faltan}>
              <b className="text-3xl tabular-nums">{faltan}</b>{" "}
              <span className="text-[var(--text-secondary)]">de {esperadas}</span>{" "}
              {faltan === 1 ? "pieza del patio no tiene" : "piezas del patio no tienen"} etiqueta QR.
            </p>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {faltan > 0 && (
          <button type="button" onClick={onImprimir} className={BOTON_PRIMARIO} data-imprimir-etiquetas>
            <QrCode className="h-6 w-6" aria-hidden /> Imprimir {faltan === 1 ? "la etiqueta" : `las ${faltan} etiquetas`}
          </button>
        )}
        <button type="button" onClick={onSeguir} className={faltan > 0 ? BOTON_BORDE : BOTON_PRIMARIO} data-seguir-recorrer>
          {faltan > 0 ? "Seguir sin etiquetas" : "Empezar a recorrer"} <ArrowRight className="h-6 w-6" aria-hidden />
        </button>
        {faltan > 0 && (
          <p className="text-base text-[var(--text-secondary)]">
            Sin etiqueta, tipeas el código pintado en cada troza ({plural(faltan, "pieza", "piezas")}).
          </p>
        )}
      </div>
    </section>
  );
}
