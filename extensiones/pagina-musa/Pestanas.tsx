"use client";

/**
 * Pestañas de la portada (accesibles: `tablist`, flechas ← →, Inicio/Fin). Los
 * paneles llegan ya dibujados del servidor y sólo se monta el activo: así el
 * carril de adentro mide su ancho al aparecer (oculto medía 0 y apagaba la flecha).
 */
import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export interface Pestana {
  texto: string;
  cuantos: number;
  panel: ReactNode;
  /** El «Ver todo» de esa pestaña (a la derecha del título desde 640 px). */
  verTodo: ReactNode;
}

export function Pestanas({ etiqueta, pestanas }: { etiqueta: string; pestanas: Pestana[] }) {
  const base = useId();
  const [activa, setActiva] = useState(0);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const actual = pestanas[activa] ?? pestanas[0];
  if (!actual) return null;

  const ir = (i: number) => {
    const n = (i + pestanas.length) % pestanas.length;
    setActiva(n);
    botones.current[n]?.focus();
  };
  const alTeclear = (e: KeyboardEvent) => {
    const mover: Record<string, number> = { ArrowRight: activa + 1, ArrowLeft: activa - 1, Home: 0, End: pestanas.length - 1 };
    const destino = mover[e.key];
    if (destino === undefined) return;
    e.preventDefault();
    ir(destino);
  };

  return (
    <>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <div role="tablist" aria-label={etiqueta} className="mu-sin-barra -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {pestanas.map((p, i) => {
            const elegida = i === activa;
            return (
              <button
                key={p.texto}
                ref={(b) => {
                  botones.current[i] = b;
                }}
                id={`${base}-t${i}`}
                type="button"
                role="tab"
                aria-selected={elegida}
                aria-controls={`${base}-p`}
                tabIndex={elegida ? 0 : -1}
                onClick={() => setActiva(i)}
                onKeyDown={alTeclear}
                className={`mu-foco inline-flex h-12 shrink-0 items-center gap-2 rounded-full border-[1.5px] px-5 text-base font-semibold transition-colors duration-[var(--mu-dur-corto)] ${
                  elegida
                    ? "border-[var(--mu-boton-fondo)] bg-[var(--mu-boton-fondo)] text-[var(--mu-boton-texto)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:border-[var(--text-primary)]"
                }`}
              >
                {p.texto}
                <span className={`text-sm font-medium tabular-nums ${elegida ? "opacity-80" : "text-[var(--text-tertiary)]"}`}>{p.cuantos}</span>
              </button>
            );
          })}
        </div>
        <div className="hidden sm:block">{actual.verTodo}</div>
      </div>
      <div id={`${base}-p`} role="tabpanel" aria-labelledby={`${base}-t${activa}`} key={activa}>
        {actual.panel}
      </div>
      <div className="mt-2 sm:hidden">{actual.verTodo}</div>
    </>
  );
}
