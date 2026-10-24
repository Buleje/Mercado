"use client";

/**
 * TablaHojaLectura — la planilla como se ve en Excel, en modo lectura.
 *
 * La vista previa del drive mostraba los valores en una grilla gris de 60×20:
 * sin monedas ("1200" en vez de "S/ 1,200.00"), sin colores, sin celdas
 * combinadas y con los anchos todos iguales. Un presupuesto o un catálogo real
 * quedaban irreconocibles y había que bajarlos igual, que es justo lo que la
 * vista previa vino a evitar.
 *
 * Acá se dibuja el MISMO modelo que usa el editor (`HojaFormato`) con el mismo
 * traductor de estilos (`hoja-estilo`), así el archivo se ve igual mirándolo
 * que editándolo. Lo que no comparte con el editor es todo lo de escribir: acá
 * no hay celda editable, ni arrastre de relleno, ni menú contextual.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CeldaHoja, HojaFormato } from "@/lib/documentos/xlsx-formato";
import { numeroALetra } from "@/lib/documentos/xlsx-formato";
import { estiloDeCeldaCss } from "@/lib/documentos/hoja-estilo";
import { anchoEnPantalla, FUENTE_HOJA, TAMANO_BASE_PX } from "@/lib/documentos/hoja-metricas";
import { dentro, normalizar, type Punto, type Rango } from "@/lib/documentos/hoja-rango";
import { useTheme } from "@/contexts/theme-context";

const ANCHO_CANAL = 46;
const ALTO_ENCABEZADO = 26;
const PADDING_CELDA = 3;

/**
 * La hoja sigue después de los datos.
 *
 * Con sólo el rango usado, una planilla de 5 columnas se veía como un cuadrito
 * pegado arriba a la izquierda y media pantalla en blanco: no parecía una
 * planilla. Se dibujan las celdas vacías que hagan falta para llegar a los
 * bordes, igual que Excel.
 */
const FILAS_EXTRA = 12;
const COLUMNAS_EXTRA = 4;
const ALTO_DEFECTO = 20;
const ANCHO_DEFECTO = 64;
const CELDA_VACIA: CeldaHoja = { texto: "", crudo: "" };

export default function TablaHojaLectura({
  hoja, hasta, rango, onRango, busqueda, activa,
}: {
  hoja: HojaFormato;
  /** Cuántas filas dibujar (la vista previa muestra de a tandas). */
  hasta: number;
  rango: Rango;
  onRango: (r: Rango) => void;
  /** Texto buscado: se marcan las celdas que lo contienen. */
  busqueda: string;
  /** Coincidencia activa del buscador — se centra en pantalla. */
  activa: Punto | null;
}) {
  const { resolved: tema } = useTheme();
  const sel = useMemo(() => normalizar(rango), [rango]);
  const tablaRef = useRef<HTMLTableElement>(null);
  const [caja, setCaja] = useState({ ancho: 900, alto: 460 });

  useEffect(() => {
    const el = tablaRef.current?.parentElement;
    if (!el) return;
    const medir = () => setCaja({ ancho: el.clientWidth, alto: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const colsDatos = Math.max(hoja.anchos.length, ...hoja.filas.map((f) => f.length), 1);
  /** Columnas dibujadas: las del archivo + las que llenan el ancho visible. */
  const totalCols = useMemo(() => {
    const entran = Math.ceil((caja.ancho - ANCHO_CANAL) / ANCHO_DEFECTO) + 1;
    return Math.max(colsDatos + COLUMNAS_EXTRA, entran, 10);
  }, [caja.ancho, colsDatos]);
  const anchos = useMemo(
    () => Array.from({ length: totalCols }, (_, i) => anchoEnPantalla(hoja.anchos[i] ?? ANCHO_DEFECTO)),
    [hoja.anchos, totalCols],
  );
  /**
   * Ancho REAL de la tabla, no el del contenedor.
   *
   * Sin esto, `table-layout: fixed` reparte el ancho disponible entre las
   * columnas: en un celular la planilla entera se apretaba hasta que no se leía
   * nada. Con el ancho propio, el contenedor scrollea de costado como Excel.
   */
  const anchoTotal = useMemo(
    () => ANCHO_CANAL + anchos.reduce((s, w, i) => s + (hoja.columnasOcultas[i] ? 0 : w), 0),
    [anchos, hoja.columnasOcultas],
  );
  /** Filas dibujadas: las cargadas + las que llenan el alto visible. */
  const filas = useMemo(() => {
    const conDatos = Math.min(hasta, hoja.filas.length);
    const entran = Math.ceil(caja.alto / ALTO_DEFECTO) + 1;
    // Las de relleno sólo se agregan cuando ya se muestra TODO el archivo: si
    // no, taparían el botón de "mostrar más filas" con celdas vacías.
    return conDatos >= hoja.filas.length ? Math.max(conDatos + FILAS_EXTRA, entran) : conDatos;
  }, [caja.alto, hasta, hoja.filas.length]);
  const aguja = busqueda.trim().toLowerCase();

  /** Filas congeladas del archivo: se pegan abajo del encabezado de letras. */
  const fijas = Math.min(hoja.congelado.filas, filas);
  const topes = useMemo(() => {
    const out: number[] = [];
    let acumulado = ALTO_ENCABEZADO;
    for (let f = 0; f < fijas; f++) {
      out.push(acumulado);
      acumulado += hoja.altos[f] ?? 20;
    }
    return out;
  }, [fijas, hoja.altos]);

  /** Columnas congeladas: cada una arranca donde termina la anterior. */
  const fijasCol = Math.min(hoja.congelado.columnas, totalCols);
  const izquierdas = useMemo(() => {
    const out: number[] = [];
    let acumulado = ANCHO_CANAL;
    for (let c = 0; c < fijasCol; c++) {
      out.push(acumulado);
      acumulado += hoja.columnasOcultas[c] ? 0 : (anchos[c] ?? 64);
    }
    return out;
  }, [anchos, fijasCol, hoja.columnasOcultas]);

  /** La coincidencia activa se centra sola: buscar sin esto no sirve de nada. */
  const refActiva = useCallback((nodo: HTMLTableCellElement | null) => {
    nodo?.scrollIntoView({ block: "center", inline: "center" });
  }, []);

  // La columna se selecciona ENTERA, no hasta donde llegó lo dibujado: quien
  // hace clic en "C" quiere el total de la columna, no el de las primeras 120
  // filas. El rango que se muestra abajo dice hasta dónde llega, así que el
  // número no engaña.
  const seleccionarColumna = (c: number) =>
    onRango({ ancla: { fila: 0, columna: c }, foco: { fila: hoja.filas.length - 1, columna: c } });
  const seleccionarFila = (f: number) =>
    onRango({ ancla: { fila: f, columna: 0 }, foco: { fila: f, columna: totalCols - 1 } });

  return (
    <table
      ref={tablaRef}
      // `hoja-grilla`: el admin convierte las tablas en cards en pantallas
      // chicas y una planilla no sobrevive a eso (ver globals.css).
      className="hoja-grilla select-text border-collapse"
      style={{ tableLayout: "fixed", width: anchoTotal, fontFamily: FUENTE_HOJA, fontSize: TAMANO_BASE_PX }}
    >
      <colgroup>
        <col style={{ width: ANCHO_CANAL }} />
        {anchos.map((w, i) => (
          <col key={i} style={{ width: hoja.columnasOcultas[i] ? 0 : w }} />
        ))}
      </colgroup>
      <thead>
        <tr style={{ height: ALTO_ENCABEZADO }}>
          <th className="sticky left-0 top-0 z-30 border border-[var(--rule-base)] bg-[var(--surface-sunken)]" />
          {anchos.map((_, c) => (
            <th
              key={c}
              hidden={hoja.columnasOcultas[c]}
              onClick={() => seleccionarColumna(c)}
              style={c < fijasCol ? { position: "sticky", left: izquierdas[c], zIndex: 28 } : undefined}
              className={`sticky top-0 z-20 cursor-pointer border border-[var(--rule-base)] px-1 text-[length:var(--ts-2xs)] font-bold ${
                c >= sel.colIni && c <= sel.colFin
                  ? "bg-[var(--accent)] text-white"
                  : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
              }`}
              title={`Columna ${numeroALetra(c + 1)} — clic para ver su total`}
            >
              {numeroALetra(c + 1)}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {Array.from({ length: filas }, (_, f) => {
          if (hoja.filasOcultas[f]) return null;
          const fila = hoja.filas[f] ?? [];
          const fija = f < fijas;
          return (
            <tr key={f} style={{ height: hoja.altos[f] ?? ALTO_DEFECTO }}>
              <th
                scope="row"
                onClick={() => seleccionarFila(f)}
                style={fija ? { position: "sticky", top: topes[f], zIndex: 25 } : undefined}
                className={`sticky left-0 z-10 cursor-pointer border border-[var(--rule-base)] px-1 text-center text-[length:var(--ts-2xs)] font-bold ${
                  f >= sel.filaIni && f <= sel.filaFin
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                }`}
              >
                {f + 1}
              </th>
              {Array.from({ length: totalCols }, (_, c) => {
                const celda = fila[c] ?? CELDA_VACIA;
                return (
                <Celda
                  key={c}
                  celda={celda}
                  fila={f}
                  columna={c}
                  oculta={hoja.columnasOcultas[c]}
                  tema={tema}
                  fija={fija}
                  top={fija ? topes[f] : undefined}
                  izquierda={c < fijasCol ? izquierdas[c] : undefined}
                  enSeleccion={dentro(sel, f, c)}
                  coincide={aguja !== "" && (celda.texto ?? "").toLowerCase().includes(aguja)}
                  esActiva={activa?.fila === f && activa.columna === c}
                  refActiva={refActiva}
                  onClick={(e) => onRango(e.shiftKey
                    ? { ancla: rango.ancla, foco: { fila: f, columna: c } }
                    : { ancla: { fila: f, columna: c }, foco: { fila: f, columna: c } })}
                />
                );
              })}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Celda({
  celda, fila, columna, oculta, tema, fija, top, izquierda,
  enSeleccion, coincide, esActiva, refActiva, onClick,
}: {
  celda: CeldaHoja;
  fila: number;
  columna: number;
  oculta: boolean;
  tema: "light" | "dark";
  fija: boolean;
  top?: number;
  izquierda?: number;
  enSeleccion: boolean;
  coincide: boolean;
  esActiva: boolean;
  refActiva: (nodo: HTMLTableCellElement | null) => void;
  onClick: (e: React.MouseEvent) => void;
}) {
  // Tapada por el colspan de una celda combinada a su izquierda: en Excel no
  // se ve, acá tampoco.
  if (celda.tapada) return null;

  // Una celda pegada (fila o columna congelada) necesita fondo propio: sin él
  // se le transparenta el contenido que pasa por debajo al hacer scroll.
  const pegado: React.CSSProperties = (fija || izquierda !== undefined)
    ? {
        position: "sticky",
        top: fija ? top : undefined,
        left: izquierda,
        backgroundColor: celda.estilo?.fondo ?? "var(--surface-raised)",
        zIndex: fija && izquierda !== undefined ? 24 : fija ? 22 : 12,
      }
    : {};

  return (
    <td
      ref={esActiva ? refActiva : undefined}
      hidden={oculta}
      colSpan={celda.colspan}
      onClick={onClick}
      style={{
        ...estiloDeCeldaCss(celda, tema),
        ...pegado,
        paddingLeft: PADDING_CELDA,
        paddingRight: PADDING_CELDA,
        // Continuación de una celda combinada de arriba: sin línea divisoria,
        // para que el bloque se lea como uno solo.
        ...(celda.continuaArriba ? { borderTopColor: "transparent" } : null),
      }}
      className={`relative overflow-hidden border border-[var(--rule-soft)] ${
        esActiva ? "outline outline-2 -outline-offset-2 outline-[var(--data-warning-500)]" : ""
      }`}
      title={celda.formula ? `=${celda.formula}` : undefined}
      data-celda={`${fila}-${columna}`}
    >
      {/* Lo pintado va ENCIMA, así no se pierde el color que trae el archivo. */}
      {enSeleccion && (
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[var(--accent)]/15" />
      )}
      {coincide && !esActiva && (
        <span aria-hidden className="pointer-events-none absolute inset-0 bg-[var(--data-warning-500)]/25" />
      )}
      <span className={celda.estilo?.ajustarTexto ? "relative block whitespace-pre-wrap break-words" : "relative block truncate"}>
        {celda.texto}
      </span>
    </td>
  );
}
