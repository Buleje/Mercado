"use client";

/**
 * CtpTrozasCards — la misma pieza, para el teléfono del patio.
 *
 * Nueve columnas no entran en la mano: cada troza es una tarjeta con lo que se
 * mira parado frente a la pila —código, volumen, especie, estado, días— y el
 * resto en una línea chica. La casilla queda FUERA del área que abre la ficha:
 * con el pulgar, un blanco de 16 px no alcanza.
 */

import type { FotoEspecie } from "@/lib/forestal/especies-fotos";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { diasParada, ESTADO_META, estadoDeTroza } from "@/lib/forestal/trozas-patio";
import { claseDias, n, tituloDias } from "./ctp-trozas-lista-shared";
import { puntoDeTono } from "./ctp-trozas-ui";
import EspecieFoto from "./EspecieFoto";
import type { UbicacionDeCarga } from "./hooks/use-planta-ubicacion";
import type { TrozaPatioAPI } from "./hooks/use-trozas-patio";

export interface CtpTrozasCardsProps {
  visibles: readonly TrozaPatioAPI[];
  elegidas: ReadonlySet<string>;
  onAlternar: (id: string) => void;
  onVerFicha: (id: string) => void;
  hoy: Date;
  canchas: Record<string, UbicacionDeCarga>;
  fotosEspecie: Map<string, FotoEspecie>;
  /** Alto máximo de la caja con scroll. */
  altoClase: string;
}

export default function CtpTrozasCards({
  visibles, elegidas, onAlternar, onVerFicha, hoy, canchas, fotosEspecie, altoClase,
}: CtpTrozasCardsProps) {
  return (
    <div className={`overflow-y-auto md:hidden ${altoClase}`}>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {visibles.map((t) => {
          const e = estadoDeTroza(t);
          const m = ESTADO_META[e];
          const d = diasParada(t, hoy);
          return (
            <li key={t.id} className={`flex items-start gap-2 px-3 py-2.5 ${elegidas.has(t.id) ? "bg-primary/10 dark:bg-[var(--accent)]/12" : ""}`}>
              <input
                type="checkbox"
                checked={elegidas.has(t.id)}
                disabled={e !== "libre"}
                onChange={() => onAlternar(t.id)}
                aria-label={`Elegir ${t.codificacion ?? t.codigoPlanta ?? "la pieza"}`}
                className="mt-1 h-5 w-5 shrink-0 accent-[var(--accent)] disabled:opacity-40"
              />
              <button type="button" onClick={() => onVerFicha(t.id)} className="min-w-0 flex-1 text-left">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-mono font-bold text-[var(--text-primary)]">{t.codificacion ?? t.codigoPlanta ?? "—"}</span>
                  <span className="font-mono text-sm font-bold tabular-nums text-[var(--text-primary)]">
                    {t.volumenM3 == null ? "—" : `${fmtM3(t.volumenM3)} m³`}
                  </span>
                </span>
                <span className="mt-0.5 flex items-center gap-2 text-sm text-[var(--text-secondary)]">
                  <EspecieFoto especie={t.especieComun} indice={fotosEspecie} size={24} />
                  {t.especieComun ?? "—"}
                </span>
                <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[length:var(--ts-2xs)]">
                  <span className="flex items-center gap-1 font-bold text-[var(--text-secondary)]">
                    <span className="h-2 w-2 rounded-full" style={{ background: puntoDeTono(m.tono) }} aria-hidden="true" />
                    {m.label}
                  </span>
                  <span className={`font-mono font-bold ${claseDias(d)}`} title={tituloDias(d)}>{d == null ? "sin fecha" : `${d} d parada`}</span>
                  <span className="font-mono text-[var(--text-secondary)]">
                    {n(t.d1Cm, 0)}·{n(t.d2Cm, 0)} cm · {n(t.largoM)} m · {t.gtfNumber ?? "—"}
                  </span>
                  {canchas[t.woodEntryId] && (
                    <span className="text-[var(--text-secondary)]">en {canchas[t.woodEntryId].nombre}</span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
