"use client";

/**
 * HojaCalculoEditor — la planilla del drive, editable como en Excel.
 *
 * Muestra el archivo CON su formato, deja trabajar con las herramientas de
 * siempre (rangos, copiar/pegar, deshacer, formato, fórmulas, insertar filas)
 * y guarda de vuelta como versión nueva del mismo documento.
 *
 * CÓMO SE GUARDA (lo que hace que esto sirva con archivos de verdad): no se
 * regenera la planilla, se editan las celdas tocadas DENTRO del archivo
 * original. Gráficos, tablas dinámicas, formato condicional y validaciones
 * siguen ahí después de guardar.
 *
 * Guarda con Ctrl+S y también solo, a los 2 minutos de la última tecla. Cada
 * guardado es una versión más: siempre se puede volver atrás.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Check, Download, Loader2, Printer, Save, Table } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerXlsxConFormato, numeroALetra, type HojaFormato } from "@/lib/documentos/xlsx-formato";
import { abrirPaquete, guardarCambios } from "@/lib/documentos/xlsx-escritura";
import { formatoDe, generarCsv } from "@/lib/documentos/hoja-calculo";
import { hojaDesdeCsv } from "@/lib/documentos/hoja-lectura";
import { descargarArchivo } from "@/lib/documentos/archivo-remoto";
import AvisoArchivo from "./AvisoArchivo";
import { celdasDe, etiquetaRango, normalizar, type Punto, type Rango } from "@/lib/documentos/hoja-rango";
import { esFormula } from "@/lib/documentos/hoja-formulas";
import { calcularHoja } from "@/lib/documentos/hoja-calcular";
import type { CambioFormato } from "@/lib/documentos/xlsx-estilos";
import { filasOcultasPorFiltro, ordenDeFilas, resumir, type Direccion } from "@/lib/documentos/hoja-analisis";
import { imprimirHoja } from "@/lib/documentos/documentos-print";
import {
  duplicarHoja, eliminarHoja, nombreHojaLibre, nuevaHoja, renombrarEnFormula, renombrarHoja,
} from "@/lib/documentos/xlsx-hojas";
import GrillaHoja, { type Seleccion } from "./hoja/GrillaHoja";
import PestanasHojas from "./hoja/PestanasHojas";
import BarraHerramientas from "./hoja/BarraHerramientas";
import { mergesDe } from "./hoja/estado-hoja";
import BuscarReemplazar from "./hoja/BuscarReemplazar";
import ReglaResaltado from "./hoja/ReglaResaltado";
import BarraEstado from "./hoja/BarraEstado";
import MenuContextual from "./hoja/MenuContextual";
import FiltroColumna from "./hoja/FiltroColumna";
import { useEditorHoja } from "./hoja/useEditorHoja";
import type JSZipType from "jszip";

type Estado = "cargando" | "listo" | "guardando" | "error";

/** Ver nota en el endpoint: cada autoguardado gasta presupuesto de rate limit. */
const AUTOGUARDADO_MS = 120_000;

export default function HojaCalculoEditor({
  docId, nombre, mimeType,
}: {
  docId: string;
  nombre: string;
  mimeType: string;
}) {
  const [inicial, setInicial] = useState<HojaFormato[] | null>(null);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<unknown>(null);
  /** Sube con cada "reintentar": vuelve a disparar la carga. */
  const [intento, setIntento] = useState(0);
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [resaltado, setResaltado] = useState<Punto | null>(null);
  const formato = useMemo(() => formatoDe(mimeType, nombre), [mimeType, nombre]);
  const paquete = useRef<JSZipType | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cargar ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    setEstado("cargando");
    setError(null);
    (async () => {
      try {
        // `no-store`: con una copia cacheada se abriría una versión anterior y
        // el próximo guardado pisaría cambios ya guardados.
        const buf = await descargarArchivo(`/api/admin/documents/${docId}/raw`, { cache: "no-store" });

        if (formato === "csv") {
          if (cancelado) return;
          setInicial([hojaDesdeCsv(new TextDecoder().decode(buf))]);
        } else {
          const [leidas, zip] = await Promise.all([leerXlsxConFormato(buf), abrirPaquete(buf)]);
          if (cancelado) return;
          paquete.current = zip;
          setInicial(leidas);
        }
        setEstado("listo");
      } catch (e) {
        if (cancelado) return;
        setError(e);
        setEstado("error");
      }
    })();
    return () => { cancelado = true; };
  }, [docId, formato, intento]);

  // El error va PRIMERO: cuando la carga falla no hay `inicial`, así que un
  // guard por `!inicial` adelante dejaba la pantalla girando para siempre en
  // "Abriendo la planilla…" y el aviso no se mostraba nunca.
  if (estado === "error") {
    return (
      <AvisoArchivo
        error={error}
        titulo="No se pudo abrir la planilla"
        sugerencia="Si el problema sigue, descargala y abrila en Excel."
        urlDescarga={`/api/admin/documents/${docId}/raw`}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }
  if (estado === "cargando" || !inicial) {
    return (
      <LoadingState message="Abriendo la planilla…" />
    );
  }

  // El editor se monta recién con el archivo cargado: así el historial y los
  // cambios pendientes arrancan sobre datos reales y no sobre un placeholder.
  return (
    <EditorCargado
      key={docId}
      inicial={inicial}
      docId={docId}
      nombre={nombre}
      formato={formato}
      paquete={paquete}
      guardadoEn={guardadoEn}
      setGuardadoEn={setGuardadoEn}
      buscando={buscando}
      setBuscando={setBuscando}
      resaltado={resaltado}
      setResaltado={setResaltado}
      timerRef={timerRef}
      autoguardadoMs={AUTOGUARDADO_MS}
    />
  );
}

function EditorCargado({
  inicial, docId, nombre, formato, paquete, guardadoEn, setGuardadoEn,
  buscando, setBuscando, resaltado, setResaltado, timerRef, autoguardadoMs,
}: {
  inicial: HojaFormato[];
  docId: string;
  nombre: string;
  formato: "xlsx" | "csv";
  paquete: React.RefObject<JSZipType | null>;
  guardadoEn: Date | null;
  setGuardadoEn: (d: Date) => void;
  buscando: boolean;
  setBuscando: (b: boolean) => void;
  resaltado: Punto | null;
  setResaltado: (p: Punto | null) => void;
  timerRef: React.RefObject<ReturnType<typeof setTimeout> | null>;
  autoguardadoMs: number;
}) {
  const editor = useEditorHoja(inicial);
  const { hojas, activa, setActiva, sucio, ejecutar, deshacer, rehacer, puede } = editor;
  const [seleccion, setSeleccion] = useState<Seleccion>({ fila: 0, columna: 0 });
  const [rango, setRango] = useState<Rango>({ ancla: { fila: 0, columna: 0 }, foco: { fila: 0, columna: 0 } });
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Valores visibles por columna. Es sólo de pantalla: no toca el archivo. */
  const [filtros, setFiltros] = useState<Map<number, Set<string>>>(new Map());
  const [filtrando, setFiltrando] = useState<number | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; fila: number; columna: number } | null>(null);
  /** Escala de la vista. Se acota para que la planilla siga siendo usable. */
  const [zoom, setZoom] = useState(1);
  /** Diálogo de "resaltar por regla" sobre la selección. */
  const [reglaAbierta, setReglaAbierta] = useState(false);

  const cambiarZoom = useCallback((delta: number | null) => {
    setZoom((z) => (delta === null ? 1 : Math.min(2, Math.max(0.5, Math.round((z + delta) * 10) / 10))));
  }, []);

  const hoja = hojas[activa];
  const sel = useMemo(() => normalizar(rango), [rango]);

  const resetSeleccion = useCallback(() => {
    setSeleccion({ fila: 0, columna: 0 });
    setRango({ ancla: { fila: 0, columna: 0 }, foco: { fila: 0, columna: 0 } });
  }, []);

  /**
   * Las fórmulas se recalculan en pantalla apenas cambia una celda: si no, el
   * usuario ve totales que ya no son ciertos hasta abrir el archivo en Excel.
   *
   * El lector resuelve también las referencias a OTRAS hojas (`Totales!B1`):
   * sin nombre lee la hoja activa; con nombre busca la hoja en el libro (sin
   * distinguir mayúsculas, como Excel) y `null` si no existe → `#¡REF!`.
   */
  const hojaCalculada = useMemo(
    () => (hoja ? calcularHoja(hoja, hojas) : hoja),
    [hoja, hojas],
  );

  /**
   * La hoja que se dibuja: la calculada, con las filas que el filtro esconde.
   * El filtro no se guarda en el archivo — es una lente para mirar.
   */
  const hojaVisible = useMemo(() => {
    if (!hojaCalculada) return hojaCalculada;
    if (filtros.size === 0) return hojaCalculada;
    const porFiltro = filasOcultasPorFiltro(hojaCalculada.filas, filtros, filaDatos(hojaCalculada));
    return {
      ...hojaCalculada,
      // Se respeta lo que ya venía oculto en el archivo.
      filasOcultas: hojaCalculada.filasOcultas.map((o, i) => o || porFiltro[i]),
    };
  }, [hojaCalculada, filtros]);

  const ocultasPorFiltro = useMemo(() => {
    if (!hojaCalculada || filtros.size === 0) return 0;
    return filasOcultasPorFiltro(hojaCalculada.filas, filtros, filaDatos(hojaCalculada)).filter(Boolean).length;
  }, [hojaCalculada, filtros]);

  const resumen = useMemo(
    () => (hojaVisible ? resumir(hojaVisible.filas, sel) : null),
    [hojaVisible, sel],
  );

  // ── Guardar ───────────────────────────────────────────────────────────────
  const guardar = useCallback(async () => {
    if (guardando || !hoja) return;
    setGuardando(true);
    setError(null);
    try {
      const blob = formato === "csv"
        ? new Blob([generarCsv(hojas[0].filas.map((f) => f.map((c) => c.crudo)))], { type: "text/csv" })
        : await guardarCambios(
            paquete.current ?? (() => { throw new Error("Se perdió el archivo original; recargá la página."); })(),
            editor.cambiosParaArchivo(),
          );

      const fd = new FormData();
      fd.append("file", new File([blob], nombre, { type: blob.type }));
      fd.append("changeNote", "Editado desde el panel");

      const r = await fetch(`/api/admin/documents/${docId}/versions`, {
        method: "POST", headers: csrfHeaders(), credentials: "include", body: fd,
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        if (r.status === 429) {
          const seg = Number(j.retryAfter) || 60;
          throw new Error(`Demasiados guardados seguidos. Tus cambios siguen acá: probá de nuevo en ${Math.ceil(seg / 60)} min.`);
        }
        throw new Error(j.error === "too_large" ? "El archivo quedó demasiado grande." : (j.message ?? `No se pudo guardar (HTTP ${r.status})`));
      }
      editor.marcarGuardado();
      setGuardadoEn(new Date());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setGuardando(false);
    }
  }, [docId, editor, formato, guardando, hoja, hojas, nombre, paquete, setGuardadoEn]);

  useEffect(() => {
    if (!sucio || guardando) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void guardar(); }, autoguardadoMs);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [sucio, guardando, guardar, timerRef, autoguardadoMs]);

  /**
   * Baja el archivo como está ahora, sin pasar por el servidor.
   *
   * Los cambios pendientes se aplican sobre una COPIA del paquete: aplicarlos
   * al zip vivo los dejaría puestos dos veces en el próximo guardado (una fila
   * insertada aparecería dos veces).
   */
  const descargar = useCallback(async () => {
    try {
      const blob = formato === "csv"
        ? new Blob([generarCsv(hojas[0].filas.map((f) => f.map((c) => c.crudo)))], { type: "text/csv" })
        : await (async () => {
            const zip = paquete.current;
            if (!zip) throw new Error("Se perdió el archivo original; recargá la página.");
            const copia = await abrirPaquete(await zip.generateAsync({ type: "arraybuffer" }));
            return guardarCambios(copia, editor.cambiosParaArchivo());
          })();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [editor, formato, hojas, nombre, paquete]);

  // ── Atajos globales ───────────────────────────────────────────────────────
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      const atajos: Record<string, () => void> = {
        s: () => void guardar(),
        z: () => (e.shiftKey ? rehacer() : deshacer()),
        y: rehacer,
        f: () => setBuscando(true),
        "+": () => cambiarZoom(0.1),
        "=": () => cambiarZoom(0.1),
        "-": () => cambiarZoom(-0.1),
        "0": () => cambiarZoom(null),
        b: () => ejecutar({ tipo: "formato", celdas: celdasDe(sel), formato: { negrita: true } }),
        i: () => ejecutar({ tipo: "formato", celdas: celdasDe(sel), formato: { cursiva: true } }),
        u: () => ejecutar({ tipo: "formato", celdas: celdasDe(sel), formato: { subrayado: true } }),
      };
      const accion = atajos[k];
      if (!accion) return;
      e.preventDefault();
      accion();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [cambiarZoom, deshacer, ejecutar, guardar, rehacer, sel, setBuscando]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (sucio) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sucio]);

  // ── Acciones de la barra ──────────────────────────────────────────────────
  // `ordenar` se define más abajo (necesita la hoja calculada); la barra lo
  // alcanza por referencia para no tener que reordenar las definiciones.
  const ordenarRef = useRef<(columna: number, direccion: Direccion) => void>(() => {});

  const acciones = useMemo(() => ({
    formato: (f: CambioFormato) => ejecutar({ tipo: "formato", celdas: celdasDe(sel), formato: f }),
    regla: () => setReglaAbierta(true),
    insertar: (eje: "fila" | "columna") =>
      ejecutar({ tipo: "estructura", eje, indice: (eje === "fila" ? sel.filaIni : sel.colIni) + 1, delta: 1 }),
    eliminar: (eje: "fila" | "columna") =>
      ejecutar({ tipo: "estructura", eje, indice: (eje === "fila" ? sel.filaIni : sel.colIni) + 1, delta: -1 }),
    /**
     * Autosuma: pone `=SUMA(...)` debajo de la selección, sobre la columna
     * seleccionada. Es el gesto más repetido de cualquier planilla.
     */
    autosuma: () => {
      const col = numeroALetra(sel.colIni + 1);
      const desde = sel.filaIni + 1;
      const hasta = sel.filaFin + 1;
      ejecutar({
        tipo: "valores",
        celdas: [{ fila: sel.filaFin + 1, columna: sel.colIni, valor: `=SUMA(${col}${desde}:${col}${hasta})` }],
      });
    },
    /**
     * Combinar es un TOGGLE, como en Excel: sobre un bloque combinado lo
     * separa; sobre un rango lo combina (absorbiendo los bloques que queden
     * enteros adentro). Un bloque pisado a medias corta la operación.
     */
    combinar: () => {
      if (!hoja) return;
      const merges = mergesDe(hoja);
      const bajoCursor = merges.find((m) =>
        sel.filaIni >= m.filaIni && sel.filaFin <= m.filaFin && sel.colIni >= m.colIni && sel.colFin <= m.colFin);
      if (bajoCursor) {
        ejecutar({ tipo: "descombinar", ...bajoCursor });
        return;
      }
      if (sel.filaIni === sel.filaFin && sel.colIni === sel.colFin) return;
      const dentro = (m: { filaIni: number; colIni: number; filaFin: number; colFin: number }) =>
        m.filaIni >= sel.filaIni && m.filaFin <= sel.filaFin && m.colIni >= sel.colIni && m.colFin <= sel.colFin;
      const aMedias = merges.some((m) => {
        const cruza = m.filaIni <= sel.filaFin && m.filaFin >= sel.filaIni && m.colIni <= sel.colFin && m.colFin >= sel.colIni;
        return cruza && !dentro(m);
      });
      if (aMedias) {
        setError("No se puede combinar: el rango pisa parte de otra celda combinada. Separala primero.");
        return;
      }
      for (const m of merges.filter(dentro)) ejecutar({ tipo: "descombinar", ...m });
      ejecutar({ tipo: "combinar", filaIni: sel.filaIni, colIni: sel.colIni, filaFin: sel.filaFin, colFin: sel.colFin });
    },
    /**
     * Congelar es un toggle: con paneles puestos los quita; sin paneles,
     * congela lo que queda arriba y a la izquierda de la selección (en A1,
     * la primera fila — el gesto más común de un catálogo).
     */
    congelar: () => {
      if (!hoja) return;
      if (hoja.congelado.filas > 0 || hoja.congelado.columnas > 0) {
        ejecutar({ tipo: "congelar", filas: 0, columnas: 0 });
        return;
      }
      const filas = sel.filaIni, columnas = sel.colIni;
      ejecutar(filas === 0 && columnas === 0
        ? { tipo: "congelar", filas: 1, columnas: 0 }
        : { tipo: "congelar", filas, columnas });
    },
    deshacer, rehacer,
    buscar: () => setBuscando(true),
    ordenar: (d: Direccion) => ordenarRef.current(sel.colIni, d),
    filtrar: () => setFiltrando(sel.colIni),
  }), [deshacer, ejecutar, hoja, rehacer, sel, setBuscando]);

  /**
   * Ordenar el rango seleccionado por una columna.
   *
   * Se reescriben los VALORES en el orden nuevo, en vez de mover las filas del
   * archivo: así entra en el historial como cualquier otra edición (Ctrl+Z lo
   * revierte) y no hay que remapear referencias.
   *
   * Si sólo hay una celda seleccionada se ordena la tabla entera de esa
   * columna hacia abajo, que es lo que uno espera al pedir "ordenar por acá".
   */
  const ordenar = useCallback((columna: number, direccion: Direccion) => {
    if (!hojaCalculada) return;
    const unaSola = sel.filaIni === sel.filaFin && sel.colIni === sel.colFin;
    const rangoOrden = unaSola
      ? { filaIni: filaDatos(hojaCalculada), filaFin: hojaCalculada.filas.length - 1, colIni: 0, colFin: (hojaCalculada.filas[0]?.length ?? 1) - 1 }
      : sel;

    const orden = ordenDeFilas(hojaCalculada.filas, rangoOrden, columna, direccion);
    const celdas: { fila: number; columna: number; valor: string }[] = [];
    orden.forEach((origen, i) => {
      const destino = rangoOrden.filaIni + i;
      if (destino === origen) return; // esa fila ya estaba en su lugar
      for (let c = rangoOrden.colIni; c <= rangoOrden.colFin; c++) {
        const celda = hojaCalculada.filas[origen]?.[c];
        celdas.push({
          fila: destino, columna: c,
          valor: celda?.formula ? `=${celda.formula}` : (celda?.crudo ?? ""),
        });
      }
    });
    if (celdas.length > 0) ejecutar({ tipo: "valores", celdas });
  }, [ejecutar, hojaCalculada, sel]);
  ordenarRef.current = ordenar;

  /**
   * Gestión de hojas: el ARCHIVO cambia primero (xlsx-hojas opera sobre el
   * zip) y recién después la pantalla se pone a la par. Si la cirugía falla,
   * no se toca nada y el error se muestra arriba.
   */
  const accionesHojas = useMemo(() => {
    const conZip = async (fn: (zip: JSZipType) => Promise<void>) => {
      const zip = paquete.current;
      if (!zip) { setError("Se perdió el archivo original; recargá la página."); return; }
      try {
        await fn(zip);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    };
    return {
      activar: (i: number) => { setActiva(i); resetSeleccion(); },
      nueva: () => void conZip(async (zip) => {
        const nombre = nombreHojaLibre(hojas.map((h) => h.nombre), `Hoja${hojas.length + 1}`);
        await nuevaHoja(zip, nombre);
        editor.agregarHoja(hojaNuevaFormato(nombre));
        resetSeleccion();
      }),
      renombrar: (i: number, nombre: string) => void conZip(async (zip) => {
        const viejo = hojas[i]?.nombre ?? "";
        await renombrarHoja(zip, i, nombre);
        editor.renombrarHojaEnEstado(i, nombre.trim(), (f) => renombrarEnFormula(f, viejo, nombre.trim()));
      }),
      duplicar: (i: number) => void conZip(async (zip) => {
        const origen = hojas[i];
        if (!origen) return;
        const nombre = nombreHojaLibre(hojas.map((h) => h.nombre), `${origen.nombre} (copia)`);
        await duplicarHoja(zip, i, nombre);
        editor.agregarHoja(copiaDeHoja(origen, nombre), i);
        resetSeleccion();
      }),
      eliminar: (i: number) => {
        const nombre = hojas[i]?.nombre ?? "";
        const seguro = window.confirm(
          `¿Eliminar la hoja "${nombre}"? Sus datos se pierden y esto no se puede deshacer. ` +
          "Si otra hoja la usa en una fórmula, esa fórmula queda rota.",
        );
        if (!seguro) return;
        void conZip(async (zip) => {
          await eliminarHoja(zip, i);
          editor.quitarHoja(i);
          resetSeleccion();
        });
      },
    };
  }, [editor, hojas, paquete, resetSeleccion, setActiva]);

  const accionesGrilla = useMemo(() => ({
    editar: (celdas: { fila: number; columna: number; valor: string }[]) =>
      ejecutar({ tipo: "valores", celdas }),
    ancho: (columna: number, anchoPx: number) => ejecutar({ tipo: "ancho", columna, anchoPx }),
    alto: (fila: number, altoPx: number) => ejecutar({ tipo: "alto", fila, altoPx }),
    menu: (x: number, y: number, fila: number, columna: number) => setMenu({ x, y, fila, columna }),
    zoom: cambiarZoom,
  }), [cambiarZoom, ejecutar]);

  /** Las del clic derecho: las mismas de siempre, pero sobre la celda apuntada. */
  const opcionesMenu = useMemo(() => ({
    copiar: () => document.execCommand("copy"),
    cortar: () => document.execCommand("cut"),
    pegar: () => document.execCommand("paste"),
    insertarFila: () => acciones.insertar("fila"),
    insertarColumna: () => acciones.insertar("columna"),
    eliminarFila: () => acciones.eliminar("fila"),
    eliminarColumna: () => acciones.eliminar("columna"),
    ordenar: (d: Direccion) => ordenar(menu?.columna ?? sel.colIni, d),
    filtrar: () => setFiltrando(menu?.columna ?? sel.colIni),
    combinar: () => acciones.combinar(),
    ocultar: (eje: "fila" | "columna") => {
      const desde = eje === "fila" ? sel.filaIni : sel.colIni;
      const hasta = eje === "fila" ? sel.filaFin : sel.colFin;
      for (let i = desde; i <= hasta; i++) ejecutar({ tipo: "visibilidad", eje, indice: i + 1, oculta: true });
    },
    /** Con una sola celda seleccionada se muestra TODO; con un rango, lo del rango. */
    mostrarOcultas: () => {
      if (!hoja) return;
      const unaSola = sel.filaIni === sel.filaFin && sel.colIni === sel.colFin;
      hoja.filasOcultas.forEach((oculta, i) => {
        if (oculta && (unaSola || (i >= sel.filaIni && i <= sel.filaFin))) {
          ejecutar({ tipo: "visibilidad", eje: "fila", indice: i + 1, oculta: false });
        }
      });
      hoja.columnasOcultas.forEach((oculta, i) => {
        if (oculta && (unaSola || (i >= sel.colIni && i <= sel.colFin))) {
          ejecutar({ tipo: "visibilidad", eje: "columna", indice: i + 1, oculta: false });
        }
      });
    },
    limpiar: () => ejecutar({ tipo: "valores", celdas: celdasDe(sel).map((p) => ({ ...p, valor: "" })) }),
  }), [acciones, ejecutar, hoja, menu, ordenar, sel]);

  if (!hoja || !hojaCalculada || !hojaVisible || !resumen) return null;

  const celda = hoja.filas[seleccion.fila]?.[seleccion.columna];
  const visibles = hojas.filter((h) => !h.oculta);
  const contenido = celda?.formula ? `=${celda.formula}` : celda?.crudo ?? "";

  return (
    <div className="flex h-screen flex-col bg-[var(--surface-canvas)]">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <a
            href="/admin?tab=documentos#documentos"
            title="Volver a Documentación"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            <span className="sr-only">Volver a Documentación</span>
          </a>
          <Table className="hidden h-5 w-5 shrink-0 text-[var(--accent)] sm:block" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--text-primary)]">{nombre}</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {sucio ? "Cambios sin guardar" : guardadoEn ? `Guardado ${guardadoEn.toLocaleTimeString("es-PE")} · nueva versión en tu panel` : "Sin cambios"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={() => { if (hojaVisible) imprimirHoja(hojaVisible, nombre); }}
            title="Imprimir o guardar PDF de la hoja actual"
            className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]"
          >
            <Printer className="h-4 w-4" aria-hidden />
            <span className="sr-only">Imprimir o guardar PDF</span>
          </button>
          <button
            type="button"
            onClick={() => void descargar()}
            title="Descargar una copia con los cambios de ahora"
            className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition hover:bg-[var(--surface-canvas)] hover:text-[var(--text-primary)]"
          >
            <Download className="h-4 w-4" aria-hidden />
            <span className="sr-only">Descargar copia</span>
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || !sucio}
            title="Guardar en el panel (Ctrl+S)"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-50"
          >
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : sucio ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </header>

      <BarraHerramientas
        acciones={acciones}
        puede={puede}
        etiquetaSeleccion={etiquetaRango(sel)}
        tamanoSeleccion={celda?.estilo?.tamano ?? 11}
        numFmtSeleccion={celda?.numFmt}
      />

      {buscando && (
        <BuscarReemplazar
          hoja={hojaCalculada}
          onIr={(p) => { setResaltado(p); setSeleccion(p); setRango({ ancla: p, foco: p }); }}
          onReemplazar={(celdas) => { ejecutar({ tipo: "valores", celdas }); setBuscando(false); setResaltado(null); }}
          onCerrar={() => { setBuscando(false); setResaltado(null); }}
        />
      )}

      {/* Resaltar por regla: se calcula sobre lo que se VE (con las fórmulas
          ya resueltas) y se aplica como un solo paso de deshacer. */}
      {reglaAbierta && hojaCalculada && (
        <ReglaResaltado
          filas={hojaCalculada.filas}
          rango={sel}
          etiquetaRango={etiquetaRango(sel)}
          onAplicar={(celdas, color) => {
            if (celdas.length > 0) ejecutar({ tipo: "formato", celdas, formato: { fondo: color } });
          }}
          onCerrar={() => setReglaAbierta(false)}
        />
      )}

      {/* Barra de fórmulas: qué celda es y qué tiene realmente adentro. */}
      <div className="flex items-center gap-2 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5">
        <span className="w-20 shrink-0 rounded-md border border-[var(--rule-base)] px-2 py-0.5 text-center text-xs font-bold text-[var(--text-secondary)]">
          {etiquetaRango(sel)}
        </span>
        <input
          value={contenido}
          onChange={(e) => ejecutar({ tipo: "valores", celdas: [{ ...seleccion, valor: e.target.value }] })}
          aria-label="Contenido de la celda"
          placeholder="Escribí un valor o una fórmula (=SUMA(B2:B10))"
          className={`min-w-0 flex-1 bg-transparent text-xs text-[var(--text-primary)] outline-none ${esFormula(contenido) ? "font-mono" : ""}`}
        />
      </div>

      {error && (
        <p className="border-b-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{error}</p>
      )}

      <GrillaHoja
        key={activa}
        hoja={hojaVisible}
        seleccion={seleccion}
        rango={rango}
        onSeleccion={setSeleccion}
        onRango={setRango}
        acciones={accionesGrilla}
        resaltado={resaltado}
        zoom={zoom}
      />

      {/* Las pestañas van abajo, como en Excel; el CSV es una sola hoja fija. */}
      {formato === "xlsx" && (
        <PestanasHojas hojas={hojas} activa={activa} acciones={accionesHojas} />
      )}

      <BarraEstado
        resumen={resumen}
        etiqueta={etiquetaRango(sel)}
        filtradas={ocultasPorFiltro}
        hojas={visibles.length}
        hojaActual={hoja.nombre}
        zoom={zoom}
        onZoom={cambiarZoom}
      />

      {menu && (
        <MenuContextual
          x={menu.x}
          y={menu.y}
          columna={numeroALetra(menu.columna + 1)}
          opciones={opcionesMenu}
          onCerrar={() => setMenu(null)}
        />
      )}

      {filtrando !== null && (
        <FiltroColumna
          filas={hojaCalculada.filas}
          columna={filtrando}
          etiqueta={numeroALetra(filtrando + 1)}
          desdeFila={filaDatos(hojaCalculada)}
          seleccionados={filtros.get(filtrando) ?? null}
          onAplicar={(valores) => {
            setFiltros((prev) => {
              const copia = new Map(prev);
              if (valores === null) copia.delete(filtrando);
              else copia.set(filtrando, valores);
              return copia;
            });
          }}
          onCerrar={() => setFiltrando(null)}
        />
      )}
    </div>
  );
}

/**
 * Desde qué fila arrancan los datos.
 *
 * Se supone una fila de encabezado cuando la primera fila con contenido tiene
 * puro texto y la de abajo trae números: es el patrón de cualquier catálogo, y
 * evita que ordenar o filtrar se lleve puesto el encabezado.
 */
function filaDatos(hoja: HojaFormato): number {
  for (let f = 0; f < Math.min(hoja.filas.length - 1, 10); f++) {
    const fila = hoja.filas[f];
    const siguiente = hoja.filas[f + 1];
    if (!fila || !siguiente) continue;
    const textoArriba = fila.some((c) => (c.texto ?? "").trim() !== "") &&
      fila.every((c) => (c.texto ?? "").trim() === "" || Number.isNaN(Number(c.crudo)));
    const numerosAbajo = siguiente.some((c) => (c.crudo ?? "").trim() !== "" && !Number.isNaN(Number(c.crudo)));
    if (textoArriba && numerosAbajo) return f + 1;
  }
  return 1;
}

/** Una hoja recién creada: vacía y con espacio para trabajar. Anchos y altos
 *  en los valores por defecto del archivo, para que guarde y reabra igual. */
function hojaNuevaFormato(nombre: string): HojaFormato {
  const FILAS = 60, COLS = 15;
  return {
    nombre,
    filas: Array.from({ length: FILAS }, () => Array.from({ length: COLS }, () => ({ texto: "", crudo: "" }))),
    anchos: Array.from({ length: COLS }, () => 64),
    altos: Array.from({ length: FILAS }, () => 20),
    columnasOcultas: Array.from({ length: COLS }, () => false),
    filasOcultas: Array.from({ length: FILAS }, () => false),
    congelado: { filas: 0, columnas: 0 },
    tieneFormulas: false,
    oculta: false,
  };
}

/** Copia de una hoja para mostrar el duplicado sin re-leer el archivo. */
function copiaDeHoja(hoja: HojaFormato, nombre: string): HojaFormato {
  return {
    ...hoja,
    nombre,
    filas: hoja.filas.map((f) => f.map((c) => ({ ...c }))),
    anchos: [...hoja.anchos],
    altos: [...hoja.altos],
    columnasOcultas: [...hoja.columnasOcultas],
    filasOcultas: [...hoja.filasOcultas],
    congelado: { ...hoja.congelado },
    oculta: false,
  };
}
