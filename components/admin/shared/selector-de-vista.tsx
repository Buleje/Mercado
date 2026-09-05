"use client";

/**
 * selector-de-vista — un solo control para llegar a cualquier vista del libro.
 *
 * Antes la navegación eran DOS rieles: las fases del libro y, al lado, las
 * vistas de la fase activa. Funciona con nueve destinos; el Libro CTP tiene
 * VEINTITRÉS, y ahí el segundo riel se comía una fila entera —a veces dos— y en
 * pantallas angostas había que deslizarlo a ciegas para descubrir qué había al
 * final. Un riel que hay que arrastrar para saber qué contiene no es un mapa.
 *
 * Acá va un botón que dice dónde estás («Trazabilidad › Historia del lote») y
 * que al abrirse muestra TODOS los destinos agrupados por fase. Se gana la fila
 * entera y, de paso, se ven las 23 opciones juntas en vez de las 6 de la fase
 * en la que uno cayó.
 *
 * Lo que NO cambia: los atajos `g` + letra siguen yendo directo a su vista sin
 * abrir nada. El que ya sabe moverse no pierde el clic que tenía.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Check, ChevronDown, type LucideIcon } from "@buleje/design-system/icons";

export interface VistaDelSelector {
  key: string;
  label: string;
  icon: LucideIcon;
  hint: string;
  tecla?: string;
}

export interface GrupoDelSelector {
  id: string;
  label: string;
  views: VistaDelSelector[];
}

/** Margen mínimo contra el borde de la ventana. */
const MARGEN = 8;

export default function SelectorDeVista({
  groups,
  view,
  onView,
  alerts,
}: {
  groups: readonly GrupoDelSelector[];
  view?: string;
  onView?: (view: string) => void;
  /** Pendientes por vista: punto al lado de la opción y número en el botón. */
  alerts?: Record<string, number>;
}) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; maxHeight: number } | null>(null);
  /** Índice enfocado para las flechas; `-1` = ninguno todavía. */
  const [foco, setFoco] = useState(-1);
  const botonRef = useRef<HTMLButtonElement>(null);
  const listaRef = useRef<HTMLDivElement>(null);

  /** Todas las vistas en orden, con su grupo — el orden en que se recorre. */
  const planas = useMemo(
    () => groups.flatMap((g) => g.views.map((v) => ({ ...v, grupo: g.label }))),
    [groups],
  );
  const actual = useMemo(() => planas.find((v) => v.key === view) ?? planas[0], [planas, view]);
  const hayGrupos = groups.length > 1;
  const pendientes = useMemo(
    () => planas.reduce((a, v) => a + (alerts?.[v.key] ?? 0), 0),
    [planas, alerts],
  );

  const ubicar = useCallback(() => {
    const b = botonRef.current?.getBoundingClientRect();
    if (!b) return;
    const abajo = window.innerHeight - b.bottom - MARGEN;
    const arriba = b.top - MARGEN;
    /* Si abajo no entra pero arriba sí, se abre hacia arriba: en un portátil la
       barra del libro queda a media pantalla y un menú de 23 filas no entra
       debajo. */
    const haciaArriba = abajo < 260 && arriba > abajo;
    setPos({
      top: haciaArriba ? Math.max(MARGEN, b.top - Math.min(arriba, 560) - 8) : b.bottom + 8,
      left: Math.max(MARGEN, Math.min(b.left, window.innerWidth - 320 - MARGEN)),
      maxHeight: Math.max(220, (haciaArriba ? arriba : abajo) - 8),
    });
  }, []);

  /* `useLayoutEffect`: ubicarlo después de pintar lo hace aparecer un frame en
     la esquina y saltar a su lugar. */
  useLayoutEffect(() => {
    if (abierto) ubicar();
  }, [abierto, ubicar]);

  useEffect(() => {
    if (!abierto) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAbierto(false);
        botonRef.current?.focus();
      }
    };
    /* El menú va en coordenadas de viewport: si algo scrollea o la ventana
       cambia, el botón se movió y el panel queda flotando en el aire.
       `capture` para enterarse también del scroll de contenedores internos. */
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [abierto, ubicar]);

  const abrir = () => {
    setFoco(Math.max(0, planas.findIndex((v) => v.key === view)));
    setAbierto(true);
  };

  const elegir = (key: string) => {
    setAbierto(false);
    onView?.(key);
    botonRef.current?.focus();
  };

  /** Flechas, Inicio/Fin y Enter: es navegación principal, tiene que ir sin mouse. */
  const teclas = (e: React.KeyboardEvent) => {
    if (!abierto) return;
    const ultimo = planas.length - 1;
    if (e.key === "ArrowDown") { e.preventDefault(); setFoco((i) => (i >= ultimo ? 0 : i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setFoco((i) => (i <= 0 ? ultimo : i - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setFoco(0); }
    else if (e.key === "End") { e.preventDefault(); setFoco(ultimo); }
    else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (planas[foco]) elegir(planas[foco].key);
    }
  };

  /* Mantener a la vista la opción enfocada: con 23 destinos, bajar con la
     flecha por debajo del borde deja al que navega sin saber dónde está. */
  useEffect(() => {
    if (!abierto || foco < 0) return;
    listaRef.current?.querySelector<HTMLElement>(`[data-i="${foco}"]`)?.scrollIntoView({ block: "nearest" });
  }, [abierto, foco]);

  if (planas.length <= 1) return null;
  const Icono = actual?.icon;

  return (
    <>
      <button
        ref={botonRef}
        type="button"
        onClick={() => (abierto ? setAbierto(false) : abrir())}
        onKeyDown={teclas}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        title="Elegí a qué parte del libro ir"
        className="inline-flex h-10 max-w-full items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm transition-colors hover:border-[var(--accent)]"
      >
        {Icono && <Icono className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />}
        <span className="min-w-0 truncate">
          {/* La fase va delante y en gris: ubica sin competir con el destino,
              que es lo que se lee. Con un solo grupo no se muestra — sería un
              prefijo que nunca cambia. */}
          {hayGrupos && actual && (
            <span className="text-[var(--text-tertiary)]">{actual.grupo} › </span>
          )}
          <span className="font-bold text-[var(--text-primary)]">{actual?.label}</span>
        </span>
        {pendientes > 0 && (
          <span
            title={`${pendientes} pendiente${pendientes === 1 ? "" : "s"} en el libro`}
            className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-[var(--data-warning-500)] px-1 font-mono text-[length:var(--ts-2xs)] tabular-nums text-white"
          >
            {pendientes}
          </span>
        )}
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-[var(--text-tertiary)] transition-transform ${abierto ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>

      {abierto && pos && (
        <>
          <div className="fixed inset-0 z-[60]" onClick={() => setAbierto(false)} aria-hidden />
          <div
            ref={listaRef}
            role="listbox"
            aria-label="Vistas del libro"
            tabIndex={-1}
            onKeyDown={teclas}
            style={{ top: pos.top, left: pos.left, maxHeight: pos.maxHeight }}
            className="fixed z-[61] w-80 overflow-y-auto overscroll-contain rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] py-1 shadow-[var(--shadow-lg)]"
          >
            {groups.map((g) => (
              <div key={g.id}>
                {hayGrupos && (
                  <p className="px-3 pb-1 pt-2 text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">
                    {g.label}
                  </p>
                )}
                {g.views.map((v) => {
                  const i = planas.findIndex((x) => x.key === v.key);
                  const activo = v.key === view;
                  const VIcon = v.icon;
                  const pendiente = alerts?.[v.key] ?? 0;
                  return (
                    <button
                      key={v.key}
                      type="button"
                      role="option"
                      aria-selected={activo}
                      data-i={i}
                      title={v.tecla ? `${v.hint}  ·  atajo: g ${v.tecla}` : v.hint}
                      onClick={() => elegir(v.key)}
                      onMouseEnter={() => setFoco(i)}
                      className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
                        activo
                          ? "bg-primary/10 font-bold text-[var(--accent-ink)] dark:bg-primary/20 dark:text-[var(--accent)]"
                          : i === foco
                            ? "bg-[var(--surface-sunken)] text-[var(--text-primary)]"
                            : "text-[var(--text-secondary)]"
                      }`}
                    >
                      <VIcon className="h-4 w-4 shrink-0" aria-hidden />
                      <span className="min-w-0 flex-1 truncate">{v.label}</span>
                      {pendiente > 0 && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--data-warning-500)]"
                          title={`${pendiente} pendiente${pendiente === 1 ? "" : "s"}`}
                        />
                      )}
                      {/* La tecla a la derecha: el menú es donde se aprende el
                          atajo que después evita abrirlo. */}
                      {v.tecla && (
                        <kbd className="shrink-0 rounded border border-[var(--rule-base)] px-1 font-mono text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
                          g {v.tecla}
                        </kbd>
                      )}
                      {activo && <Check className="h-4 w-4 shrink-0" aria-hidden />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </>
      )}
    </>
  );
}
