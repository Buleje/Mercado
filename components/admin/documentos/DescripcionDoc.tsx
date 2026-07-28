"use client";

/**
 * DescripcionDoc — "¿qué es este documento?", contestado por la IA y corregible
 * a mano.
 *
 * El archivo se llama IMG_2034.pdf y adentro hay un contrato. Sin una
 * descripción, encontrarlo después depende de acordarse del nombre —que no dice
 * nada— o de que la palabra exacta esté escrita adentro. Acá la IA escribe una
 * descripción rica (qué es, quiénes, cuándo, cuánto) y esa descripción ENTRA AL
 * BUSCADOR: buscar "el contrato del local" lo trae.
 *
 * Y como la IA se equivoca, la persona puede escribir la suya: no reemplaza a
 * la de la IA, se suma, pesa más al buscar y sobrevive a un re-análisis.
 */

import { useState } from "react";
import { Sparkles, Pencil, Check, X, Loader2, RefreshCw, Eye } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { analyzeDoc, getDocumentDetail, patchDocument } from "@/hooks/use-documents";
import type { DbDocument } from "@/lib/types/documents";

type DocEntities = { people?: string[]; orgs?: string[]; places?: string[]; dates?: string[]; amounts?: string[] };

const ENTITY_LABEL: { key: keyof DocEntities; label: string }[] = [
  { key: "people", label: "Personas" },
  { key: "orgs", label: "Empresas" },
  { key: "places", label: "Lugares" },
  { key: "dates", label: "Fechas" },
  { key: "amounts", label: "Montos" },
];

interface Props {
  doc: DbDocument;
  onPatched: (d: DbDocument) => void;
  /** Para refrescar la lista de atrás cuando la IA reescribe la descripción. */
  onAnalizado?: () => void;
}

export default function DescripcionDoc({ doc, onPatched, onAnalizado }: Props) {
  const meta = (doc.ocrMetadata ?? {}) as {
    description?: string;
    summary?: string;
    entities?: DocEntities;
    descripcionUsuario?: string;
    analyzedVia?: string;
    leidoComoEscaneo?: boolean;
    paginasLeidas?: number;
  };
  const descIA = (meta.description || meta.summary || "").trim();
  const descPropia = (meta.descripcionUsuario ?? "").trim();
  const entities = meta.entities;
  const hayEntidades = !!entities && ENTITY_LABEL.some(({ key }) => (entities[key]?.length ?? 0) > 0);

  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(descPropia);
  const [guardando, setGuardando] = useState(false);
  const [analizando, setAnalizando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    setGuardando(true);
    setError(null);
    try {
      onPatched(await patchDocument(doc.id, { descripcion: borrador.trim() }));
      setEditando(false);
    } catch {
      setError("No se pudo guardar. Probá de nuevo.");
    } finally {
      setGuardando(false);
    }
  };

  const describirConIA = async () => {
    setAnalizando(true);
    setError(null);
    try {
      const r = await analyzeDoc(doc.id);
      // `aviso` = el texto se guardó pero la descripción no salió, y el motivo
      // (sin cupo, sin credencial) es lo único accionable que hay para mostrar.
      if (r.aviso) setError(r.aviso);
      else if (!r.description && !r.summary) setError(r.message ?? "La IA no pudo describirlo esta vez.");
      // El análisis escribe en la base: la ficha se vuelve a leer para mostrar
      // la descripción nueva sin cerrar y abrir el documento.
      const { document } = await getDocumentDetail(doc.id);
      onPatched(document);
      onAnalizado?.();
    } catch (e) {
      setError(e instanceof Error && /422|no_text/.test(e.message)
        ? "No pude sacarle texto ni leerlo como imagen. Si es un escaneo, revisá que se vea nítido."
        : "No se pudo describir ahora. Probá de nuevo en un momento.");
    } finally {
      setAnalizando(false);
    }
  };

  return (
    <section className="rounded-2xl border border-[var(--accent)]/25 bg-[var(--accent)]/5 p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm font-bold text-[var(--text-primary)]">
          <Sparkles className="h-4 w-4 text-[var(--accent)]" /> De qué se trata
        </p>
        <div className="flex shrink-0 items-center gap-1">
          {/* Mirar una foto no es lo mismo que leer un PDF: decirlo evita que se
              tome como verdad literal lo que el modelo creyó ver. */}
          {meta.analyzedVia === "vision" && (
            <span
              className="inline-flex items-center gap-1 rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--text-tertiary)]"
              title={meta.leidoComoEscaneo
                ? `Este PDF no tiene texto: por dentro es una foto. La IA leyó su primera página mirándola.`
                : "La IA no leyó texto: miró la imagen"}
            >
              <Eye className="h-3 w-3" />
              {meta.leidoComoEscaneo ? "leído de la 1ª página escaneada" : "leído de la imagen"}
            </span>
          )}
          <button
            onClick={describirConIA}
            disabled={analizando}
            title={descIA ? "Volver a describir con IA" : "Describir con IA"}
            className="inline-flex items-center gap-1 rounded-md border-2 border-[var(--accent)]/40 px-2 py-0.5 text-xs font-bold text-[var(--accent)] transition-colors hover:bg-[var(--accent)]/10 disabled:opacity-60"
          >
            {analizando ? <Loader2 className="h-3 w-3 animate-spin" /> : descIA ? <RefreshCw className="h-3 w-3" /> : <Sparkles className="h-3 w-3" />}
            {analizando ? "Leyendo…" : descIA ? "Rehacer" : "Describir"}
          </button>
        </div>
      </div>

      {descIA ? (
        <p className="text-sm leading-relaxed text-[var(--text-secondary)]">{descIA}</p>
      ) : (
        <p className="text-sm text-[var(--text-tertiary)]">
          Todavía nadie describió este documento. La IA puede leerlo y escribir de qué se trata; eso también lo vuelve
          buscable por su contenido.
        </p>
      )}

      {hayEntidades && (
        <div className="mt-3 space-y-1.5">
          {ENTITY_LABEL.map(({ key, label }) => {
            const vals = entities?.[key] ?? [];
            if (vals.length === 0) return null;
            return (
              <div key={key} className="flex flex-wrap items-center gap-1.5">
                <span className="w-16 shrink-0 text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">{label}</span>
                {vals.map((v, i) => (
                  <span key={`${key}-${i}`} className="rounded-md bg-[var(--surface-sunken)] px-1.5 py-0.5 text-[length:var(--ts-2xs,11px)] font-semibold text-[var(--text-secondary)]">{v}</span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {/* Lo que dice la persona. Pesa más que la IA al buscar: nadie conoce el
          archivo mejor que quien lo guardó. */}
      <div className="mt-3 border-t border-[var(--accent)]/20 pt-3">
        {editando ? (
          <div className="space-y-2">
            <label htmlFor={`desc-${doc.id}`} className="block text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">
              Tu descripción
            </label>
            <textarea
              id={`desc-${doc.id}`}
              autoFocus
              rows={3}
              maxLength={2000}
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") { setBorrador(descPropia); setEditando(false); }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) guardar();
              }}
              placeholder="Ej: es el contrato del puesto 3 del mercado, el que firmamos con don Julio."
              className="w-full resize-y rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={guardar}
                disabled={guardando}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-bold text-white transition-colors hover:opacity-90 disabled:opacity-60"
              >
                {guardando ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Guardar
              </button>
              <button
                onClick={() => { setBorrador(descPropia); setEditando(false); }}
                className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:bg-[var(--surface-sunken)]"
              >
                <X className="h-3.5 w-3.5" /> Cancelar
              </button>
              <span className="ml-auto text-[length:var(--ts-2xs,11px)] tabular-nums text-[var(--text-tertiary)]">{borrador.length}/2000</span>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wide text-[var(--text-tertiary)]">Tu descripción</p>
              <p className={cn("mt-0.5 text-sm leading-relaxed", descPropia ? "text-[var(--text-primary)]" : "text-[var(--text-tertiary)] italic")}>
                {descPropia || "Agregá con tus palabras qué es: se busca por eso, y vale más que lo que dedujo la IA."}
              </p>
            </div>
            <button
              onClick={() => { setBorrador(descPropia); setEditando(true); }}
              className="shrink-0 rounded-md p-1.5 text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--accent)]"
              aria-label={descPropia ? "Editar tu descripción" : "Escribir tu descripción"}
              title={descPropia ? "Editar tu descripción" : "Escribir tu descripción"}
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {error && <p className="mt-2 text-xs font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>}
    </section>
  );
}
