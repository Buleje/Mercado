"use client";

/**
 * HojaCalculoEditor — abre una planilla del drive, la muestra CON el formato
 * del archivo y guarda los cambios de vuelta como versión nueva.
 *
 * Antes, para corregir un precio había que: descargar, abrir Excel, editar,
 * guardar y volver a subirla (perdiendo el hilo de versiones si le cambiabas
 * el nombre). Ahora se edita en la pestaña y al guardar queda en su lugar.
 *
 * CÓMO SE GUARDA (lo que hace que esto sea usable con archivos de verdad):
 * no se regenera la planilla, se editan las celdas tocadas DENTRO del archivo
 * original. Gráficos, tablas dinámicas, formato condicional, validaciones y
 * todo lo que el editor no muestra siguen ahí después de guardar. Las fórmulas
 * también: sólo se pierde la de una celda si se la pisa a mano, y el libro
 * queda marcado para que Excel recalcule al abrirlo.
 *
 * Guarda con Ctrl+S y también solo, a los 2 minutos de la última tecla. Cada
 * guardado es una versión más: siempre se puede volver atrás.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, Columns3, Loader2, Rows3, Save, Table } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import { leerXlsxConFormato, numeroALetra, type HojaFormato } from "@/lib/documentos/xlsx-formato";
import { abrirPaquete, guardarCambios, type CambioCelda } from "@/lib/documentos/xlsx-escritura";
import { formatoDe, generarCsv, parsearCsv } from "@/lib/documentos/hoja-calculo";
import GrillaHoja, { type Seleccion } from "./hoja/GrillaHoja";
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
  const [hojas, setHojas] = useState<HojaFormato[]>([]);
  const [activa, setActiva] = useState(0);
  const [seleccion, setSeleccion] = useState<Seleccion>({ fila: 0, columna: 0 });
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);
  const formato = useMemo(() => formatoDe(mimeType, nombre), [mimeType, nombre]);
  /** El .xlsx original, que se conserva y se edita en el lugar. */
  const paquete = useRef<JSZipType | null>(null);
  /** Celdas tocadas desde que se abrió: lo único que se reescribe al guardar. */
  const cambios = useRef<Map<string, CambioCelda>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Cargar ────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        // `no-store`: con una copia cacheada se abriría una versión anterior y
        // el próximo guardado pisaría cambios ya guardados.
        const r = await fetch(`/api/admin/documents/${docId}/raw`, { credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error(`No se pudo abrir el archivo (HTTP ${r.status})`);
        const buf = await r.arrayBuffer();

        if (formato === "csv") {
          if (cancelado) return;
          setHojas([hojaDesdeCsv(new TextDecoder().decode(buf))]);
        } else {
          const [leidas, zip] = await Promise.all([leerXlsxConFormato(buf), abrirPaquete(buf)]);
          if (cancelado) return;
          paquete.current = zip;
          setHojas(leidas);
        }
        setEstado("listo");
      } catch (e) {
        if (cancelado) return;
        setError(e instanceof Error ? e.message : String(e));
        setEstado("error");
      }
    })();
    return () => { cancelado = true; };
  }, [docId, formato]);

  // ── Guardar ───────────────────────────────────────────────────────────────
  const guardar = useCallback(async () => {
    if (estado === "guardando" || hojas.length === 0) return;
    setEstado("guardando");
    setError(null);
    try {
      const blob = formato === "csv"
        ? new Blob([generarCsv(hojas[0].filas.map((f) => f.map((c) => c.crudo)))], { type: "text/csv" })
        : await guardarCambios(
            paquete.current ?? (() => { throw new Error("Se perdió el archivo original; recargá la página."); })(),
            [...cambios.current.values()],
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
      // Lo guardado ya está en el paquete: no hace falta volver a aplicarlo.
      cambios.current.clear();
      setSucio(false);
      setGuardadoEn(new Date());
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado("listo");
    }
  }, [docId, estado, formato, hojas, nombre]);

  useEffect(() => {
    if (!sucio || estado !== "listo") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void guardar(); }, AUTOGUARDADO_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [sucio, estado, guardar]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); void guardar(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [guardar]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (sucio) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sucio]);

  // ── Edición ───────────────────────────────────────────────────────────────
  const editarCelda = useCallback((fila: number, columna: number, valor: string) => {
    setHojas((prev) => prev.map((h, i) => {
      if (i !== activa) return h;
      const filas = h.filas.map((f, fi) => (fi === fila
        ? f.map((c, ci) => (ci === columna
          // El valor escrito manda sobre el formato viejo: si la celda tenía
          // "S/ 22.00", al escribir 25 se ve 25 hasta abrirlo en Excel, que le
          // vuelve a aplicar el formato de la celda.
          ? { ...c, texto: valor, crudo: valor, formula: undefined }
          : c))
        : f));
      return { ...h, filas };
    }));
    cambios.current.set(`${activa}-${fila}-${columna}`, {
      hoja: activa, fila: fila + 1, columna: columna + 1, valor,
    });
    setSucio(true);
  }, [activa]);

  const agregarFila = () => {
    setHojas((prev) => prev.map((h, i) => {
      if (i !== activa) return h;
      const cols = h.filas[0]?.length ?? 1;
      return {
        ...h,
        filas: [...h.filas, Array.from({ length: cols }, () => ({ texto: "", crudo: "" }))],
        altos: [...h.altos, 20],
        filasOcultas: [...h.filasOcultas, false],
      };
    }));
  };
  const agregarColumna = () => {
    setHojas((prev) => prev.map((h, i) => (i === activa ? {
      ...h,
      filas: h.filas.map((f) => [...f, { texto: "", crudo: "" }]),
      anchos: [...h.anchos, 64],
      columnasOcultas: [...h.columnasOcultas, false],
    } : h)));
  };

  const hoja = hojas[activa];
  const celda = hoja?.filas[seleccion.fila]?.[seleccion.columna];
  const visibles = hojas.filter((h) => !h.oculta);

  if (estado === "cargando") {
    return (
      <div className="p-16 text-center text-[var(--text-tertiary)]">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2 text-sm">Abriendo la planilla…</p>
      </div>
    );
  }
  if (estado === "error" && !hoja) {
    return (
      <div className="m-6 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-6 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mb-2 h-6 w-6" /> {error}
      </div>
    );
  }
  if (!hoja) return null;

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
          <button type="button" onClick={agregarFila} title="Agregar una fila al final"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <Rows3 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Fila</span>
            <span className="sr-only sm:hidden">Agregar fila</span>
          </button>
          <button type="button" onClick={agregarColumna} title="Agregar una columna al final"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <Columns3 className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Columna</span>
            <span className="sr-only sm:hidden">Agregar columna</span>
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={estado === "guardando" || !sucio}
            title="Guardar en el panel (Ctrl+S)"
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-[var(--accent)] px-4 text-sm font-bold text-white hover:bg-[var(--accent-600)] disabled:opacity-50"
          >
            {estado === "guardando" ? <Loader2 className="h-4 w-4 animate-spin" /> : sucio ? <Save className="h-4 w-4" /> : <Check className="h-4 w-4" />}
            {estado === "guardando" ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </header>

      {/* Barra de fórmulas: qué celda es y qué tiene realmente adentro. */}
      <div className="flex items-center gap-2 border-b border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5">
        <span className="w-16 shrink-0 rounded-md border border-[var(--rule-base)] px-2 py-0.5 text-center text-xs font-bold text-[var(--text-secondary)]">
          {numeroALetra(seleccion.columna + 1)}{seleccion.fila + 1}
        </span>
        <span className="min-w-0 flex-1 truncate font-mono text-xs text-[var(--text-secondary)]">
          {celda?.formula ? `=${celda.formula}` : celda?.crudo || ""}
        </span>
      </div>

      {error && (
        <p className="border-b-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{error}</p>
      )}
      {hoja.tieneFormulas && (
        <p className="border-b border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-1.5 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          Esta hoja tiene fórmulas y se conservan. Sólo se pierde la de una celda si la pisás a mano; Excel recalcula el resto al abrir.
        </p>
      )}

      {visibles.length > 1 && (
        <div className="flex gap-1 overflow-x-auto border-b-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1.5">
          {hojas.map((h, i) => h.oculta ? null : (
            <button key={h.nombre + i} type="button"
              onClick={() => { setActiva(i); setSeleccion({ fila: 0, columna: 0 }); }}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-bold transition ${
                i === activa ? "bg-[var(--accent)] text-white" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
              }`}>
              {h.nombre}
            </button>
          ))}
        </div>
      )}

      <GrillaHoja
        key={activa}
        hoja={hoja}
        seleccion={seleccion}
        onSeleccion={setSeleccion}
        onEditar={editarCelda}
      />
    </div>
  );
}

/** Un .csv no tiene formato: se muestra como una hoja simple. */
function hojaDesdeCsv(texto: string): HojaFormato {
  const filas = parsearCsv(texto);
  const cols = Math.max(1, ...filas.map((f) => f.length));
  return {
    nombre: "Hoja1",
    filas: filas.map((f) => Array.from({ length: cols }, (_, i) => ({ texto: f[i] ?? "", crudo: f[i] ?? "" }))),
    anchos: new Array(cols).fill(140),
    altos: new Array(filas.length || 1).fill(24),
    columnasOcultas: new Array(cols).fill(false),
    filasOcultas: new Array(filas.length || 1).fill(false),
    congelado: { filas: 0, columnas: 0 },
    tieneFormulas: false,
    oculta: false,
  };
}
