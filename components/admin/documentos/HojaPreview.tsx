"use client";

/**
 * HojaPreview — la planilla del drive, tal como se ve en Excel, sin bajarla.
 *
 * La primera versión mostraba sólo los valores en una grilla gris de 60×20: un
 * presupuesto con monedas, colores y encabezados combinados quedaba
 * irreconocible y había que descargarlo igual. Ahora se lee CON su formato
 * —el mismo lector y el mismo dibujo que usa el editor— y encima trae lo que
 * uno hace apenas abre una planilla ajena: buscar un dato, marcar una columna
 * para ver su total, copiar un pedazo y llevárselo.
 *
 * Sigue siendo SÓLO LECTURA: para cambiar algo está «Editar planilla».
 *
 * `exceljs` pesa: entra por `import()` recién cuando alguien abre una planilla.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, ChevronDown, ChevronUp, ClipboardCopy, Download, EyeOff, Loader2, MessageCircle, Printer, Search, Sigma, Table,
} from "@buleje/design-system/icons";
import { formatoDe, generarCsv } from "@/lib/documentos/hoja-calculo";
import { hojaDesdeCsv, hojasDesdeDatos } from "@/lib/documentos/hoja-lectura";
import { descargarArchivo, descargarTexto } from "@/lib/documentos/archivo-remoto";
import { esOds } from "@/lib/documentos/odf";
import { resumir, totalesDeColumnas } from "@/lib/documentos/hoja-analisis";
import { calcularHoja } from "@/lib/documentos/hoja-calcular";
import { imprimirHoja } from "@/lib/documentos/documentos-print";
import { aTsv, etiquetaRango, normalizar, type Punto, type Rango } from "@/lib/documentos/hoja-rango";
import { numeroALetra, type HojaFormato } from "@/lib/documentos/xlsx-formato";
import TablaHojaLectura from "./hoja/TablaHojaLectura";
import AvisoArchivo from "./AvisoArchivo";

/** Primera tanda de filas. Con el alto real, ~120 llenan varias pantallas. */
const TANDA_INICIAL = 120;
const TANDA_EXTRA = 400;
/** Tope de coincidencias marcadas: más que esto ya no se recorren a mano. */
const MAX_COINCIDENCIAS = 500;

const RANGO_INICIAL: Rango = { ancla: { fila: 0, columna: 0 }, foco: { fila: 0, columna: 0 } };

export default function HojaPreview({ url, mimeType, nombre, onEnviar, miniaturaUrl }: {
  url: string;
  mimeType: string | null;
  nombre: string;
  /** Mandar este archivo por WhatsApp desde la misma vista previa. */
  onEnviar?: () => void;
  /** Miniatura del archivo, para mostrar algo real mientras se lee. */
  miniaturaUrl?: string;
}) {
  const [hojas, setHojas] = useState<HojaFormato[] | null>(null);
  const [activa, setActiva] = useState(0);
  const [error, setError] = useState<unknown>(null);
  const [intento, setIntento] = useState(0);
  const [hasta, setHasta] = useState(TANDA_INICIAL);
  const [rango, setRango] = useState<Rango>(RANGO_INICIAL);
  const [busqueda, setBusqueda] = useState("");
  const [indice, setIndice] = useState(0);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    let vivo = true;
    setHojas(null);
    setError(null);
    setActiva(0);
    setHasta(TANDA_INICIAL);
    setRango(RANGO_INICIAL);
    (async () => {
      try {
        if (esOds(mimeType, nombre)) {
          // LibreOffice: jszip + un parser propio del content.xml. exceljs no
          // lee ODF, y convertirlo del lado del cliente sería traer media suite.
          const [{ default: JSZip }, { leerOds }] = await Promise.all([
            import("jszip"),
            import("@/lib/documentos/odf"),
          ]);
          const zip = await JSZip.loadAsync(await descargarArchivo(url));
          if (vivo) setHojas(hojasDesdeDatos(await leerOds(zip)));
          return;
        }
        if (formatoDe(mimeType, nombre) === "csv") {
          const texto = await descargarTexto(url);
          if (vivo) setHojas([hojaDesdeCsv(texto, "Hoja 1")]);
          return;
        }
        // exceljs sólo cuando hace falta.
        const [{ leerXlsxConFormato }, datos] = await Promise.all([
          import("@/lib/documentos/xlsx-formato"),
          descargarArchivo(url),
        ]);
        const leidas = await leerXlsxConFormato(datos);
        // Las hojas ocultas del archivo se muestran al final y avisadas: en un
        // libro heredado suelen tener los datos que alimentan al resto.
        if (vivo) setHojas(leidas);
      } catch (e) {
        if (vivo) setError(e);
      }
    })();
    return () => { vivo = false; };
  }, [url, mimeType, nombre, intento]);

  /**
   * La hoja con sus fórmulas resueltas.
   *
   * Un .xlsx puede traer la fórmula sin el resultado cacheado (pasa con los
   * archivos que genera un sistema): sin calcular, la columna "Subtotal" salía
   * vacía y parecía un archivo roto.
   */
  const hoja = useMemo(() => {
    const cruda = hojas?.[activa];
    return cruda ? calcularHoja(cruda, hojas ?? [cruda]) : undefined;
  }, [hojas, activa]);
  const sel = useMemo(() => normalizar(rango), [rango]);

  /** Coincidencias del buscador, en orden de lectura. */
  const coincidencias = useMemo<Punto[]>(() => {
    const aguja = busqueda.trim().toLowerCase();
    if (!hoja || aguja === "") return [];
    const out: Punto[] = [];
    for (let f = 0; f < hoja.filas.length && out.length < MAX_COINCIDENCIAS; f++) {
      const fila = hoja.filas[f];
      for (let c = 0; c < fila.length && out.length < MAX_COINCIDENCIAS; c++) {
        if ((fila[c].texto ?? "").toLowerCase().includes(aguja)) out.push({ fila: f, columna: c });
      }
    }
    return out;
  }, [busqueda, hoja]);

  const actual = coincidencias[indice] ?? null;

  // Saltar a una coincidencia que está más abajo del corte no puede fallar en
  // silencio: se estira la tanda hasta llegar a ella.
  useEffect(() => {
    if (actual && actual.fila >= hasta) setHasta(actual.fila + 20);
  }, [actual, hasta]);

  useEffect(() => { setIndice(0); }, [busqueda, activa]);

  const saltar = useCallback((delta: number) => {
    setIndice((i) => {
      if (coincidencias.length === 0) return 0;
      return (i + delta + coincidencias.length) % coincidencias.length;
    });
  }, [coincidencias.length]);

  const copiar = useCallback(async () => {
    if (!hoja) return;
    const matriz: string[][] = [];
    for (let f = sel.filaIni; f <= sel.filaFin; f++) {
      const fila: string[] = [];
      for (let c = sel.colIni; c <= sel.colFin; c++) fila.push(hoja.filas[f]?.[c]?.texto ?? "");
      matriz.push(fila);
    }
    try {
      await navigator.clipboard.writeText(aTsv(matriz));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      // Sin permiso de portapapeles (o contexto inseguro): no hay nada que
      // romper, el usuario puede seleccionar el texto a mano.
    }
  }, [hoja, sel]);

  /** Totales de las columnas de plata — lo primero que se busca al abrir. */
  const totales = useMemo(() => (hoja ? totalesDeColumnas(hoja) : []), [hoja]);

  const imprimir = useCallback(() => {
    if (hoja) imprimirHoja(hoja, nombre);
  }, [hoja, nombre]);

  const bajarCsv = useCallback(() => {
    if (!hoja) return;
    const filas = hoja.filas.map((f) => f.map((c) => (c.crudo !== "" ? c.crudo : c.texto)));
    const blob = new Blob([`﻿${generarCsv(filas)}`], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${nombre.replace(/\.[^.]+$/, "")} - ${hoja.nombre}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, [hoja, nombre]);

  if (error) {
    return (
      <AvisoArchivo
        error={error}
        titulo="No se pudo mostrar la planilla"
        sugerencia="También podés descargarla y abrirla en Excel."
        urlDescarga={url}
        onReintentar={() => setIntento((n) => n + 1)}
      />
    );
  }

  if (!hojas || !hoja) {
    return (
      <div className="relative flex h-full min-h-[320px] items-center justify-center py-6">
        {/* La miniatura ya está en la caché del navegador (la pidió la grilla):
            se ve al instante, así que la espera muestra el archivo de verdad en
            vez de una pantalla vacía. */}
        {miniaturaUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={miniaturaUrl}
            alt=""
            aria-hidden
            className="pointer-events-none absolute inset-0 m-auto max-h-full w-auto max-w-full object-contain opacity-40 blur-[1px]"
          />
        )}
        <span className="relative inline-flex items-center gap-2 rounded-xl bg-[var(--surface-raised)]/90 px-3 py-2 text-sm text-[var(--text-secondary)] shadow-[var(--shadow-sm)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Leyendo la planilla…
        </span>
      </div>
    );
  }

  const resumen = resumir(hoja.filas, sel);
  const restantes = hoja.filas.length - Math.min(hasta, hoja.filas.length);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Barra: hojas + buscar + acciones */}
      <div className="flex flex-wrap items-center gap-2">
        {hojas.length > 1 && (
          <div className="flex flex-wrap items-center gap-1">
            {hojas.map((h, i) => (
              <button
                key={h.nombre + i}
                type="button"
                onClick={() => setActiva(i)}
                title={h.oculta ? `${h.nombre} — está oculta en Excel` : h.nombre}
                className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors ${
                  i === activa
                    ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                }`}
              >
                {h.oculta ? <EyeOff className="h-4 w-4 opacity-70" /> : <Table className="h-4 w-4" />}
                {h.nombre}
              </button>
            ))}
          </div>
        )}

        <div className="ml-auto flex items-center gap-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                saltar(e.shiftKey ? -1 : 1);
              }}
              placeholder="Buscar en la hoja"
              aria-label="Buscar en la hoja"
              className="h-9 w-44 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] pl-8 pr-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:border-[var(--accent)] focus:outline-none"
            />
          </div>
          {busqueda.trim() !== "" && (
            <div className="flex items-center gap-1 text-xs tabular-nums text-[var(--text-tertiary)]">
              <span>{coincidencias.length === 0 ? "0" : `${indice + 1}/${coincidencias.length}`}</span>
              <button type="button" onClick={() => saltar(-1)} aria-label="Coincidencia anterior" className="rounded p-1 hover:bg-[var(--surface-sunken)]">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => saltar(1)} aria-label="Coincidencia siguiente" className="rounded p-1 hover:bg-[var(--surface-sunken)]">
                <ChevronDown className="h-4 w-4" />
              </button>
            </div>
          )}
          <button type="button" onClick={copiar} title="Copiar la selección (se pega en Excel)" className={BOTON}>
            {copiado ? <Check className="h-4 w-4 text-[var(--data-success-600)]" /> : <ClipboardCopy className="h-4 w-4" />}
          </button>
          <button type="button" onClick={bajarCsv} title="Bajar esta hoja como CSV" className={BOTON}>
            <Download className="h-4 w-4" />
          </button>
          <button type="button" onClick={imprimir} title="Imprimir o guardar como PDF" className={BOTON}>
            <Printer className="h-4 w-4" />
          </button>
          {onEnviar && (
            <button type="button" onClick={onEnviar} title="Mandar este archivo por WhatsApp" className={BOTON}>
              <MessageCircle className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {totales.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {totales.map((t) => (
            <button
              key={t.columna}
              type="button"
              onClick={() => setRango({ ancla: { fila: 0, columna: t.columna }, foco: { fila: hoja.filas.length - 1, columna: t.columna } })}
              title={`Ver la columna ${numeroALetra(t.columna + 1)} (${t.cuenta} números)`}
              className={`inline-flex h-8 items-center gap-1.5 rounded-lg border-2 px-2.5 text-xs transition-colors ${
                sel.colIni === t.columna && sel.colFin === t.columna
                  ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
                  : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-[var(--text-tertiary)]"
              }`}
            >
              <span className="max-w-[10rem] truncate">{t.titulo}</span>
              <span className="font-bold tabular-nums text-[var(--text-primary)]">{fmt(t.suma)}</span>
            </button>
          ))}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <TablaHojaLectura
          hoja={hoja}
          hasta={hasta}
          rango={rango}
          onRango={setRango}
          busqueda={busqueda}
          activa={actual}
        />
      </div>

      {/* Barra de estado: el total de lo seleccionado, como abajo en Excel. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
        <span className="font-bold text-[var(--text-primary)]">{etiquetaRango(sel)}</span>
        {resumen.numericas > 0 && (
          <>
            <span className="inline-flex items-center gap-1 font-bold text-[var(--text-primary)]">
              <Sigma className="h-3.5 w-3.5" /> {fmt(resumen.suma)}
            </span>
            <span>Promedio {fmt(resumen.promedio)}</span>
            <span>Mín {fmt(resumen.minimo)}</span>
            <span>Máx {fmt(resumen.maximo)}</span>
            <span className="text-[var(--text-tertiary)]">{resumen.numericas} números</span>
          </>
        )}
        {resumen.numericas === 0 && resumen.celdas > 1 && (
          <span className="text-[var(--text-tertiary)]">{resumen.conDatos} de {resumen.celdas} celdas con datos</span>
        )}
        <span className="ml-auto text-[var(--text-tertiary)]">
          {hoja.filas.length} filas × {hoja.anchos.length} columnas
          {hoja.tieneFormulas ? " · con fórmulas" : ""}
        </span>
      </div>

      {restantes > 0 && (
        <div className="flex items-center justify-center gap-3 text-xs text-[var(--text-tertiary)]">
          <span>Mostrando {Math.min(hasta, hoja.filas.length)} de {hoja.filas.length} filas</span>
          <button
            type="button"
            onClick={() => setHasta((h) => h + TANDA_EXTRA)}
            className="inline-flex h-9 items-center rounded-lg border-2 border-[var(--rule-base)] px-3 text-sm font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            Mostrar {Math.min(TANDA_EXTRA, restantes)} más
          </button>
        </div>
      )}
    </div>
  );
}

const BOTON =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]";

/** Números legibles: miles separados y como mucho dos decimales. */
function fmt(n: number): string {
  return n.toLocaleString("es-PE", { maximumFractionDigits: 2 });
}
