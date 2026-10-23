"use client";

/**
 * SeccionSonido — qué sonido suena (con «Escuchar» para probarlo), a qué
 * volumen, y si cada notificación nueva sale flotante en la pantalla.
 *
 * Elegir un sonido lo hace sonar ya; el volumen suena al soltarlo. Lo guarda
 * el «Guardar» de `ConfigAvisoModal`, que la monta.
 */
import { useId, type KeyboardEvent, type PointerEvent } from "react";
import { Play, Volume2, VolumeX } from "@buleje/design-system/icons";
import { claseChip } from "@/components/admin/planificacion/piezas/clases";
import { button } from "@/components/ui-system/button-variants";
import { SONIDOS_AVISO, type AvisoPantalla } from "@/lib/agenda/aviso-pantalla";
import { duracionDe, probarSonido, SONIDOS_UI } from "@/lib/agenda/sonidos";

type Parcial = Partial<Pick<AvisoPantalla, "sonido" | "volumen" | "flotantes">>;

const TECLAS_VOLUMEN = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"]);

export function SeccionSonido(props: Pick<AvisoPantalla, "sonido" | "volumen" | "flotantes"> & { onCambiar: (p: Parcial) => void }) {
  const { sonido, volumen, flotantes, onCambiar } = props;
  const id = useId();
  const mudo = sonido === "ninguno";
  const IconoVolumen = mudo || volumen === 0 ? VolumeX : Volume2;

  /* Al soltar el control (o la flecha del teclado) suena al volumen nuevo. */
  const alSoltar = (e: PointerEvent<HTMLInputElement> | KeyboardEvent<HTMLInputElement>) => {
    if ("key" in e && !TECLAS_VOLUMEN.has(e.key)) return;
    probarSonido(sonido, Number(e.currentTarget.value));
  };

  return (
    <div className="space-y-3">
      <span id={`${id}-sonido`} className="block text-sm font-semibold text-[var(--text-secondary)]">
        Sonido y avisos flotantes
      </span>

      <div role="radiogroup" aria-labelledby={`${id}-sonido`} className="flex flex-wrap gap-2">
        {SONIDOS_AVISO.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={sonido === s}
            title={s === "ninguno" ? "No suena nada" : `Dura ${duracionDe(s).toFixed(1).replace(".", ",")} s`}
            className={claseChip(sonido === s)}
            onClick={() => {
              onCambiar({ sonido: s });
              probarSonido(s, volumen);
            }}
          >
            {SONIDOS_UI[s]}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className={button({ variant: "secondary" })}
          onClick={() => probarSonido(sonido, volumen)}
          disabled={mudo || volumen === 0}
          title={mudo ? "Elige un sonido para escucharlo" : volumen === 0 ? "Sube el volumen para escucharlo" : "Escuchar el sonido elegido"}
        >
          <Play className="size-4" aria-hidden="true" />
          Escuchar
        </button>
        <label className="flex h-12 min-w-0 flex-[1_1_14rem] items-center gap-3 text-sm text-[var(--text-secondary)]">
          <IconoVolumen className="size-5 shrink-0 text-[var(--text-tertiary)]" aria-hidden="true" />
          <span className="sr-only">Volumen</span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={volumen}
            disabled={mudo}
            aria-valuetext={`${volumen} %`}
            className="h-12 min-w-0 flex-1 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
            onChange={(e) => onCambiar({ volumen: Number(e.target.value) })}
            onPointerUp={alSoltar}
            onKeyUp={alSoltar}
          />
          <span className="w-12 shrink-0 text-right font-semibold tabular-nums text-[var(--text-primary)]" aria-hidden="true">
            {volumen} %
          </span>
        </label>
      </div>

      <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-lg border border-[var(--rule-base)] px-3 py-2 text-sm text-[var(--text-primary)]">
        <input type="checkbox" className="size-5 shrink-0 accent-[var(--accent)]" checked={flotantes} onChange={(e) => onCambiar({ flotantes: e.target.checked })} />
        <span className="min-w-0 font-semibold">
          Notificación flotante por cada aviso nuevo
          <span className="block font-normal text-[var(--text-tertiary)]">Sale abajo a la derecha con su botón; el sonido suena aunque la apagues</span>
        </span>
      </label>
    </div>
  );
}
