"use client";

/**
 * GrillaHoja — la planilla en pantalla, con el formato del archivo.
 *
 * TRES DECISIONES QUE DEFINEN ESTE COMPONENTE:
 *
 * 1. UNA SOLA CELDA EDITABLE. La primera versión ponía un `<input>` por celda:
 *    con un catálogo real de 68 columnas eso son miles de inputs, el navegador
 *    se arrastra y ninguno puede mostrar el formato del archivo. Acá las celdas
 *    son texto formateado y hay un único editor sobre la celda activa.
 *
 * 2. SÓLO SE DIBUJAN LAS FILAS VISIBLES. Con el alto real de cada fila se sabe
 *    qué rango cae en pantalla; el resto se compensa con espaciadores.
 *
 * 3. EL PORTAPAPELES ES EL DEL SISTEMA. Copiar acá y pegar en Excel funciona,
 *    y al revés también, porque se usa el mismo formato TSV que usa Excel.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CeldaHoja, HojaFormato } from "@/lib/documentos/xlsx-formato";
import { colorMuyOscuro, numeroALetra } from "@/lib/documentos/xlsx-formato";
import { useTheme } from "@/contexts/theme-context";
import {
  aTsv, celdasDe, dentro, desdeTsv, destinoPegado, normalizar,
  type Punto, type Rango,
} from "@/lib/documentos/hoja-rango";
import {
  anchoEnPantalla, anchoParaArchivo, FUENTE_HOJA, ptAPx, TAMANO_BASE_PX,
} from "@/lib/documentos/hoja-metricas";

export type Seleccion = Punto;

const ANCHO_CANAL = 46;
const MARGEN_FILAS = 8;
const ALTO_ENCABEZADO = 26;

/** Excel deja ~3 px a cada lado; con más, el texto entra donde no debería. */
const PADDING_CELDA = 3;
/** Ancho mínimo al arrastrar: por debajo, la columna deja de poder agarrarse. */
const ANCHO_MINIMO = 28;

export interface AccionesGrilla {
  editar: (celdas: { fila: number; columna: number; valor: string }[]) => void;
  ancho: (columna: number, anchoPx: number) => void;
  /** Clic derecho sobre una celda: el editor decide qué menú mostrar. */
  menu?: (x: number, y: number, fila: number, columna: number) => void;
  /** Ctrl+rueda: acercar (+) o alejar (−). */
  zoom?: (delta: number) => void;
}

export default function GrillaHoja({
  hoja, seleccion, rango, onSeleccion, onRango, acciones, resaltado, zoom = 1,
}: {
  hoja: HojaFormato;
  seleccion: Seleccion;
  rango: Rango;
  onSeleccion: (s: Seleccion) => void;
  onRango: (r: Rango) => void;
  acciones: AccionesGrilla;
  /** Celda a la que saltó el buscador, para marcarla. */
  resaltado?: Punto | null;
  /**
   * Escala de la vista (1 = 100%).
   *
   * Se aplica a los tamaños, no con `transform: scale`: así el texto se
   * rasteriza nítido en cada nivel y las medidas de scroll siguen siendo
   * reales (con `scale` el contenedor mide otra cosa y la virtualización
   * calcularía mal qué filas están a la vista).
   */
  zoom?: number;
}) {
  const { resolved: tema } = useTheme();
  const contenedor = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLInputElement>(null);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState("");
  const [scrollTop, setScrollTop] = useState(0);
  const [alto, setAlto] = useState(600);
  const arrastrando = useRef(false);
  /** Columna que se está redimensionando y desde qué x empezó. */
  const resize = useRef<{ columna: number; xInicial: number; anchoInicial: number } | null>(null);
  /** Arrastre del cuadradito de la esquina (rellenar hacia abajo). */
  const rellenando = useRef(false);
  const [filaRelleno, setFilaRelleno] = useState<number | null>(null);

  /**
   * Al montar (abrir el archivo o cambiar de hoja — la grilla se remonta por
   * `key`), el teclado va directo a las celdas: crear una hoja y ponerse a
   * escribir tiene que funcionar sin un clic de más.
   */
  useEffect(() => {
    contenedor.current?.focus({ preventScroll: true });
  }, []);

  /**
   * Cuántas columnas hay de verdad.
   *
   * No alcanza con `anchos.length` ni con la primera fila: al insertar
   * columnas o al escribir fuera de los límites, una fila puede quedar más
   * larga que la lista de anchos. Si el `<colgroup>` no cubre TODAS, las
   * columnas sobrantes toman ancho automático y cambian de tamaño según qué
   * filas estén dibujadas — que es exactamente el ancho "que se mueve solo"
   * al hacer scroll.
   */
  const totalCols = useMemo(
    () => Math.max(hoja.anchos.length, ...hoja.filas.map((f) => f.length), 1),
    [hoja.anchos.length, hoja.filas],
  );

  /**
   * Ancho de cada columna EN PANTALLA.
   *
   * El archivo los trae en las métricas de Excel (Calibri 11); acá se escalan
   * a la fuente con la que el navegador dibuja de verdad. Sin ese ajuste, en
   * una máquina sin Calibri cada columna queda un tercio más angosta que el
   * texto que tiene que mostrar.
   */
  const anchos = useMemo(
    () => Array.from({ length: totalCols }, (_, i) => Math.round(anchoEnPantalla(hoja.anchos[i] ?? 64) * zoom)),
    [hoja.anchos, totalCols, zoom],
  );

  /** Alto de cada fila con el zoom aplicado. */
  const altos = useMemo(
    () => hoja.filas.map((_, i) => Math.round((hoja.altos[i] ?? 20) * zoom)),
    [hoja.altos, hoja.filas, zoom],
  );

  const sel = useMemo(() => normalizar(rango), [rango]);

  const offsets = useMemo(() => {
    const out = [0];
    for (let i = 0; i < hoja.filas.length; i++) {
      out.push(out[i] + (hoja.filasOcultas[i] ? 0 : altos[i] ?? 20));
    }
    return out;
  }, [altos, hoja.filas.length, hoja.filasOcultas]);

  const fijas = Math.min(hoja.congelado.filas, hoja.filas.length);
  const fijasCol = Math.min(hoja.congelado.columnas, totalCols);

  const izquierdas = useMemo(() => {
    const out = [ANCHO_CANAL];
    for (let i = 0; i < anchos.length; i++) {
      out.push(out[i] + (hoja.columnasOcultas[i] ? 0 : anchos[i]));
    }
    return out;
  }, [anchos, hoja.columnasOcultas]);

  /**
   * Ancho total en píxeles. Se declara explícito en vez de dejar
   * `width: max-content`: con `max-content` el navegador MIDE el contenido
   * dibujado, así que al cambiar las filas visibles (virtualización) la tabla
   * cambiaba de ancho sola.
   */
  const anchoTotal = izquierdas[izquierdas.length - 1] ?? ANCHO_CANAL;

  const techo = useMemo(() => {
    let h = ALTO_ENCABEZADO;
    for (let i = 0; i < fijas; i++) h += hoja.filasOcultas[i] ? 0 : altos[i] ?? 20;
    return h;
  }, [altos, fijas, hoja.filasOcultas]);
  const techoRef = useRef(0);
  useEffect(() => { techoRef.current = techo; }, [techo]);

  const visible = useMemo(() => {
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

  // El buscador manda a una celda que puede estar fuera de la parte visible.
  useEffect(() => {
    if (!resaltado) return;
    const el = contenedor.current;
    if (!el) return;
    const arriba = offsets[resaltado.fila];
    if (arriba < el.scrollTop + techoRef.current || arriba > el.scrollTop + el.clientHeight) {
      el.scrollTop = Math.max(0, arriba - techoRef.current - 40);
    }
  }, [resaltado, offsets]);

  const abrirEditor = useCallback((texto: string) => {
    setBorrador(texto);
    setEditando(true);
  }, []);

  /**
   * El foco se toma en `useLayoutEffect` —no en un `requestAnimationFrame`—
   * porque corre apenas React pone el input en el DOM, antes de que el
   * navegador pinte. Con el rAF pasaba un frame entero sin foco y las teclas
   * de ese rato se perdían: escribir "SELVA" rápido dejaba "SVA".
   */
  useLayoutEffect(() => {
    if (!editando) return;
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    // Cursor al final, para poder seguir escribiendo.
    const fin = el.value.length;
    el.setSelectionRange(fin, fin);
  }, [editando]);

  /** Contenido crudo de una celda, con el `=` de las fórmulas. */
  const crudoDe = useCallback((f: number, c: number) => {
    const celda = hoja.filas[f]?.[c];
    if (!celda) return "";
    return celda.formula ? `=${celda.formula}` : celda.crudo;
  }, [hoja.filas]);

  const confirmar = useCallback((mover: 0 | 1) => {
    acciones.editar([{ fila: seleccion.fila, columna: seleccion.columna, valor: borrador }]);
    setEditando(false);
    if (mover) {
      const destino = { fila: Math.min(hoja.filas.length - 1, seleccion.fila + 1), columna: seleccion.columna };
      onSeleccion(destino);
      onRango({ ancla: destino, foco: destino });
    }
    contenedor.current?.focus();
  }, [acciones, borrador, hoja.filas.length, onRango, onSeleccion, seleccion]);

  const asegurarVisible = useCallback((f: number) => {
    const el = contenedor.current;
    if (!el) return;
    const arriba = offsets[f];
    const abajo = offsets[f + 1] ?? arriba;
    if (arriba < el.scrollTop + techoRef.current) el.scrollTop = Math.max(0, arriba - techoRef.current);
    else if (abajo > el.scrollTop + el.clientHeight) el.scrollTop = abajo - el.clientHeight;
  }, [offsets]);

  // ── Portapapeles ──────────────────────────────────────────────────────────
  // Se enganchan los eventos nativos: así el navegador entrega el contenido
  // real del portapapeles del sistema, sin pedir permisos especiales.
  useEffect(() => {
    const el = contenedor.current;
    if (!el) return;

    const copiar = (e: ClipboardEvent, cortar: boolean) => {
      if (editando) return;
      const matriz: string[][] = [];
      for (let f = sel.filaIni; f <= sel.filaFin; f++) {
        const fila: string[] = [];
        for (let c = sel.colIni; c <= sel.colFin; c++) fila.push(crudoDe(f, c));
        matriz.push(fila);
      }
      e.clipboardData?.setData("text/plain", aTsv(matriz));
      e.preventDefault();
      if (cortar) acciones.editar(celdasDe(sel).map((p) => ({ ...p, valor: "" })));
    };

    const pegar = (e: ClipboardEvent) => {
      if (editando) return;
      const texto = e.clipboardData?.getData("text/plain");
      if (!texto) return;
      e.preventDefault();
      acciones.editar(destinoPegado(desdeTsv(texto), sel));
    };

    const onCopy = (e: ClipboardEvent) => copiar(e, false);
    const onCut = (e: ClipboardEvent) => copiar(e, true);
    el.addEventListener("copy", onCopy);
    el.addEventListener("cut", onCut);
    el.addEventListener("paste", pegar);
    return () => {
      el.removeEventListener("copy", onCopy);
      el.removeEventListener("cut", onCut);
      el.removeEventListener("paste", pegar);
    };
  }, [acciones, crudoDe, editando, sel]);

  // ── Rellenar hacia abajo ──────────────────────────────────────────────────
  /**
   * Copia la selección hacia las filas de abajo, como el cuadradito de Excel.
   * Si el bloque copiado tiene varias filas, se repite en ciclo.
   */
  const aplicarRelleno = useCallback((hasta: number) => {
    if (hasta <= sel.filaFin) return;
    const altoBloque = sel.filaFin - sel.filaIni + 1;
    const celdas: { fila: number; columna: number; valor: string }[] = [];
    for (let f = sel.filaFin + 1; f <= hasta; f++) {
      const origen = sel.filaIni + ((f - sel.filaIni) % altoBloque);
      for (let c = sel.colIni; c <= sel.colFin; c++) {
        celdas.push({ fila: f, columna: c, valor: crudoDe(origen, c) });
      }
    }
    if (celdas.length > 0) acciones.editar(celdas);
  }, [acciones, crudoDe, sel]);

  // ── Ctrl+rueda para acercar y alejar ──────────────────────────────────────
  // Se registra a mano con `passive: false`: React marca `onWheel` como pasivo
  // y ahí `preventDefault()` no tiene efecto — el navegador haría ADEMÁS su
  // propio zoom de página, encima del de la planilla.
  useEffect(() => {
    const el = contenedor.current;
    const alZoom = acciones.zoom;
    if (!el || !alZoom) return;
    const rueda = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      alZoom(e.deltaY < 0 ? 0.1 : -0.1);
    };
    el.addEventListener("wheel", rueda, { passive: false });
    return () => el.removeEventListener("wheel", rueda);
  }, [acciones.zoom]);

  // ── Redimensionar columnas ────────────────────────────────────────────────
  useEffect(() => {
    const mover = (e: MouseEvent) => {
      const r = resize.current;
      if (!r) return;
      // Se guarda en las métricas del archivo, no en píxeles de esta pantalla:
      // si no, abrir y guardar en una máquina sin Calibri ensancharía la
      // columna un poco más en cada vuelta.
      const enPantalla = Math.max(ANCHO_MINIMO, r.anchoInicial + (e.clientX - r.xInicial));
      acciones.ancho(r.columna, anchoParaArchivo(enPantalla));
    };
    const soltar = () => { resize.current = null; };
    const soltarRelleno = () => {
      if (!rellenando.current) return;
      rellenando.current = false;
      if (filaRelleno !== null) aplicarRelleno(filaRelleno);
      setFilaRelleno(null);
    };
    window.addEventListener("mousemove", mover);
    window.addEventListener("mouseup", soltar);
    window.addEventListener("mouseup", soltarRelleno);
    return () => {
      window.removeEventListener("mousemove", mover);
      window.removeEventListener("mouseup", soltar);
      window.removeEventListener("mouseup", soltarRelleno);
    };
  }, [acciones, aplicarRelleno, filaRelleno]);

  const teclado = (e: React.KeyboardEvent) => {
    if (editando) return;
    const { fila, columna } = seleccion;

    const irA = (f: number, c: number, extender: boolean) => {
      const destino = {
        fila: Math.max(0, Math.min(hoja.filas.length - 1, f)),
        columna: Math.max(0, Math.min(totalCols - 1, c)),
      };
      onSeleccion(destino);
      // Shift extiende la selección desde donde empezó, como en Excel.
      onRango(extender ? { ancla: rango.ancla, foco: destino } : { ancla: destino, foco: destino });
      asegurarVisible(destino.fila);
      e.preventDefault();
    };

    switch (e.key) {
      case "ArrowDown": return irA(fila + 1, columna, e.shiftKey);
      case "ArrowUp": return irA(fila - 1, columna, e.shiftKey);
      case "ArrowLeft": return irA(fila, columna - 1, e.shiftKey);
      case "ArrowRight": return irA(fila, columna + 1, e.shiftKey);
      case "Tab": return irA(fila, columna + (e.shiftKey ? -1 : 1), false);
      case "PageDown": return irA(fila + 20, columna, e.shiftKey);
      case "PageUp": return irA(fila - 20, columna, e.shiftKey);
      case "Home": return irA(e.ctrlKey ? 0 : fila, 0, e.shiftKey);
      case "End": return irA(e.ctrlKey ? hoja.filas.length - 1 : fila, totalCols - 1, e.shiftKey);
      case "Enter": case "F2":
        e.preventDefault();
        return abrirEditor(crudoDe(fila, columna));
      case "Delete": case "Backspace":
        e.preventDefault();
        return acciones.editar(celdasDe(sel).map((p) => ({ ...p, valor: "" })));
      case "a": case "A":
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          onRango({ ancla: { fila: 0, columna: 0 }, foco: { fila: hoja.filas.length - 1, columna: totalCols - 1 } });
        }
        return;
      default:
        // Escribir directamente reemplaza el contenido, como en Excel.
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          abrirEditor(e.key);
        }
    }
  };

  const renderFila = (f: number, fija: boolean) => {
    const fila = hoja.filas[f];
    if (!fila || hoja.filasOcultas[f]) return null;
    const top = fija ? ALTO_ENCABEZADO + (offsets[f] - offsets[0]) : undefined;
    const filaEnSeleccion = f >= sel.filaIni && f <= sel.filaFin;

    return (
      <tr key={f} style={{ height: altos[f] }}>
        <th
          scope="row"
          onMouseDown={() => {
            onSeleccion({ fila: f, columna: 0 });
            onRango({ ancla: { fila: f, columna: 0 }, foco: { fila: f, columna: totalCols - 1 } });
          }}
          style={fija ? { position: "sticky", top, zIndex: 25 } : undefined}
          className={`sticky left-0 z-10 cursor-pointer border border-[var(--rule-base)] px-1 text-center text-[length:var(--ts-2xs)] font-bold ${
            filaEnSeleccion ? "bg-[var(--accent)] text-white" : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
          }`}
          title={`Fila ${f + 1} — clic para seleccionarla entera`}
        >
          {f + 1}
        </th>
        {fila.map((celda, c) => {
          if (celda.tapada) return null;
          const activa = f === seleccion.fila && c === seleccion.columna;
          const esResaltado = resaltado?.fila === f && resaltado?.columna === c;
          const colFija = c < fijasCol;
          const pegado: React.CSSProperties = (fija || colFija)
            ? {
                position: "sticky",
                top: fija ? top : undefined,
                left: colFija ? izquierdas[c] : undefined,
                backgroundColor: celda.estilo?.fondo ?? "var(--surface-raised)",
                zIndex: fija && colFija ? 24 : fija ? 22 : 12,
              }
            : {};

          return (
            <td
              key={c}
              hidden={hoja.columnasOcultas[c]}
              colSpan={celda.colspan}
              onMouseDown={(e) => {
                if (e.button !== 0) return;
                setEditando(false);
                arrastrando.current = true;
                onSeleccion({ fila: f, columna: c });
                onRango(e.shiftKey
                  ? { ancla: rango.ancla, foco: { fila: f, columna: c } }
                  : { ancla: { fila: f, columna: c }, foco: { fila: f, columna: c } });
              }}
              onMouseEnter={() => {
                if (rellenando.current) { setFilaRelleno(f); return; }
                if (arrastrando.current) onRango({ ancla: rango.ancla, foco: { fila: f, columna: c } });
              }}
              onContextMenu={(e) => {
                if (!acciones.menu) return;
                e.preventDefault();
                // Clic derecho fuera de la selección: se pasa a esa celda.
                if (!dentro(sel, f, c)) {
                  onSeleccion({ fila: f, columna: c });
                  onRango({ ancla: { fila: f, columna: c }, foco: { fila: f, columna: c } });
                }
                acciones.menu(e.clientX, e.clientY, f, c);
              }}
              onDoubleClick={() => abrirEditor(crudoDe(f, c))}
              style={{
                ...estiloTd(celda, tema, zoom),
                ...pegado,
                paddingLeft: PADDING_CELDA,
                paddingRight: PADDING_CELDA,
                // Continuación de una celda combinada de arriba: sin línea
                // divisoria, para que el bloque se lea como uno solo.
                ...(celda.continuaArriba ? { borderTopColor: "transparent" } : null),
              }}
              className={`relative overflow-hidden border border-[var(--rule-soft)] ${
                activa ? "outline outline-2 -outline-offset-2 outline-[var(--accent)]" : ""
              } ${esResaltado ? "ring-2 ring-inset ring-[var(--data-warning-500)]" : ""}`}
              title={celda.formula ? `=${celda.formula}` : undefined}
            >
              {/* La selección se pinta encima, así no tapa el color del archivo. */}
              {dentro(sel, f, c) && !activa && (
                <span aria-hidden className="pointer-events-none absolute inset-0 bg-[var(--accent)]/15" />
              )}
              {/* Vista previa de hasta dónde llega el relleno. */}
              {filaRelleno !== null && f > sel.filaFin && f <= filaRelleno && c >= sel.colIni && c <= sel.colFin && (
                <span aria-hidden className="pointer-events-none absolute inset-0 border border-dashed border-[var(--accent)] bg-[var(--accent)]/8" />
              )}
              {/* Cuadradito de relleno, sobre la esquina de la selección. */}
              {f === sel.filaFin && c === sel.colFin && (
                <span
                  onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); rellenando.current = true; }}
                  title="Arrastrá para copiar hacia abajo"
                  className="absolute -bottom-[3px] -right-[3px] z-30 h-2 w-2 cursor-crosshair rounded-[1px] bg-[var(--accent)]"
                />
              )}
              {activa && editando ? (
                <input
                  ref={editorRef}
                  value={borrador}
                  onChange={(e) => setBorrador(e.target.value)}
                  onBlur={() => confirmar(0)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter") { e.preventDefault(); confirmar(1); }
                    else if (e.key === "Escape") { e.preventDefault(); setEditando(false); contenedor.current?.focus(); }
                    else if (e.key === "Tab") { e.preventDefault(); confirmar(0); }
                  }}
                  aria-label={`${numeroALetra(c + 1)}${f + 1}`}
                  style={{ fontFamily: FUENTE_HOJA, fontSize: TAMANO_BASE_PX * zoom, paddingLeft: PADDING_CELDA, paddingRight: PADDING_CELDA }}
                  className="absolute inset-0 z-20 w-full bg-[var(--surface-raised)] text-[var(--text-primary)] outline-2 outline-[var(--accent)]"
                />
              ) : (
                // `truncate` sólo cuando el archivo NO pide ajustar el texto:
                // si lo pide, la celda tiene el alto reservado para varias
                // líneas y truncar dejaba media frase con puntos suspensivos.
                <span className={celda.estilo?.ajustarTexto ? "relative block whitespace-pre-wrap break-words" : "relative block truncate"}>
                  {celda.continuaArriba ? "" : celda.texto}
                </span>
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
      onMouseUp={() => { arrastrando.current = false; }}
      className="min-h-0 flex-1 overflow-auto outline-none"
      role="grid"
      aria-label={`Hoja ${hoja.nombre}`}
    >
      <table
        className="border-collapse select-none"
        style={{
          tableLayout: "fixed",
          width: anchoTotal,
          fontFamily: FUENTE_HOJA,
          fontSize: TAMANO_BASE_PX * zoom,
        }}
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
                onMouseDown={(e) => {
                  if ((e.target as HTMLElement).dataset.asa) return; // el asa de resize manda
                  onSeleccion({ fila: 0, columna: c });
                  onRango({ ancla: { fila: 0, columna: c }, foco: { fila: hoja.filas.length - 1, columna: c } });
                }}
                style={c < fijasCol ? { position: "sticky", left: izquierdas[c], zIndex: 28 } : undefined}
                className={`sticky top-0 z-20 cursor-pointer border border-[var(--rule-base)] px-1 text-[length:var(--ts-2xs)] font-bold ${
                  c >= sel.colIni && c <= sel.colFin
                    ? "bg-[var(--accent)] text-white"
                    : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
                }`}
                title={`Columna ${numeroALetra(c + 1)} — clic para seleccionarla; arrastrá el borde para cambiar el ancho`}
              >
                {numeroALetra(c + 1)}
                {/* Asa de redimensionado, sobre el borde derecho. */}
                <span
                  data-asa="1"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    resize.current = { columna: c + 1, xInicial: e.clientX, anchoInicial: anchos[c] };
                  }}
                  onDoubleClick={(e) => { e.stopPropagation(); acciones.ancho(c + 1, anchoParaArchivo(140)); }}
                  className="absolute right-0 top-0 h-full w-1.5 cursor-col-resize hover:bg-[var(--accent)]"
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: fijas }, (_, f) => renderFila(f, true))}
          {visible.desde > fijas && (
            <tr style={{ height: offsets[visible.desde] - offsets[fijas] }} aria-hidden>
              <td colSpan={totalCols + 1} />
            </tr>
          )}
          {hoja.filas.slice(visible.desde, visible.hasta).map((_, i) => renderFila(visible.desde + i, false))}
          {visible.hasta < hoja.filas.length && (
            <tr style={{ height: offsets[hoja.filas.length] - offsets[visible.hasta] }} aria-hidden>
              <td colSpan={totalCols + 1} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Estilo de la celda tal como viene del archivo. */
function estiloTd(celda: CeldaHoja, tema: "light" | "dark", zoom: number): React.CSSProperties {
  const e = celda.estilo;
  // Excel alinea el contenido ABAJO de la celda cuando no se dice otra cosa;
  // con el centrado del navegador, una fila alta se ve flotando.
  if (!e) return { verticalAlign: "bottom" };
  return {
    fontWeight: e.negrita ? 700 : undefined,
    fontStyle: e.cursiva ? "italic" : undefined,
    textDecoration: e.subrayado ? "underline" : undefined,
    // Un color de letra oscuro fijado por el archivo, en una celda SIN relleno
    // propio, sería ilegible en modo oscuro: ahí manda el color del tema. Si la
    // celda tiene su propio fondo, el color del archivo se respeta tal cual.
    color: tema === "dark" && !e.fondo && e.color && colorMuyOscuro(e.color)
      ? undefined
      : e.color,
    backgroundColor: e.fondo,
    // El tamaño del archivo está en PUNTOS: aplicarlo como píxeles hacía que
    // un título de 16 pt se viera igual de chico que el texto normal.
    fontSize: e.tamano ? `${ptAPx(e.tamano) * zoom}px` : undefined,
    textAlign: e.alineacion,
    verticalAlign: e.alineacionVertical ?? "bottom",
    whiteSpace: e.ajustarTexto ? "normal" : undefined,
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
