"use client";

/**
 * DocumentoTextoEditor — abre un documento del drive (.docx, .txt, .md), lo
 * deja editar y lo guarda de vuelta como VERSIÓN NUEVA del mismo documento.
 *
 * Hermano de HojaCalculoEditor: mismo trato (pestaña propia, Ctrl+S,
 * autoguardado, deshacer, aviso al cerrar) para que editar un contrato se
 * sienta igual que editar una lista de precios.
 *
 * Se edita por PÁRRAFO, no en un lienzo libre: así el .docx original se
 * conserva entero y sólo se reescribe el texto que cambió (ver texto-docx.ts).
 * Los párrafos se pueden mover e insertar en el medio — el archivo guarda ese
 * orden. El precio de la fidelidad es que un párrafo con formatos mezclados se
 * unifica al editarlo — y eso el editor lo avisa ANTES, no después.
 *
 * Deshacer va por instantáneas de los bloques: un paso por párrafo editado o
 * por operación (mover, insertar, borrar), no por tecla.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, ArrowLeft, Check, Download, FileText, Loader2, Plus, Printer, Redo2, Save, Undo2,
} from "@buleje/design-system/icons";
import { imprimirTexto } from "@/lib/documentos/documentos-print";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  escribirDocx, formatoTextoDe, generarPlano, leerDocx, leerPlano,
  type BloqueTexto, type DocumentoTexto,
} from "@/lib/documentos/texto-docx";
import FilaBloqueTexto from "./FilaBloqueTexto";

type Estado = "cargando" | "listo" | "guardando" | "error";

/** Ver nota en HojaCalculoEditor: cada autoguardado gasta presupuesto de rate limit. */
const AUTOGUARDADO_MS = 120_000;
/** Tope de instantáneas de deshacer: suficiente para trabajar, acotado en memoria. */
const MAX_HISTORIAL = 100;

const BOTON_HEADER = "inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition hover:bg-[var(--surface-canvas)] disabled:opacity-40 disabled:hover:bg-[var(--surface-raised)]";

export default function DocumentoTextoEditor({
  docId, nombre, mimeType,
}: {
  docId: string;
  nombre: string;
  mimeType: string;
}) {
  const [documento, setDocumento] = useState<DocumentoTexto | null>(null);
  const [bloques, setBloques] = useState<BloqueTexto[]>([]);
  const [estado, setEstado] = useState<Estado>("cargando");
  const [error, setError] = useState<string | null>(null);
  const [sucio, setSucio] = useState(false);
  const [guardadoEn, setGuardadoEn] = useState<Date | null>(null);
  const formato = useMemo(() => formatoTextoDe(mimeType, nombre), [mimeType, nombre]);
  /** Estado al abrir: define qué párrafos se reescriben y cuáles ni se tocan. */
  const originales = useRef<BloqueTexto[]>([]);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Instantáneas para deshacer/rehacer; viven en un ref (no re-renderizan). */
  const historial = useRef<{ pasado: BloqueTexto[][]; futuro: BloqueTexto[][] }>({ pasado: [], futuro: [] });
  /** Espejo de los bloques, para tomar instantáneas fuera del ciclo de render. */
  const bloquesRef = useRef<BloqueTexto[]>([]);
  bloquesRef.current = bloques;
  /** Último párrafo tipeado: escribir seguido en el mismo es UN paso de deshacer. */
  const ultimoEditado = useRef<number | null>(null);
  const [, setVersion] = useState(0); // habilita/deshabilita los botones

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const r = await fetch(`/api/admin/documents/${docId}/raw`, { credentials: "include", cache: "no-store" });
        if (!r.ok) throw new Error(`No se pudo abrir el archivo (HTTP ${r.status})`);
        const buf = await r.arrayBuffer();
        const doc = formato === "docx" ? await leerDocx(buf) : leerPlano(new TextDecoder().decode(buf));
        if (cancelado) return;
        originales.current = doc.bloques.map((b) => ({ ...b }));
        setDocumento(doc);
        setBloques(doc.bloques);
        setEstado("listo");
      } catch (e) {
        if (cancelado) return;
        setError(e instanceof Error ? e.message : String(e));
        setEstado("error");
      }
    })();
    return () => { cancelado = true; };
  }, [docId, formato]);

  const generarBlob = useCallback(async (): Promise<Blob> => {
    if (!documento) throw new Error("El documento todavía no cargó.");
    return formato === "docx"
      ? await escribirDocx(documento, bloques, originales.current)
      : new Blob([generarPlano(bloques)], { type: mimeType || "text/plain" });
  }, [bloques, documento, formato, mimeType]);

  const guardar = useCallback(async () => {
    if (estado === "guardando" || !documento) return;
    setEstado("guardando");
    setError(null);
    try {
      const blob = await generarBlob();

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
          throw new Error(`Demasiados guardados seguidos. Tu texto sigue acá: probá de nuevo en ${Math.ceil(seg / 60)} min.`);
        }
        throw new Error(j.error === "too_large" ? "El archivo quedó demasiado grande." : (j.message ?? `No se pudo guardar (HTTP ${r.status})`));
      }
      // Lo guardado pasa a ser la nueva base: si no, el próximo guardado
      // volvería a reescribir párrafos que ya están al día.
      originales.current = bloques.map((b) => ({ ...b }));
      setSucio(false);
      setGuardadoEn(new Date());
      setEstado("listo");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setEstado("listo");
    }
  }, [bloques, docId, documento, estado, generarBlob, nombre]);

  /** Baja el documento como se ve ahora, sin pasar por el servidor. */
  const descargar = useCallback(async () => {
    try {
      const blob = await generarBlob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombre;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [generarBlob, nombre]);

  useEffect(() => {
    if (!sucio || estado !== "listo") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => { void guardar(); }, AUTOGUARDADO_MS);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [sucio, estado, guardar]);

  // ── Deshacer / rehacer ────────────────────────────────────────────────────
  const instantanea = useCallback(() => {
    historial.current.pasado.push(bloquesRef.current.map((b) => ({ ...b })));
    if (historial.current.pasado.length > MAX_HISTORIAL) historial.current.pasado.shift();
    historial.current.futuro = [];
    setVersion((v) => v + 1);
  }, []);

  const deshacer = useCallback(() => {
    const previo = historial.current.pasado.pop();
    if (!previo) return;
    historial.current.futuro.push(bloquesRef.current.map((b) => ({ ...b })));
    ultimoEditado.current = null;
    setBloques(previo);
    setSucio(true);
    setVersion((v) => v + 1);
  }, []);

  const rehacer = useCallback(() => {
    const siguiente = historial.current.futuro.pop();
    if (!siguiente) return;
    historial.current.pasado.push(bloquesRef.current.map((b) => ({ ...b })));
    ultimoEditado.current = null;
    setBloques(siguiente);
    setSucio(true);
    setVersion((v) => v + 1);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === "s") { e.preventDefault(); void guardar(); }
      else if (k === "z") { e.preventDefault(); if (e.shiftKey) rehacer(); else deshacer(); }
      else if (k === "y") { e.preventDefault(); rehacer(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [deshacer, guardar, rehacer]);

  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (sucio) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [sucio]);

  // ── Operaciones sobre los bloques ─────────────────────────────────────────
  const editar = (id: number, texto: string) => {
    // Seguir tipeando el mismo párrafo no apila un paso por tecla.
    if (ultimoEditado.current !== id) {
      instantanea();
      ultimoEditado.current = id;
    }
    setBloques((prev) => prev.map((b) => (b.id === id ? { ...b, texto } : b)));
    setSucio(true);
  };

  const borrar = (id: number) => {
    instantanea();
    ultimoEditado.current = null;
    setBloques((prev) => prev.filter((b) => b.id !== id));
    setSucio(true);
  };

  /** Inserta un párrafo nuevo debajo del bloque dado (o al final). */
  const insertar = (despuesDe?: number) => {
    instantanea();
    ultimoEditado.current = null;
    setBloques((prev) => {
      const nuevo: BloqueTexto = {
        id: Math.max(-1, ...prev.map((b) => b.id)) + 1,
        tipo: "parrafo", texto: "", negrita: false, cursiva: false,
        formatoMixto: false, enTabla: false,
      };
      const indice = despuesDe === undefined ? prev.length - 1 : prev.findIndex((b) => b.id === despuesDe);
      const copia = [...prev];
      copia.splice(indice + 1, 0, nuevo);
      return copia;
    });
    setSucio(true);
  };

  /** Prende o apaga la negrita/cursiva de TODO el párrafo. */
  const formatear = (id: number, cambio: { negrita?: boolean; cursiva?: boolean }) => {
    instantanea();
    ultimoEditado.current = null;
    setBloques((prev) => prev.map((b) => (b.id === id ? { ...b, ...cambio } : b)));
    setSucio(true);
  };

  /** Cambia el rol del párrafo. En .md/.txt el tipo ES el prefijo de la línea. */
  const cambiarTipo = (id: number, tipo: BloqueTexto["tipo"]) => {
    instantanea();
    ultimoEditado.current = null;
    setBloques((prev) => prev.map((b) => {
      if (b.id !== id) return b;
      if (formato === "plano") {
        const sinPrefijo = b.texto.replace(/^(#{1,6}\s+|\s*[-*+]\s+)/, "");
        const prefijo = tipo === "titulo" ? "# " : tipo === "subtitulo" ? "## " : tipo === "lista" ? "- " : "";
        return { ...b, tipo, texto: `${prefijo}${sinPrefijo}` };
      }
      return { ...b, tipo };
    }));
    setSucio(true);
  };

  const mover = (id: number, delta: -1 | 1) => {
    const indice = bloques.findIndex((b) => b.id === id);
    const destino = indice + delta;
    if (indice < 0 || destino < 0 || destino >= bloques.length) return;
    // Una tabla viaja entera al guardar: no se cruza ni se mueve por partes.
    if (bloques[indice].enTabla || bloques[destino].enTabla) return;
    instantanea();
    ultimoEditado.current = null;
    setBloques((prev) => {
      const copia = [...prev];
      [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
      return copia;
    });
    setSucio(true);
  };

  const mixtos = bloques.filter((b) => b.formatoMixto).length;
  const palabras = useMemo(
    () => bloques.reduce((n, b) => n + (b.texto.match(/\S+/g)?.length ?? 0), 0),
    [bloques],
  );
  const caracteres = useMemo(() => bloques.reduce((n, b) => n + b.texto.length, 0), [bloques]);

  if (estado === "cargando") {
    return (
      <div className="p-16 text-center text-[var(--text-tertiary)]">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
        <p className="mt-2 text-sm">Abriendo el documento…</p>
      </div>
    );
  }
  if (estado === "error" && bloques.length === 0) {
    return (
      <div className="m-6 rounded-2xl border-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] p-6 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">
        <AlertTriangle className="mb-2 h-6 w-6" /> {error}
      </div>
    );
  }

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
          <FileText className="hidden h-5 w-5 shrink-0 text-[var(--accent)] sm:block" aria-hidden />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-[var(--text-primary)]">{nombre}</p>
            <p className="text-xs text-[var(--text-tertiary)]">
              {sucio ? "Cambios sin guardar" : guardadoEn ? `Guardado ${guardadoEn.toLocaleTimeString("es-PE")} · nueva versión en tu panel` : "Sin cambios"}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={deshacer} disabled={historial.current.pasado.length === 0}
            title="Deshacer (Ctrl+Z)" className={`${BOTON_HEADER} w-10 px-0`}>
            <Undo2 className="h-4 w-4" aria-hidden /><span className="sr-only">Deshacer</span>
          </button>
          <button type="button" onClick={rehacer} disabled={historial.current.futuro.length === 0}
            title="Rehacer (Ctrl+Y)" className={`${BOTON_HEADER} w-10 px-0`}>
            <Redo2 className="h-4 w-4" aria-hidden /><span className="sr-only">Rehacer</span>
          </button>
          <button type="button" onClick={() => insertar()} title="Agregar un párrafo al final" className={BOTON_HEADER}>
            <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Párrafo</span>
            <span className="sr-only sm:hidden">Agregar párrafo</span>
          </button>
          <button type="button" onClick={() => imprimirTexto(bloques, nombre)} title="Imprimir o guardar PDF" className={`${BOTON_HEADER} w-10 px-0`}>
            <Printer className="h-4 w-4" aria-hidden /><span className="sr-only">Imprimir o guardar PDF</span>
          </button>
          <button type="button" onClick={() => void descargar()} title="Descargar una copia con los cambios de ahora" className={`${BOTON_HEADER} w-10 px-0`}>
            <Download className="h-4 w-4" aria-hidden /><span className="sr-only">Descargar copia</span>
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

      {error && (
        <p className="border-b-2 border-[var(--data-error-500)] bg-[var(--data-error-50)] px-4 py-2 text-sm font-semibold text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/12 dark:text-[var(--data-error-500)]">{error}</p>
      )}
      {mixtos > 0 && (
        <p className="border-b-2 border-[var(--data-warning-500)] bg-[var(--data-warning-50)] px-4 py-2 text-xs font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
          {mixtos === 1 ? "Hay un párrafo" : `Hay ${mixtos} párrafos`} con formatos mezclados (negritas o subrayados sueltos), marcados con una línea al costado.
          Si los editás, el párrafo queda con un solo formato. El archivo anterior queda como versión.
        </p>
      )}

      <div className="min-h-0 flex-1 overflow-auto px-4 py-6">
        {/* Ancho de lectura como el de una hoja; rem explícitos porque en este
            proyecto `max-w-*` está redefinido y mide el doble. */}
        <div className="mx-auto w-full max-w-[48rem] rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-5 sm:p-8">
          {bloques.map((b, i) => (
            <FilaBloqueTexto
              key={b.id}
              bloque={b}
              formato={formato}
              posicion={i + 1}
              puedeSubir={i > 0 && !b.enTabla && !bloques[i - 1].enTabla}
              puedeBajar={i < bloques.length - 1 && !b.enTabla && !bloques[i + 1].enTabla}
              onEditar={editar}
              onBorrar={borrar}
              onMover={mover}
              onInsertar={insertar}
              onFormato={formatear}
              onTipo={cambiarTipo}
            />
          ))}
          {bloques.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
              El documento está vacío. Agregá un párrafo para empezar.
            </p>
          )}
        </div>
      </div>

      <footer className="flex items-center justify-end gap-4 border-t-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-4 py-1.5 text-xs font-semibold text-[var(--text-tertiary)]">
        <span>{bloques.length === 1 ? "1 párrafo" : `${bloques.length} párrafos`}</span>
        <span>{palabras === 1 ? "1 palabra" : `${palabras.toLocaleString("es-PE")} palabras`}</span>
        <span>{caracteres.toLocaleString("es-PE")} caracteres</span>
      </footer>
    </div>
  );
}
