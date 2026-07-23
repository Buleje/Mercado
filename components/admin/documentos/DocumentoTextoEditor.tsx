"use client";

/**
 * DocumentoTextoEditor — abre un documento del drive (.docx, .txt, .md), lo
 * deja editar y lo guarda de vuelta como VERSIÓN NUEVA del mismo documento.
 *
 * Hermano de HojaCalculoEditor: mismo trato (pestaña propia, Ctrl+S,
 * autoguardado, aviso al cerrar) para que editar un contrato se sienta igual
 * que editar una lista de precios.
 *
 * Se edita por PÁRRAFO, no en un lienzo libre: así el .docx original se
 * conserva entero y sólo se reescribe el texto que cambió (ver texto-docx.ts).
 * El precio de esa fidelidad es que un párrafo con formatos mezclados se
 * unifica al editarlo — y eso el editor lo avisa ANTES, no después.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Check, FileText, Loader2, Plus, Save, Trash2 } from "@buleje/design-system/icons";
import { csrfHeaders } from "@/lib/csrf-client";
import {
  escribirDocx, formatoTextoDe, generarPlano, leerDocx, leerPlano,
  type BloqueTexto, type DocumentoTexto,
} from "@/lib/documentos/texto-docx";

type Estado = "cargando" | "listo" | "guardando" | "error";

/** Ver nota en HojaCalculoEditor: cada autoguardado gasta presupuesto de rate limit. */
const AUTOGUARDADO_MS = 120_000;

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

  const guardar = useCallback(async () => {
    if (estado === "guardando" || !documento) return;
    setEstado("guardando");
    setError(null);
    try {
      const blob = formato === "docx"
        ? await escribirDocx(documento, bloques, originales.current)
        : new Blob([generarPlano(bloques)], { type: mimeType || "text/plain" });

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
  }, [bloques, docId, documento, estado, formato, mimeType, nombre]);

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

  const editar = (id: number, texto: string) => {
    setBloques((prev) => prev.map((b) => (b.id === id ? { ...b, texto } : b)));
    setSucio(true);
  };
  const borrar = (id: number) => {
    setBloques((prev) => prev.filter((b) => b.id !== id));
    setSucio(true);
  };
  const agregar = () => {
    setBloques((prev) => [
      ...prev,
      { id: Math.max(0, ...prev.map((b) => b.id)) + 1, tipo: "parrafo", texto: "", formatoMixto: false, enTabla: false },
    ]);
    setSucio(true);
  };

  const mixtos = bloques.filter((b) => b.formatoMixto).length;

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
          <button type="button" onClick={agregar} title="Agregar un párrafo al final"
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]">
            <Plus className="h-4 w-4" aria-hidden /> <span className="hidden sm:inline">Párrafo</span>
            <span className="sr-only sm:hidden">Agregar párrafo</span>
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
          {bloques.map((b) => (
            <FilaBloque key={b.id} bloque={b} onEditar={editar} onBorrar={borrar} />
          ))}
          {bloques.length === 0 && (
            <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
              El documento está vacío. Agregá un párrafo para empezar.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/** Estilo de cada párrafo según su rol en el documento. */
const ESTILO_TIPO: Record<BloqueTexto["tipo"], string> = {
  titulo: "text-2xl font-black leading-tight",
  subtitulo: "text-lg font-bold leading-snug",
  lista: "text-base leading-relaxed",
  parrafo: "text-base leading-relaxed",
};

function FilaBloque({
  bloque, onEditar, onBorrar,
}: {
  bloque: BloqueTexto;
  onEditar: (id: number, texto: string) => void;
  onBorrar: (id: number) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // El textarea crece con el texto: un párrafo largo no debería tener su
  // propia barra de scroll dentro del documento.
  const ajustar = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useEffect(() => { ajustar(); }, [ajustar, bloque.texto]);

  return (
    <div className="group relative flex items-start gap-2">
      {bloque.tipo === "lista" && (
        <span aria-hidden className="mt-[0.9rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--text-tertiary)]" />
      )}
      <textarea
        ref={ref}
        value={bloque.texto}
        onChange={(e) => { onEditar(bloque.id, e.target.value); ajustar(); }}
        rows={1}
        aria-label={`Párrafo ${bloque.id + 1}${bloque.formatoMixto ? " (formatos mezclados)" : ""}`}
        data-bloque={bloque.id}
        className={`w-full resize-none overflow-hidden rounded-lg bg-transparent px-2 py-1.5 text-[var(--text-primary)] outline-none focus:bg-[var(--accent-soft)] focus:ring-2 focus:ring-[var(--accent)] dark:focus:bg-[var(--accent)]/12 ${ESTILO_TIPO[bloque.tipo]} ${
          bloque.formatoMixto ? "border-l-4 border-[var(--data-warning-500)]" : ""
        } ${bloque.enTabla ? "border-l-4 border-[var(--rule-strong)]" : ""}`}
        title={bloque.enTabla ? "Este párrafo está dentro de una tabla del documento" : undefined}
      />
      <button
        type="button"
        onClick={() => onBorrar(bloque.id)}
        title={`Borrar el párrafo ${bloque.id + 1}`}
        className="mt-1.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--text-tertiary)] opacity-0 transition hover:bg-[var(--surface-canvas)] hover:text-[var(--data-error-600)] focus:opacity-100 group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        <span className="sr-only">Borrar párrafo {bloque.id + 1}</span>
      </button>
    </div>
  );
}
