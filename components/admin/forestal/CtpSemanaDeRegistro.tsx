"use client";

/**
 * CtpSemanaDeRegistro — el día al que va este registro, en una tira de semana.
 *
 * El caso real (Brandon, 2026-09-11): *«quiero un apartado para escoger los
 * días o el día que quiero que se ponga este registro… cuadros uno al lado del
 * otro diciendo el día, y los que ya tienen registro que se muestren
 * resaltados o con la cantidad de pies de esa fecha»*.
 *
 * El Libro CTP se registra **día por día** y el parte de la sierra llega tarde:
 * cortó el sábado, el papel aparece el lunes. Con un `<input type="date">`
 * pelado hay que acordarse de qué día era y, sobre todo, no hay forma de saber
 * si esa jornada YA se cargó — así es como la misma producción entra dos veces.
 *
 * Por eso cada casillero trae **lo que ese día ya tiene anotado** (pie tablar y
 * cuántas corridas). Es el dato que convierte la tira en una decisión: «el
 * martes ya tiene 2.374 PT, entonces esto es del miércoles».
 *
 * ## Lo que NO hace
 *
 * No bloquea un día que ya tiene producción: dos corridas el mismo día son
 * normales (dos líneas de sierra, dos turnos). Muestra el dato y deja decidir —
 * un guard acá le impediría al aserradero anotar su segundo turno.
 */

import { useMemo } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fmtPt } from "@/lib/forestal/cubicacion-formato";
import {
  correrSemanas,
  diasDeLaSemana,
  esIsoValido,
  etiquetaCorta,
  etiquetaLarga,
  hoyEnLima,
  nombreDelDia,
  tituloDeLaSemana,
} from "@/lib/forestal/semana-de-registro";
import type { JornadaDeProduccion } from "./hooks/use-jornadas-produccion";

interface Props {
  /** El día elegido, `YYYY-MM-DD`. Es la misma fecha que guarda el asiento. */
  valor: string;
  onElegir: (iso: string) => void;
  /** La semana que se está mirando (puede no contener a `valor`). */
  semana: string;
  onSemana: (iso: string) => void;
  /** Lo ya producido, por día. Los días sin nada no están en el mapa. */
  porDia: Map<string, JornadaDeProduccion>;
  cargando?: boolean;
  error?: string | null;
}

const BOTON_FLECHA =
  "grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--rule-base)] text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]";

export default function CtpSemanaDeRegistro({
  valor,
  onElegir,
  semana,
  onSemana,
  porDia,
  cargando = false,
  error = null,
}: Props) {
  const hoy = hoyEnLima();
  const base = esIsoValido(semana) ? semana : hoy;
  const dias = useMemo(() => diasDeLaSemana(base), [base]);

  /* El día elegido puede caer fuera de la semana que se está mirando: se navega
     para ver jornadas de otra semana sin perder lo que ya se eligió. Decirlo es
     mejor que dibujar siete casilleros donde ninguno está marcado. */
  const elegidoFuera = esIsoValido(valor) && !dias.includes(valor);

  /** Flechas sobre la tira: mover de a un día es lo que se hace al corregir. */
  const onTeclas = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const desde = esIsoValido(valor) ? valor : base;
    const i = dias.indexOf(desde);
    if (i < 0) return;
    const siguiente = dias[i + (e.key === "ArrowRight" ? 1 : -1)];
    e.preventDefault();
    if (siguiente) {
      onElegir(siguiente);
      return;
    }
    /* Al borde de la tira se salta de semana y se cae en el día equivalente:
       después del domingo viene el lunes, no «nada». */
    const otra = correrSemanas(base, e.key === "ArrowRight" ? 1 : -1);
    const diasOtra = diasDeLaSemana(otra);
    onSemana(otra);
    onElegir(e.key === "ArrowRight" ? diasOtra[0]! : diasOtra[6]!);
  };

  return (
    <section
      aria-label="Día del registro"
      className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-3 py-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <CalendarDays className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
          Día del registro
        </span>
        {cargando && (
          <Loader2
            className="h-3.5 w-3.5 animate-spin text-[var(--text-tertiary)]"
            aria-label="Leyendo lo ya producido"
          />
        )}
        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onSemana(correrSemanas(base, -1))}
            aria-label="Semana anterior"
            className={BOTON_FLECHA}
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="min-w-[10.5rem] text-center text-xs font-semibold text-[var(--text-secondary)]">
            {tituloDeLaSemana(base)}
          </span>
          <button
            type="button"
            onClick={() => onSemana(correrSemanas(base, 1))}
            aria-label="Semana siguiente"
            className={BOTON_FLECHA}
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => {
              onSemana(hoy);
              onElegir(hoy);
            }}
            className="h-8 rounded-lg border border-[var(--rule-base)] px-2.5 text-xs font-bold text-[var(--text-secondary)] hover:border-[var(--accent)] hover:text-[var(--accent-ink)] dark:hover:text-[var(--accent)]"
          >
            Hoy
          </button>
        </div>
      </div>

      <div
        role="group"
        aria-label="Elegí el día de la jornada"
        onKeyDown={onTeclas}
        className="mt-2 grid grid-cols-7 gap-1"
      >
        {dias.map((iso) => {
          const j = porDia.get(iso);
          const elegido = iso === valor;
          const esHoy = iso === hoy;
          const futuro = iso > hoy;
          return (
            <button
              key={iso}
              type="button"
              onClick={() => onElegir(iso)}
              aria-pressed={elegido}
              title={
                j
                  ? `${etiquetaLarga(iso)} — ya tiene ${fmtPt(j.pt)} PT en ${j.corridas} corrida(s)`
                  : `${etiquetaLarga(iso)} — sin producción anotada`
              }
              className={cn(
                "flex min-h-[4.25rem] flex-col items-center justify-center gap-0.5 rounded-xl border px-1 py-1.5 text-center transition-colors",
                elegido
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--text-primary)] ring-1 ring-[var(--accent)]"
                  : j
                    ? /* Resaltado: el día que YA tiene jornada anotada se ve
                         distinto de un día vacío antes de leer la cifra. */
                      "border-[var(--data-success-500)]/40 bg-[var(--data-success-500)]/12 hover:border-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] hover:border-[var(--accent)]",
                /* El futuro se ofrece igual —se puede programar una jornada—
                   pero se dibuja apagado: la mayoría de las veces llegar ahí es
                   haberse pasado de semana. */
                futuro && !elegido && "opacity-60",
              )}
            >
              <span
                className={cn(
                  "text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide",
                  esHoy ? "text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-tertiary)]",
                )}
              >
                {nombreDelDia(iso)}
              </span>
              <span className="font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                {etiquetaCorta(iso)}
              </span>
              {j ? (
                <span className="font-mono text-[length:var(--ts-2xs)] font-bold tabular-nums leading-tight text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
                  {/* Una corrida chica puede redondear a 0 PT, y «0 PT» se lee
                      igual que «no hay nada» — que es justo lo contrario de lo
                      que este casillero tiene que decir. Ahí se cuentan las
                      corridas, que es el dato que importa: el día ya se cargó. */}
                  {j.pt >= 1 ? `${fmtPt(j.pt)} PT` : j.corridas === 1 ? "1 corrida" : `${j.corridas} corridas`}
                </span>
              ) : (
                /* El hueco se reserva igual: sin esto la tira baila de altura
                   según qué días tengan producción. */
                <span className="text-[length:var(--ts-2xs)] leading-tight text-[var(--text-tertiary)]">
                  {esHoy ? "hoy" : "—"}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <p className="mt-1.5 text-[length:var(--ts-2xs)] leading-snug text-[var(--text-tertiary)]">
        {error ? (
          <span className="text-[var(--data-error-500)]">
            No se pudo leer lo ya producido ({error}). Elegí el día igual: el registro no depende de
            este dato.
          </span>
        ) : elegidoFuera ? (
          <>
            Estás viendo otra semana. El registro va al{" "}
            <b className="text-[var(--text-secondary)]">{etiquetaLarga(valor)}</b>.
          </>
        ) : (
          <>
            El día que elijas es la fecha del asiento. Los que ya tienen producción lo dicen en pie
            tablar — dos corridas el mismo día es normal (dos turnos), pero repetir la misma no.
          </>
        )}
      </p>
    </section>
  );
}
