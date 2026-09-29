"use client";

/**
 * loth-rutas-ui — las piezas que comparten la tabla «Rutas y puntos» y la
 * ficha de una ruta sobre el mapa: la coordenada dicha en UTM y en lat/lng,
 * la lista de vértices, la muestra del tipo de vía y el botón de copiar.
 * Una sola forma de decir una coordenada en las dos pantallas.
 */

import { toast } from "sonner";
import { Check, Copy } from "@buleje/design-system/icons";
import { useEffect, useRef, useState } from "react";
import { formatMeters } from "@/lib/forestal/loth-utm";
import { textoLargo, textoLatLng, type CoordRuta, type VerticeRuta } from "@/lib/forestal/loth-rutas-coordenadas";

/** Copia al portapapeles y lo dice. */
export function copiarTexto(texto: string, que: string): Promise<boolean> {
  return navigator.clipboard
    .writeText(texto)
    .then(() => {
      toast.success(`Copiaste ${que}`);
      return true;
    })
    .catch((err: unknown) => {
      toast.error(`No se pudo copiar: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    });
}

export const BTN_ICONO_RUTA =
  "inline-flex h-10 w-10 flex-none items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]/40";

/** Botón de copiar con el tilde un momento después de copiar. */
export function BotonCopiar({ texto, que, etiqueta }: { texto: string; que: string; etiqueta: string }) {
  const [hecho, setHecho] = useState(false);
  const reloj = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (reloj.current != null) window.clearTimeout(reloj.current);
    },
    [],
  );
  return (
    <button
      type="button"
      onClick={() =>
        void copiarTexto(texto, que).then((ok) => {
          if (!ok) return;
          setHecho(true);
          reloj.current = window.setTimeout(() => setHecho(false), 1500);
        })
      }
      aria-label={etiqueta}
      title={etiqueta}
      className={BTN_ICONO_RUTA}
    >
      {hecho ? <Check className="h-4 w-4 text-[var(--data-success-ink)]" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
    </button>
  );
}

/** La muestra del tipo: la línea con el color (y el guion) del mapa. El color llega del catálogo de vías. */
export function MuestraVia({ color, punteada = false }: { color: string; punteada?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="inline-block h-1 w-5 flex-none rounded-full"
      style={punteada ? { backgroundImage: `repeating-linear-gradient(90deg, ${color} 0 5px, transparent 5px 8px)` } : { backgroundColor: color }}
    />
  );
}

/**
 * La coordenada en dos renglones: UTM (como el plano) y lat/lng (como el GPS).
 * Cada cifra entera en su renglón si no entra (nunca «N 8» arriba y «917 984»
 * abajo). `conZona=false` cuando la zona ya va en el encabezado de la columna.
 */
export function CoordTexto({ c, conZona = true }: { c: CoordRuta; conZona?: boolean }) {
  return (
    <span className="block tabular-nums">
      <span className="block text-sm font-semibold text-[var(--text-primary)]">
        {conZona && <span className="whitespace-nowrap">{c.zona} · </span>}
        <span className="whitespace-nowrap">E {formatMeters(c.este, 0)}</span> · <span className="whitespace-nowrap">N {formatMeters(c.norte, 0)}</span>
      </span>
      <span className="block whitespace-nowrap text-xs text-[var(--text-secondary)]">{textoLatLng(c)}</span>
    </span>
  );
}

/** Los vértices de una ruta, uno por renglón: N°, UTM, lat/lng y cuánto se caminó desde el inicio. */
export function ListaVertices({ vertices, id }: { vertices: readonly VerticeRuta[]; id?: string }) {
  return (
    <ol id={id} className="max-h-64 w-full space-y-1 overflow-y-auto pr-1" aria-label="Vértices de la ruta">
      {vertices.map((v) => (
        <li
          key={v.n}
          className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-baseline gap-x-2 rounded-lg bg-[var(--surface-sunken)] px-2 py-1 text-xs tabular-nums"
        >
          <span className="font-bold text-[var(--text-tertiary)]">{v.n}</span>
          <span className="min-w-0">
            <span className="block font-semibold text-[var(--text-primary)]">
              E {formatMeters(v.este, 0)} · N {formatMeters(v.norte, 0)}
            </span>
            <span className="block text-[var(--text-secondary)]">{textoLatLng(v)}</span>
          </span>
          <span className="text-right font-semibold text-[var(--text-secondary)]">{textoLargo(v.acumuladoM)}</span>
        </li>
      ))}
    </ol>
  );
}
