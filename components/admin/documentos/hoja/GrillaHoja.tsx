"use client";

/**
 * GrillaHoja — la planilla en pantalla, con el formato del archivo.
 *
 * DOS DECISIONES QUE DEFINEN ESTE COMPONENTE:
 *
 * 1. UNA SOLA CELDA EDITABLE. La primera versión ponía un `<input>` por celda:
 *    con un catálogo real de 68 columnas eso son miles de inputs, el navegador
 *    se arrastra y encima ninguno puede mostrar el formato del archivo (colores,
 *    negritas, celdas combinadas). Acá las celdas son texto formateado y hay un
 *    único editor que aparece sobre la celda activa, como en Excel.
 *
 * 2. SÓLO SE DIBUJAN LAS FILAS VISIBLES. Con el alto real de cada fila se sabe
 *    qué rango cae en pantalla; el resto se compensa con dos espaciadores. Una
 *    planilla de miles de filas abre igual de rápido que una de diez.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CeldaHoja, HojaFormato } from "@/lib/documentos/xlsx-formato";
import { numeroALetra } from "@/lib/documentos/xlsx-formato";

export interface Seleccion { fila: number; columna: number }

const ANCHO_CANAL = 46;   // la columna de números de fila
const MARGEN_FILAS = 8;   // filas de más arriba y abajo, para que el scroll no parpadee
const ALTO_ENCABEZADO = 26;

export default function GrillaHoja({
  hoja, seleccion, onSeleccion, onEditar,
}: {
  hoja: HojaFormato;
  seleccion: Seleccion;
  onSeleccion: (s: Seleccion) => void;
  onEditar: (fila: number, columna: number, valor: string) => void;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLInputElement>(null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [alto, setAlto] = useState(600);

  const totalCols = hoja.filas[0]?.length ?? 0;

  /** Suma acumulada de altos: dice dónde empieza cada fila. */
  const offsets = useMemo(() => {
    const out = [0];
    for (let i = 0; i < hoja.filas.length; i++) {
      out.push(out[i] + (hoja.filasOcultas[i] ? 0 : hoja.altos[i] ?? 20));
    }
    return out;
  }, [hoja]);

  /** Filas y columnas que Excel dejó fijas ("Inmovilizar paneles"). */
  const fijas = Math.min(hoja.congelado.filas, hoja.filas.length);
  const fijasCol = Math.min(hoja.congelado.columnas, totalCols);

  /** Dónde arranca cada columna: para pegar las congeladas a la izquierda. */
  const izquierdas = useMemo(() => {
    const out = [ANCHO_CANAL];
    for (let i = 0; i < hoja.anchos.length; i++) {
      out.push(out[i] + (hoja.columnasOcultas[i] ? 0 : hoja.anchos[i] ?? 64));
    }
    return out;
  }, [hoja.anchos, hoja.columnasOcultas]);

  /** Alto del encabezado + el de las filas congeladas: el techo del scroll. */
  const techo = useMemo(() => {
    let h = ALTO_ENCABEZADO;
    for (let i = 0; i < fijas; i++) h += hoja.filasOcultas[i] ? 0 : hoja.altos[i] ?? 20;
    return h;
  }, [fijas, hoja.altos, hoja.filasOcultas]);

  const rango = useMemo(() => {
    // Las congeladas se dibujan siempre aparte: el rango virtual empieza después.
    const desde = Math.max(fijas, buscarFila(offsets, scrollTop) - MARGEN_FILAS);
    const hasta = Math.min(hoja.filas.length, buscarFila(offsets, scrollTop + alto) + MARGEN_FILAS);
    return { desde, hasta: Math.max(desde, hasta) };
  }, [offsets, scrollTop, alto, hoja.filas.length, fijas]);

  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;
    setAlto(el.clientHeight);
    const ro = new ResizeObserver(() => setAlto(el.clientHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const abrirEditor = useCallback((texto: string) => {
    setBorrador(texto);
    setEditando(true);
    // El input se monta en este render; enfocarlo después.
    requestAnimationFrame(() => editorRef.current?.focus());
  }, []);

  const confirmar = useCallback((mover: 0 | 1) => {
    onEditar(seleccion.fila, seleccion.columna, borrador);
    setEditando(false);
    if (mover) onSeleccion({ ...seleccion, fila: Math.min(hoja.filas.length - 1, seleccion.fila + 1) });
    contenedor.current?.focus();
  }, [borrador, hoja.filas.length, onEditar, onSeleccion, seleccion]);

  /** Deja la celda seleccionada dentro de la parte visible. */
  const asegurarVisible = useCallback((f: number) => {
    const el = contenedor.current;
    if (!el) return;
    const arriba = offsets[f];
    const abajo = offsets[f + 1] ?? arriba;
    if (arriba < el.scrollTop + techoRef.current) el.scrollTop = Math.max(0, arriba - techoRef.current);
    else if (abajo > el.scrollTop + el.clientHeight) el.scrollTop = abajo - el.clientHeight;
  }, [offsets]);

  // El techo cambia con la hoja; se lee por ref para no rehacer el callback.
  const techoRef = useRef(0);
  useEffect(() => { techoRef.current = techo; }, [techo]);

  const teclado = (e: React.KeyboardEvent) => {
    if (editando) return;
    const { fila, columna } = seleccion;
    const mover = (df: number, dc: number) => {
      const f = Math.max(0, Math.min(hoja.filas.length - 1, fila + df));
      const c = Math.max(0, Math.min(totalCols - 1, columna + dc));
      onSeleccion({ fila: f, columna: c });
      asegurarVisible(f);
      e.preventDefault();
    };
    switch (e.key) {
      case "ArrowDown": return mover(1, 0);
      case "ArrowUp": return mover(-1, 0);
      case "ArrowLeft": return mover(0, -1);
      case "ArrowRight": case "Tab": return mover(0, e.shiftKey && e.key === "Tab" ? -1 : 1);
      case "PageDown": return mover(20, 0);
      case "PageUp": return mover(-20, 0);
      case "Home": return mover(0, -columna);
      case "Enter": case "F2":
        e.preventDefault();
        return abrirEditor(hoja.filas[fila]?.[columna]?.crudo ?? "");
      case "Delete": case "Backspace":
        e.preventDefault();
        return onEditar(fila, columna, "");
      default:
        // Escribir directamente reemplaza el contenido, como en Excel.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          abrirEditor(e.key);
        }
    }
  };

  const celdaActiva = hoja.filas[seleccion.fila]?.[seleccion.columna];

  /** Una fila de la planilla. `fija` = pegada arriba (panel congelado). */
  const renderFila = (f: number, fija: boolean) => {
    const fila = hoja.filas[f];
    if (!fila || hoja.filasOcultas[f]) return null;
    // Las fijas se apilan bajo el encabezado, cada una tras la anterior.
    const top = fija ? ALTO_ENCABEZADO + (offsets[f] - offsets[0]) : undefined;
    return (
      <tr key={f} style={{ height: hoja.altos[f] }}>
        <th
          scope="row"
          style={fija ? { position: "sticky", top, zIndex: 25 } : undefined}
          className={`sticky left-0 z-10 border border-[var(--rule-base)] px-1 text-center text-[length:var(--ts-2xs)] font-bold ${
            f === seleccion.fila
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          }`}
        >
          {f + 1}
        </th>
        {fila.map((celda, c) => {
          if (celda.tapada) return null;
          const activa = f === seleccion.fila && c === seleccion.columna;
          const colFija = c < fijasCol;
          const pegado: React.CSSProperties = (fija || colFija)
            ? {
                position: "sticky",
                top: fija ? top : undefined,
                left: colFija ? izquierdas[c] : undefined,
                // Sin fondo propio, el contenido de abajo se transparenta al
                // pasar por debajo de una celda pegada.
                backgroundColor: celda.estilo?.fondo ?? "var(--surface-raised)",
                zIndex: fija && colFija ? 24 : fija ? 22 : 12,
              }
            : {};
          return (
            <td
              key={c}
              hidden={hoja.columnasOcultas[c]}
              colSpan={celda.colspan}
              rowSpan={celda.rowspan}
              onMouseDown={() => { setEditando(false); onSeleccion({ fila: f, columna: c }); }}
              onDoubleClick={() => abrirEditor(celda.crudo)}
              style={{ ...estiloTd(celda), ...pegado }}
              className={`relative overflow-hidden border border-[var(--rule-soft)] px-1.5 text-sm ${
                activa ? "outline outline-2 -outline-offset-2 outline-[var(--accent)]" : ""
              }`}
              title={celda.formula ? `=${celda.formula}` : undefined}
            >
              {activa && editando ? (
                <input
                  ref={editorRef}
                  value={borrador}
                  onChange={(e) => setBorrador(e.target.value)}
                  onBlur={() => confirmar(0)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { e.preventDefault(); confirmar(1); }
                    else if (e.key === "Escape") { e.preventDefault(); setEditando(false); contenedor.current?.focus(); }
                    else if (e.key === "Tab") { e.preventDefault(); confirmar(0); }
                  }}
                  aria-label={`${numeroALetra(c + 1)}${f + 1}`}
                  className="absolute inset-0 z-10 w-full bg-[var(--surface-raised)] px-1.5 text-sm text-[var(--text-primary)] outline-2 outline-[var(--accent)]"
                />
              ) : (
                <span className="block truncate">{celda.texto}</span>
              )}
            </td>
          );
        })}
      </tr>
    );
  };

  return (
    <div
      ref={contenedor}
      tabIndex={0}
      onKeyDown={teclado}
      onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
      className="min-h-0 flex-1 overflow-auto outline-none focus:ring-2 focus:ring-inset focus:ring-[var(--accent)]/40"
      role="grid"
      aria-label={`Hoja ${hoja.nombre}`}
    >
      <table className="border-collapse" style={{ tableLayout: "fixed", width: "max-content" }}>
        <colgroup>
          <col style={{ width: ANCHO_CANAL }} />
          {hoja.anchos.map((w, i) => (
            <col key={i} style={{ width: hoja.columnasOcultas[i] ? 0 : w }} />
          ))}
        </colgroup>
        <thead>
          <tr style={{ height: ALTO_ENCABEZADO }}>
            <th className="sticky left-0 top-0 z-30 border border-[var(--rule-base)] bg-[var(--surface-sunken)]" />
            {hoja.anchos.map((_, c) => (
              <th
                key={c}
                hidden={hoja.columnasOcultas[c]}
                style={c < fijasCol ? { position: "sticky", left: izquierdas[c], zIndex: 28 } : undefined}
                className={`sticky top-0 z-20 border border-[var(--rule-base)] px-1 text-[length:var(--ts-2xs)] font-bold ${
                  c === seleccion.columna
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                }`}
              >
                {numeroALetra(c + 1)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {/* Las filas congeladas se dibujan siempre y quedan pegadas arriba:
              en un catálogo largo, perder el encabezado al bajar lo vuelve
              ilegible (es el "Inmovilizar paneles" del archivo). */}
          {Array.from({ length: fijas }, (_, f) => renderFila(f, true))}
          {rango.desde > fijas && <tr style={{ height: offsets[rango.desde] - offsets[fijas] }} aria-hidden />}
          {hoja.filas.slice(rango.desde, rango.hasta).map((_, i) => renderFila(rango.desde + i, false))}
          {rango.hasta < hoja.filas.length && (
            <tr style={{ height: offsets[hoja.filas.length] - offsets[rango.hasta] }} aria-hidden />
          )}
        </tbody>
      </table>
      <p className="sr-only" aria-live="polite">
        {numeroALetra(seleccion.columna + 1)}{seleccion.fila + 1}: {celdaActiva?.texto || "vacía"}
      </p>
    </div>
  );
}

/** Estilo de la celda tal como viene del archivo. */
function estiloTd(celda: CeldaHoja): React.CSSProperties {
  const e = celda.estilo;
  if (!e) return {};
  return {
    fontWeight: e.negrita ? 700 : undefined,
    fontStyle: e.cursiva ? "italic" : undefined,
    textDecoration: e.subrayado ? "underline" : undefined,
    color: e.color,
    backgroundColor: e.fondo,
    fontSize: e.tamano ? `${e.tamano}px` : undefined,
    textAlign: e.alineacion,
    verticalAlign: e.alineacionVertical === "middle" ? "middle" : e.alineacionVertical,
    whiteSpace: e.ajustarTexto ? "normal" : undefined,
    // Los bordes del archivo se marcan más fuerte que la cuadrícula base.
    borderTopColor: e.bordes?.arriba ? "var(--rule-strong)" : undefined,
    borderBottomColor: e.bordes?.abajo ? "var(--rule-strong)" : undefined,
    borderLeftColor: e.bordes?.izq ? "var(--rule-strong)" : undefined,
    borderRightColor: e.bordes?.der ? "var(--rule-strong)" : undefined,
  };
}

/** Primera fila cuyo final pasa `y` — búsqueda binaria sobre los acumulados. */
function buscarFila(offsets: number[], y: number): number {
  let lo = 0, hi = offsets.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (offsets[mid + 1] <= y) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
