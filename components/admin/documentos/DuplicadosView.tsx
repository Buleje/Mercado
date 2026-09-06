"use client";

/**
 * DuplicadosView — los archivos repetidos del drive, y cómo sacarlos.
 *
 * Después de importar una carpeta dos veces (o de que dos personas suban el
 * mismo adjunto) quedan copias que ocupan lugar y, sobre todo, hacen dudar de
 * cuál es la buena. Acá se ven agrupadas, con cuánto espacio se recupera.
 *
 * Regla de la casa: NO se borra nada sin comprobar el contenido. El listado
 * agrupa por peso y nombre —barato pero no prueba nada—, así que antes de
 * eliminar se comparan los archivos byte a byte contra el servidor.
 */

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, ShieldCheck, Trash2, AlertCircle } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocument } from "@/lib/types/documents";
import { csrfHeaders } from "@/lib/csrf-client";

interface Grupo { clave: string; nombre: string; size: number; docs: DbDocument[] }

function pesoLegible(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-PE", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DuplicadosView({ onOpenDoc, onEliminar }: {
  onOpenDoc?: (doc: DbDocument) => void;
  /** Borra los ids indicados y refresca el drive. */
  onEliminar: (ids: string[]) => Promise<void>;
}) {
  const [grupos, setGrupos] = useState<Grupo[] | null>(null);
  const [recuperable, setRecuperable] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  /** clave del grupo → resultado de comparar el contenido. */
  const [verificado, setVerificado] = useState<Record<string, "iguales" | "distintos">>({});

  const cargar = useCallback(() => {
    setError(null);
    setGrupos(null);
    fetch("/api/admin/documents/duplicates", { credentials: "include", headers: csrfHeaders() })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => { setGrupos(d.grupos ?? []); setRecuperable(d.recuperable ?? 0); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);
  useEffect(() => { cargar(); }, [cargar]);

  /** Compara el contenido real del grupo antes de ofrecer borrar. */
  const comprobar = async (g: Grupo) => {
    setTrabajando(g.clave);
    try {
      const res = await fetch("/api/admin/documents/duplicates", {
        method: "POST",
        credentials: "include",
        headers: csrfHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ ids: g.docs.slice(0, 20).map((d) => d.id) }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json();
      setVerificado((v) => ({ ...v, [g.clave]: d.todosIguales ? "iguales" : "distintos" }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setTrabajando(null);
    }
  };

  /** Deja el más nuevo y manda el resto a la papelera. */
  const limpiar = async (g: Grupo) => {
    const sobran = g.docs.slice(1); // vienen del más nuevo al más viejo
    const cuantos = sobran.length;
    if (!confirm(
      `Se queda "${g.docs[0].name}" (el más nuevo) y ${cuantos} copia${cuantos === 1 ? "" : "s"} van a la papelera.\n\n` +
      `Recuperás ${pesoLegible(g.size * cuantos)}. Se pueden restaurar desde la papelera.`,
    )) return;
    setTrabajando(g.clave);
    try {
      await onEliminar(sobran.map((d) => d.id));
      cargar();
    } finally {
      setTrabajando(null);
    }
  };

  if (error) {
    return (
      <div className="rounded-2xl border-2 border-[var(--data-error-500)]/40 bg-[var(--data-error-50)] p-6 text-sm text-[var(--data-error)] dark:bg-[var(--data-error-500)]/15">
        No se pudieron buscar los repetidos: {error}
        <button onClick={cargar} className="ml-2 underline">Reintentar</button>
      </div>
    );
  }
  if (grupos === null) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-2xl border border-[var(--rule-base)] bg-white p-10 text-sm text-[var(--text-tertiary)]">
        <Loader2 className="h-4 w-4 animate-spin" /> Buscando archivos repetidos…
      </div>
    );
  }
  if (grupos.length === 0) {
    return (
      <div className="rounded-2xl border-2 border-dashed border-[var(--rule-base)] bg-white p-10 text-center">
        <div className="mx-auto mb-4 inline-flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">
          <ShieldCheck className="h-7 w-7" />
        </div>
        <p className="text-lg font-extrabold text-[var(--text-primary)]">No hay archivos repetidos</p>
        <p className="mt-1.5 text-sm text-[var(--text-secondary)]">
          Cada documento del drive es distinto. Si importás una carpeta dos veces, acá vas a ver qué se duplicó.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 py-3">
        <p className="text-sm text-[var(--text-secondary)]">
          <span className="font-extrabold text-[var(--text-primary)]">{grupos.length}</span>{" "}
          {grupos.length === 1 ? "archivo repetido" : "archivos repetidos"} · recuperás hasta{" "}
          <span className="font-extrabold text-[var(--text-primary)]">{pesoLegible(recuperable)}</span>
        </p>
        <button onClick={cargar} className="text-xs font-bold text-[var(--text-tertiary)] hover:text-primary">
          Volver a revisar
        </button>
      </div>

      <ul className="space-y-3">
        {grupos.map((g) => {
          const estado = verificado[g.clave];
          const ocupado = trabajando === g.clave;
          return (
            <li key={g.clave} className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-white">
              <div className="flex flex-wrap items-center gap-3 border-b border-[var(--rule-soft)] bg-[var(--surface-sunken)] px-4 py-2.5">
                <Copy className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" aria-hidden />
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-[var(--text-primary)]">{g.nombre}</p>
                <span className="shrink-0 text-xs tabular-nums text-[var(--text-tertiary)]">
                  {g.docs.length} copias · {pesoLegible(g.size)} c/u
                </span>
                {estado === "iguales" && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--data-success-50)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]">
                    <ShieldCheck className="h-3 w-3" /> mismo contenido
                  </span>
                )}
                {estado === "distintos" && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-[var(--data-warning-100)] px-2 py-1 text-[length:var(--ts-2xs)] font-bold text-[var(--data-warning)] dark:bg-[var(--data-warning-500)]/15">
                    <AlertCircle className="h-3 w-3" /> el contenido NO es igual
                  </span>
                )}
              </div>

              <ul className="divide-y divide-[var(--rule-soft)]">
                {g.docs.map((d, i) => (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span className={cn(
                      "shrink-0 rounded-md px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-bold",
                      i === 0
                        ? "bg-[var(--data-success-50)] text-[var(--data-success-700)] dark:bg-[var(--data-success-500)]/15 dark:text-[var(--data-success-500)]"
                        : "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
                    )}>
                      {i === 0 ? "se queda" : "sobra"}
                    </span>
                    <button
                      onClick={() => onOpenDoc?.(d)}
                      className="min-w-0 flex-1 truncate text-left text-sm text-[var(--text-primary)] hover:underline"
                    >
                      {d.name}
                    </button>
                    <span className="shrink-0 text-xs text-[var(--text-tertiary)]">{fecha(d.uploadedAt)}</span>
                  </li>
                ))}
              </ul>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[var(--rule-soft)] px-4 py-2.5">
                {!estado && (
                  <button
                    onClick={() => comprobar(g)}
                    disabled={ocupado}
                    className="inline-flex items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] px-3 py-1.5 text-xs font-bold text-[var(--text-secondary)] hover:border-primary hover:text-primary disabled:opacity-50"
                  >
                    {ocupado ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                    Comprobar que son iguales
                  </button>
                )}
                <button
                  onClick={() => limpiar(g)}
                  disabled={ocupado || estado === "distintos"}
                  title={estado === "distintos" ? "El contenido no coincide: revisalos antes de borrar" : undefined}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--data-error-50)] px-3 py-1.5 text-xs font-bold text-[var(--data-error)] hover:bg-[var(--data-error-100)] disabled:opacity-40 dark:bg-[var(--data-error-500)]/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Dejar solo el más nuevo
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
