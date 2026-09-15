"use client";

/**
 * El control de la lectura en voz alta, flotando sobre la pantalla.
 *
 * Leer una tabla larga al oído es un trabajo de dos manos: una anota en el
 * papel y la otra sigue en la pantalla. Hasta ahora el único control era el
 * mismo botón que la había arrancado —arriba del todo, fuera de vista una vez
 * que la lectura empieza a bajar por la tabla—, y sólo servía para CORTARLA:
 * frenar un segundo para terminar de anotar significaba volver a empezar por
 * la primera fila.
 *
 * Por eso flota: mientras lee, el control tiene que estar donde estén los ojos,
 * y los ojos están siguiendo la fila que suena.
 *
 * **El panel se queda hasta que lo cierres con la X.** No se va al pausar, ni
 * al terminar de leer: desaparecer justo cuando terminás de anotar la última
 * fila deja sin saber si leyó todo o se cortó a mitad de camino — y obliga a
 * volver a buscar el botón de arriba para releer.
 *
 * Las acciones y una salida:
 *  - **Pausar / Seguir** — frena donde está y retoma por esa misma fila.
 *  - **Reiniciar / Leer de nuevo** — vuelve a la primera y sigue leyendo.
 *  - **Ir a la fila N** — salta a cualquier punto sin cerrar ni volver a la
 *    tabla a buscar el botón de esa fila. En un lote de 301, «seguí desde la
 *    120» es el pedido normal después de una interrupción.
 *  - **X** — corta la voz y cierra el panel. Es lo único que lo cierra.
 *
 * Y el progreso con todas las letras («fila 34 de 300»): sin eso, una pausa
 * larga deja sin saber por dónde iba, que es justo lo que la pausa vino a
 * resolver.
 */

import { useEffect, useId, useState } from "react";
import { ArrowRight, Pause, Play, RotateCcw, Volume2, X } from "@buleje/design-system/icons";
import type { EstadoLectura } from "@/hooks/use-lectura-en-voz";

export default function ControlLecturaFlotante({
  estado,
  onPausar,
  onReanudar,
  onReiniciar,
  onIrAFila,
  onCerrar,
  etiqueta = "Leyendo la tabla",
}: {
  /** `null` = el panel está cerrado. Sólo la X lo pone en `null`. */
  estado: EstadoLectura | null;
  onPausar: () => void;
  onReanudar: () => void;
  onReiniciar: () => void;
  /** Salta a esa fila (1-based, como se numeran en pantalla) y sigue. */
  onIrAFila: (posicion: number) => void;
  /** Corta la voz y cierra el panel. */
  onCerrar: () => void;
  etiqueta?: string;
}) {
  if (!estado) return null;
  const actual = estado.terminada ? estado.total : Math.min(estado.idx + 1, estado.total);
  const pct = estado.total > 0 ? (actual / estado.total) * 100 : 0;
  const titulo = estado.terminada ? "Terminó de leer" : estado.pausada ? "En pausa" : etiqueta;

  return (
    <div
      role="status"
      aria-live="polite"
      /* Abajo y centrado: es donde no tapa ni la tabla ni la fila resaltada,
         que suele quedar a media pantalla. Por encima de la capa de pantalla
         completa de la tabla, o al expandirla el control desaparecería justo
         cuando más se usa. */
      className="fixed bottom-4 left-1/2 z-[9996] w-[min(24rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)]"
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="inline-flex min-w-0 items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <Volume2
            className={`h-4 w-4 shrink-0 text-[var(--accent)] ${estado.pausada || estado.terminada ? "" : "animate-pulse"}`}
            aria-hidden
          />
          <span className="truncate">{titulo}</span>
        </p>
        <div className="flex shrink-0 items-center gap-2">
          <p className="font-mono text-xs font-bold tabular-nums text-[var(--text-tertiary)]">
            fila {actual.toLocaleString("es-PE")} de {estado.total.toLocaleString("es-PE")}
          </p>
          {/* La única salida: cerrar es una decisión, no algo que pase solo. */}
          <button
            type="button"
            onClick={onCerrar}
            title="Cerrar el control de lectura"
            aria-label="Cerrar el control de lectura"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <div className="mb-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--surface-sunken)]">
        <div className="h-full rounded-full bg-[var(--accent)] transition-[width]" style={{ width: `${pct}%` }} />
      </div>

      <div className="flex gap-2">
        {/* Terminada, «pausar» no tiene qué pausar: el botón grande pasa a ser
            volver a empezar, que es lo que se quiere después de escuchar todo. */}
        {estado.terminada ? (
          <Boton onClick={onReiniciar} Icono={RotateCcw} label="Leer de nuevo" destacado />
        ) : (
          <>
            {estado.pausada ? (
              <Boton onClick={onReanudar} Icono={Play} label="Seguir" destacado />
            ) : (
              <Boton onClick={onPausar} Icono={Pause} label="Pausar" destacado />
            )}
            <Boton onClick={onReiniciar} Icono={RotateCcw} label="Reiniciar" hint="Volver a la primera fila" />
          </>
        )}
      </div>

      <IrAFila total={estado.total} onIr={onIrAFila} />
    </div>
  );
}

/**
 * «Empezá por la 120.» Un número y Enter.
 *
 * Se acepta cualquier fila del rango y se avisa fuera de él en vez de corregir
 * en silencio: pedir la 400 de 301 y que arranque en la 301 sin decir nada deja
 * pensando que se escuchó mal el número.
 */
function IrAFila({ total, onIr }: { total: number; onIr: (posicion: number) => void }) {
  const idCampo = useId();
  const [valor, setValor] = useState("");
  const n = Number(valor);
  const valido = valor.trim() !== "" && Number.isFinite(n) && n >= 1 && n <= total;
  const fueraDeRango = valor.trim() !== "" && Number.isFinite(n) && (n < 1 || n > total);
  /* Al cambiar de tabla (otro total) lo tipeado deja de tener sentido. */
  useEffect(() => { setValor(""); }, [total]);

  const ir = () => {
    if (!valido) return;
    onIr(n);
    setValor("");
  };

  return (
    <div className="mt-2 flex items-center gap-2 border-t border-[var(--rule-soft)] pt-2">
      <label
        htmlFor={idCampo}
        className="shrink-0 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]"
      >
        Ir a la fila
      </label>
      <input
        id={idCampo}
        type="number"
        inputMode="numeric"
        min={1}
        max={total}
        value={valor}
        onChange={(e) => setValor(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ir(); } }}
        placeholder={`1–${total}`}
        aria-label={`Número de fila desde la que leer, entre 1 y ${total}`}
        aria-invalid={fueraDeRango}
        className={`h-9 min-w-0 flex-1 rounded-lg border bg-[var(--surface-canvas)] px-2 font-mono text-sm font-bold tabular-nums text-[var(--text-primary)] outline-none transition-colors ${
          fueraDeRango ? "border-[var(--data-error-500)]" : "border-[var(--rule-base)] focus:border-[var(--accent)]"
        }`}
      />
      <button
        type="button"
        onClick={ir}
        disabled={!valido}
        title={fueraDeRango ? `Esta tabla tiene ${total} filas` : "Leer desde esa fila en adelante"}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[var(--accent)] bg-primary/10 px-3 text-xs font-bold text-[var(--accent-ink)] transition-colors hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[var(--accent)]"
      >
        <ArrowRight className="h-3.5 w-3.5" aria-hidden /> Ir
      </button>
    </div>
  );
}

function Boton({
  onClick,
  Icono,
  label,
  hint,
  destacado,
}: {
  onClick: () => void;
  Icono: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  destacado?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={hint ?? label}
      className={`inline-flex h-10 flex-1 items-center justify-center gap-1.5 rounded-xl border text-xs font-bold transition-colors ${
        destacado
          ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] hover:brightness-95 dark:text-[var(--accent)]"
          : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
      }`}
    >
      <Icono className="h-4 w-4" aria-hidden />
      {label}
    </button>
  );
}
