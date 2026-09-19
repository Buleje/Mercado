"use client";

/**
 * CampoCodigoDeTroza — el «Código» de la troza de la que salen las piezas, con
 * sugerencias del patio (sólo en «Producir sin lote»).
 *
 * Texto libre: escribir un código que no está en el patio lo deja tal cual y no
 * toca la especie. Elegir una sugerencia —o escribir un código que coincide sin
 * duda con una troza— pone además la especie de esa troza. Nada de esto sale
 * del cubicado: ver `lib/forestal/codigo-de-troza.ts`.
 *
 * ## Escape
 *
 * El modal que monta el cubicador (`useModalAccesible`) escucha el teclado en
 * fase de CAPTURA sobre `document`, antes que cualquier `onKeyDown` de React:
 * un `stopPropagation` en el input llega tarde y Escape cerraba el modal entero
 * con la lista abierta. Por eso, mientras la lista está a la vista, este campo
 * escucha en captura sobre `window` —que va antes que `document`— y corta ahí.
 * Con la lista cerrada, Escape vuelve a ser del modal.
 */

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { X } from "@buleje/design-system/icons";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import {
  sugerirCodigosDeTroza,
  trozaDeCodigoExacto,
  type TrozaParaCodigo,
} from "@/lib/forestal/codigo-de-troza";

const num1 = (v: number) => v.toLocaleString("es-PE", { maximumFractionDigits: 1 });

/** Lo que distingue a dos trozas con el mismo código: diámetros, largo y guía. */
function detalleDeTroza(t: TrozaParaCodigo): string {
  const partes: string[] = [];
  if (t.d1Cm != null || t.d2Cm != null) {
    const d = [t.d1Cm, t.d2Cm].filter((x): x is number => x != null).map(num1).join("–");
    partes.push(`Ø ${d} cm`);
  }
  if (t.largoM != null) partes.push(`${num1(t.largoM)} m`);
  if (t.guia) partes.push(`GTF ${t.guia}`);
  return partes.join(" · ");
}

export interface CampoCodigoDeTrozaProps {
  valor: string;
  onValor: (v: string) => void;
  /** Se eligió una troza del patio: quien monta el campo pone la especie. */
  onElegir: (troza: TrozaParaCodigo) => void;
  trozas: readonly TrozaParaCodigo[];
  cargando?: boolean;
}

export default function CampoCodigoDeTroza({ valor, onValor, onElegir, trozas, cargando = false }: CampoCodigoDeTrozaProps) {
  const [abierto, setAbierto] = useState(false);
  const [activo, setActivo] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const idBase = useId();
  const inputId = `${idBase}-codigo`;
  const listaId = `${idBase}-lista`;
  const sugerencias = useMemo(() => sugerirCodigosDeTroza(trozas, valor), [trozas, valor]);
  const visible = abierto && sugerencias.length > 0;
  /**
   * El último texto ya resuelto contra el patio. Sin esto, salir del campo sin
   * cambiar nada volvía a poner la especie de la troza encima de la que el
   * operario eligió a mano después.
   */
  const resueltoRef = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.activeElement !== inputRef.current) return;
      e.stopPropagation();
      e.preventDefault();
      setAbierto(false);
      /* Sin esto la opción marcada quedaba vieja: «2», bajar dos, Escape, bajar
         y Enter elegía «12» en vez de «2» (lo reprodujo el revisor). */
      setActivo(-1);
    };
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, [visible]);

  const elegir = (t: TrozaParaCodigo) => {
    resueltoRef.current = t.codigo;
    onValor(t.codigo);
    onElegir(t);
    setAbierto(false);
    setActivo(-1);
  };

  /** Escrito a mano y confirmado (Enter o salir del campo). */
  const resolverEscrito = () => {
    const limpio = valor.trim();
    if (trozas.length === 0 || limpio === resueltoRef.current) return;
    resueltoRef.current = limpio;
    const t = trozaDeCodigoExacto(trozas, limpio);
    if (t) elegir(t);
  };

  const mover = (paso: 1 | -1) => {
    if (sugerencias.length === 0) return;
    setAbierto(true);
    setActivo((i) => (i < 0 ? (paso === 1 ? 0 : sugerencias.length - 1) : (i + paso + sugerencias.length) % sugerencias.length));
  };

  return (
    <div className="relative flex min-w-[6.5rem] flex-1 flex-col gap-1 sm:max-w-[8rem]">
      <label htmlFor={inputId} className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
        Código
      </label>
      <span className="flex h-11 items-center gap-1 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-2.5 focus-within:border-[var(--accent)]">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={valor}
          placeholder={cargando ? "Leyendo…" : "Ej. 25"}
          title="Código de la troza de la que salen estas piezas. Es sólo una anotación del cubicado: no se declara ni consume la troza."
          role="combobox"
          aria-autocomplete="list"
          aria-haspopup="listbox"
          aria-expanded={visible}
          aria-controls={listaId}
          aria-activedescendant={visible && activo >= 0 ? `${idBase}-op-${activo}` : undefined}
          onChange={(e) => {
            onValor(e.target.value);
            setAbierto(true);
            setActivo(-1);
          }}
          onFocus={() => setAbierto(true)}
          onBlur={() => {
            setAbierto(false);
            setActivo(-1);
            resolverEscrito();
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              mover(1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              mover(-1);
            } else if (e.key === "Enter") {
              e.preventDefault();
              if (visible && activo >= 0 && sugerencias[activo]) elegir(sugerencias[activo]);
              else {
                setAbierto(false);
                resolverEscrito();
              }
            }
          }}
          className="min-w-0 flex-1 bg-transparent font-mono text-sm font-bold text-[var(--text-primary)] outline-none placeholder:font-sans placeholder:font-normal placeholder:text-[var(--text-tertiary)]"
        />
        {valor && (
          <button
            type="button"
            onClick={() => {
              resueltoRef.current = "";
              onValor("");
              inputRef.current?.focus();
            }}
            aria-label="Quitar el código"
            className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </span>
      <ul
        id={listaId}
        role="listbox"
        aria-label="Trozas del patio con ese código"
        hidden={!visible}
        className="absolute left-0 top-full z-40 mt-1 max-h-80 w-[min(22rem,calc(100vw-4rem))] overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-[var(--shadow-lg)]"
      >
        {visible &&
          sugerencias.map((t, i) => (
            <li
              key={t.id}
              id={`${idBase}-op-${i}`}
              role="option"
              aria-selected={i === activo}
              /* `mousedown` y no `click`: el click llega DESPUÉS del blur del
                 input, que ya cerró la lista. */
              onMouseDown={(e) => {
                e.preventDefault();
                elegir(t);
              }}
              onMouseEnter={() => setActivo(i)}
              className={`cursor-pointer px-3 py-2 ${i === activo ? "bg-primary/10" : "hover:bg-[var(--surface-sunken)]"}`}
            >
              <span className="flex items-baseline gap-2 text-sm">
                <span className="min-w-[2.5rem] font-mono font-bold text-[var(--text-primary)]">{t.codigo}</span>
                <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-secondary)]">{t.especie ?? "Sin especie"}</span>
                <span className="shrink-0 font-mono tabular-nums text-[var(--text-secondary)]">
                  {t.m3 != null ? `${fmtM3(t.m3)} m³` : "— m³"}
                </span>
              </span>
              {detalleDeTroza(t) && (
                <span className="mt-0.5 block truncate text-xs text-[var(--text-tertiary)]">{detalleDeTroza(t)}</span>
              )}
            </li>
          ))}
      </ul>
      <span className="sr-only" aria-live="polite">
        {visible ? `${sugerencias.length} ${sugerencias.length === 1 ? "troza coincide" : "trozas coinciden"}` : ""}
      </span>
    </div>
  );
}
