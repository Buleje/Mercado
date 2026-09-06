"use client";

/**
 * Selección de celdas y arrastre de relleno, como en una planilla.
 *
 * Dos gestos que el aserradero da por sentados porque los tiene en Excel:
 *
 *  · **Marcar un rango y ver la cuenta.** «De estas ocho filas, ¿cuánto pie
 *    tablar me dan?» El total del pie de tabla contesta por el lote o por el
 *    filtro, nunca por una selección a dedo — así que había que sacar la
 *    calculadora al lado de la pantalla.
 *  · **Arrastrar hacia abajo para repetir un valor.** Cargar cuarenta piezas de
 *    Tornillo obligaba a abrir cuarenta veces el mismo `<select>`.
 *
 * La cuenta vive en `lib/forestal/seleccion-celdas.ts` (pura y testeada); acá
 * están sólo el gesto y el dibujo.
 *
 * Cómo se ubican las celdas: `data-sel-fila` / `data-sel-col` dentro de un
 * contenedor `data-seleccion="<id>"`. Mismo criterio que `celdas-excel.tsx` —
 * por selector y no por refs, así sobrevive al filtrado y al reordenado.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Copy, X } from "@buleje/design-system/icons";
import {
  describirRango,
  dentroDelRango,
  estadisticasDelRango,
  filasARellenar,
  normalizarRango,
  rangoATsv,
  type Celda,
  type Rango,
} from "@/lib/forestal/seleccion-celdas";

export type { Celda, Rango };

/** Una columna que se puede marcar, y cómo se lee su valor. */
export interface ColumnaSeleccionable {
  col: number;
  label: string;
  /** Unidad para el pie de la barra ("PT", "m³", "pzas"). Sin unidad = adimensional. */
  unidad?: string;
  /** Decimales al mostrar la suma y el promedio. */
  decimales?: number;
  /** El número de esa celda; `null` si la celda no tiene uno. */
  leer: (fila: number) => number | null;
  /** Texto para copiar al portapapeles. Por defecto, el número tal cual. */
  texto?: (fila: number) => string;
}

export interface SeleccionRango {
  rango: Rango | null;
  activa: boolean;
  /** Props para el `<td>` de una celda seleccionable. */
  props: (fila: number, col: number) => {
    onMouseDown: (e: React.MouseEvent) => void;
    onMouseEnter: () => void;
    "data-sel-fila": number;
    "data-sel-col": number;
    "aria-selected": boolean;
  };
  seleccionada: (fila: number, col: number) => boolean;
  /** Marca la columna entera (click en su encabezado). */
  marcarColumna: (col: number, filas: number) => void;
  limpiar: () => void;
}

export function useSeleccionRango(filasTotales: number): SeleccionRango {
  const [ancla, setAncla] = useState<Celda | null>(null);
  const [foco, setFoco] = useState<Celda | null>(null);
  const [arrastrando, setArrastrando] = useState(false);

  const rango = useMemo(() => (ancla && foco ? normalizarRango(ancla, foco) : null), [ancla, foco]);

  // El botón puede soltarse fuera de la tabla: sin un listener en `window` la
  // selección se quedaba "pegada" al mouse y seguía creciendo al pasar por encima.
  useEffect(() => {
    if (!arrastrando) return;
    const soltar = () => setArrastrando(false);
    window.addEventListener("mouseup", soltar);
    return () => window.removeEventListener("mouseup", soltar);
  }, [arrastrando]);

  const limpiar = useCallback(() => {
    setAncla(null);
    setFoco(null);
    setArrastrando(false);
  }, []);

  useEffect(() => {
    if (!rango) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") limpiar();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [rango, limpiar]);

  const props = useCallback(
    (fila: number, col: number) => ({
      onMouseDown: (e: React.MouseEvent) => {
        // Sólo el botón principal, y no cuando se está usando un control de
        // adentro (un select, un input): ahí el gesto es escribir, no marcar.
        if (e.button !== 0) return;
        const t = e.target as HTMLElement;
        if (t.closest("input, select, button, a, [data-no-seleccion]")) return;
        e.preventDefault();
        if (e.shiftKey && ancla) {
          setFoco({ fila, col });
        } else {
          setAncla({ fila, col });
          setFoco({ fila, col });
        }
        setArrastrando(true);
      },
      onMouseEnter: () => {
        if (arrastrando) setFoco({ fila, col });
      },
      "data-sel-fila": fila,
      "data-sel-col": col,
      "aria-selected": dentroDelRango(rango, { fila, col }),
    }),
    [ancla, arrastrando, rango],
  );

  const marcarColumna = useCallback((col: number, filas: number) => {
    if (filas <= 0) return;
    setAncla({ fila: 0, col });
    setFoco({ fila: filas - 1, col });
  }, []);

  return {
    rango,
    activa: rango != null && filasTotales > 0,
    props,
    seleccionada: (fila, col) => dentroDelRango(rango, { fila, col }),
    marcarColumna,
    limpiar,
  };
}

const fmt = (v: number, d: number) =>
  v.toLocaleString("es-PE", { minimumFractionDigits: d, maximumFractionDigits: d });

/**
 * La barra de abajo, con la cuenta de lo marcado.
 *
 * Flotante y fija al pie de la ventana como la de Excel: la tabla puede tener
 * trescientas filas y la selección quedar fuera de la pantalla, y una barra que
 * hay que ir a buscar no sirve de nada.
 */
export function BarraSeleccion({
  rango,
  columnas,
  onLimpiar,
}: {
  rango: Rango | null;
  columnas: readonly ColumnaSeleccionable[];
  onLimpiar: () => void;
}) {
  const [copiado, setCopiado] = useState(false);

  /**
   * Mientras la barra está, los toasts suben.
   *
   * Ambos son `fixed` abajo y el toast tiene más `z-index`, así que tapaba
   * «Copiar» y la cruz justo cuando se acaba de rellenar algo — el momento en
   * que los dos aparecen juntos. Se coordinan por una CSS var en vez de
   * importarse entre sí: la pila de toasts no tiene por qué saber que existe
   * una barra de selección.
   */
  useEffect(() => {
    if (!rango) return;
    const raiz = document.documentElement;
    raiz.style.setProperty("--pila-toasts-bottom", "4rem");
    // Llaves a propósito: `removeProperty` devuelve un string y el cleanup de
    // un efecto tiene que devolver `void`.
    return () => {
      raiz.style.removeProperty("--pila-toasts-bottom");
    };
  }, [rango]);

  const porColumna = useMemo(() => {
    if (!rango) return [];
    return columnas
      .filter((c) => c.col >= rango.colIni && c.col <= rango.colFin)
      .map((c) => ({
        col: c,
        stats: estadisticasDelRango(
          { ...rango, colIni: c.col, colFin: c.col },
          (fila) => c.leer(fila),
        ),
      }))
      .filter((x) => x.stats.numeros > 0);
  }, [rango, columnas]);

  const copiar = useCallback(async () => {
    if (!rango) return;
    const cols = columnas.filter((c) => c.col >= rango.colIni && c.col <= rango.colFin);
    const tsv = rangoATsv({ ...rango, colIni: 0, colFin: cols.length - 1 }, (fila, i) => {
      const c = cols[i];
      if (!c) return "";
      if (c.texto) return c.texto(fila);
      const v = c.leer(fila);
      // Coma decimal: es lo que el Excel es-PE reconoce como número al pegar.
      return v == null ? "" : String(v).replace(".", ",");
    });
    try {
      await navigator.clipboard.writeText(tsv);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch (err) {
      console.warn("[seleccion-celdas] no se pudo copiar", err);
    }
  }, [rango, columnas]);

  if (!rango) return null;

  return (
    <>
      {/* Reserva el alto de la barra en el flujo del documento: al ser `fixed`,
          sin esto tapa el final de la pantalla y no hay forma de llegar a lo que
          quedó abajo. */}
      <div aria-hidden className="h-14" />
    <div
      role="status"
      aria-live="polite"
      data-barra-seleccion
      className="fixed inset-x-0 bottom-0 z-40 border-t-2 border-[var(--accent)] bg-[var(--surface-raised)] px-4 py-2 shadow-[var(--shadow-lg)]"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-1.5">
        <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-[var(--ls-wider)] text-[var(--accent)]">
          {describirRango(rango)}
        </span>

        {porColumna.length === 0 ? (
          <span className="text-sm text-[var(--text-tertiary)]">
            Sin números en la selección — marcá Cant., Pie tablar o m³ para ver la cuenta.
          </span>
        ) : (
          porColumna.map(({ col, stats }) => {
            const d = col.decimales ?? 2;
            const u = col.unidad ? ` ${col.unidad}` : "";
            return (
              <span key={col.col} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-[length:var(--ts-2xs)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
                  {col.label}
                </span>
                <Dato t="Suma" v={`${fmt(stats.suma, d)}${u}`} fuerte />
                <Dato t="Recuento" v={String(stats.numeros)} />
                {stats.promedio != null && <Dato t="Promedio" v={`${fmt(stats.promedio, d)}${u}`} />}
                {stats.minimo != null && <Dato t="Mín" v={fmt(stats.minimo, d)} />}
                {stats.maximo != null && <Dato t="Máx" v={fmt(stats.maximo, d)} />}
              </span>
            );
          })
        )}

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => void copiar()}
            className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-2.5 py-1 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)] hover:bg-primary/10"
          >
            <Copy className="h-3.5 w-3.5" aria-hidden /> {copiado ? "Copiado" : "Copiar"}
          </button>
          <button
            type="button"
            onClick={onLimpiar}
            aria-label="Quitar la selección"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]"
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </div>
    </>
  );
}

function Dato({ t, v, fuerte = false }: { t: string; v: string; fuerte?: boolean }) {
  return (
    <span className="whitespace-nowrap text-sm text-[var(--text-secondary)]">
      {t}{" "}
      <span
        className={`font-mono tabular-nums ${fuerte ? "text-base font-extrabold text-[var(--text-primary)]" : "font-bold text-[var(--text-primary)]"}`}
      >
        {v}
      </span>
    </span>
  );
}

/** Clase para el `<td>` de una celda marcada. */
export const CELDA_SELECCIONADA =
  "bg-primary/15 outline outline-1 -outline-offset-1 outline-[var(--accent)]/50";

export interface Relleno {
  /** Fila donde arrancó el arrastre; `null` si no hay uno en curso. */
  origen: number | null;
  /** Última fila tocada — hasta acá se va a rellenar. */
  hasta: number | null;
  /** Las filas que quedarían pisadas ahora mismo (para la vista previa). */
  objetivo: number[];
  iniciar: (fila: number) => void;
  extender: (fila: number) => void;
}

/**
 * Arrastre de relleno: se toma el asa de una celda y se baja.
 *
 * `onAplicar` recibe las filas a pisar; el valor lo pone el llamador desde la
 * fila de origen. Así el mismo gesto sirve para especie, tipo o cualquier
 * columna que se agregue después.
 */
export function useRellenoArrastre(onAplicar: (origen: number, filas: number[]) => void): Relleno {
  const [origen, setOrigen] = useState<number | null>(null);
  const [hasta, setHasta] = useState<number | null>(null);
  // En refs además del estado: el `mouseup` global se dispara fuera de React y
  // necesita el valor del momento. Leerlo desde un updater de `setState` haría
  // el trabajo dentro de la fase de render — en StrictMode se aplicaría dos veces.
  const ref = useRef({ origen, hasta, onAplicar });
  ref.current = { origen, hasta, onAplicar };

  useEffect(() => {
    if (origen == null) return;
    const soltar = () => {
      const { origen: o, hasta: h, onAplicar: aplicar } = ref.current;
      if (o != null && h != null && h !== o) aplicar(o, filasARellenar(o, h));
      setOrigen(null);
      setHasta(null);
    };
    window.addEventListener("mouseup", soltar);
    return () => window.removeEventListener("mouseup", soltar);
  }, [origen]);

  return {
    origen,
    hasta,
    objetivo: origen != null && hasta != null ? filasARellenar(origen, hasta) : [],
    iniciar: (fila) => {
      setOrigen(fila);
      setHasta(fila);
    },
    extender: (fila) => {
      if (ref.current.origen != null) setHasta(fila);
    },
  };
}

/** El cuadradito de la esquina que se arrastra hacia abajo. */
export function AsaRelleno({ onTomar, titulo }: { onTomar: () => void; titulo: string }) {
  return (
    <span
      role="presentation"
      data-no-seleccion
      title={titulo}
      onMouseDown={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onTomar();
      }}
      className="absolute -bottom-1 -right-1 h-2.5 w-2.5 cursor-crosshair rounded-[2px] border border-[var(--surface-raised)] bg-[var(--accent)] opacity-0 transition-opacity group-hover/celda:opacity-100"
    />
  );
}
