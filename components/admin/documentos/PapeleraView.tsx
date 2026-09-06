"use client";

/**
 * Papelera del drive — recuperar o tirar en serio.
 *
 * Vivía dentro de `DocumentosModule` como una lista de a un botón por archivo:
 * si un borrado en lote salió mal, recuperarlo eran cientos de clics, y no
 * había forma de vaciarla (ni de saber cuánto espacio estaba reteniendo).
 *
 * Acá: selección múltiple, restaurar/eliminar la tanda, vaciar todo, y el peso
 * de lo que se va a liberar dicho en números antes de confirmar.
 */

import { useMemo, useState } from "react";
import { Trash2, RotateCcw, HardDrive, AlertTriangle, Loader2 } from "@buleje/design-system/icons";
import type { DbDocument } from "@/lib/types/documents";
import { cn } from "@/lib/utils";
import { formatBytes, getFileIcon } from "./archivo-visual";
import { DIAS_RETENCION_PAPELERA, textoRetencion } from "@/lib/documents/papelera-retencion";

/** "hoy", "ayer" o "hace N días" — cuánto le queda de vida al archivo. */
function borradoHace(iso: string | null): string {
  if (!iso) return "";
  const dias = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (dias <= 0) return "borrado hoy";
  if (dias === 1) return "borrado ayer";
  if (dias < 30) return `borrado hace ${dias} días`;
  const meses = Math.floor(dias / 30);
  return `borrado hace ${meses} mes${meses > 1 ? "es" : ""}`;
}

export function PapeleraView({
  docs,
  onRestore,
  onPurge,
  onRestoreMany,
  onPurgeMany,
}: {
  docs: DbDocument[];
  onRestore: (id: string) => void;
  onPurge: (id: string) => void;
  onRestoreMany: (ids: string[]) => Promise<number>;
  onPurgeMany: (ids?: string[]) => Promise<number>;
}) {
  const [elegidos, setElegidos] = useState<Set<string>>(new Set());
  const [trabajando, setTrabajando] = useState<null | "restaurar" | "eliminar" | "vaciar">(null);

  /**
   * La papelera muestra SÓLO lo que está borrado, aunque le pasen otra cosa.
   *
   * Al entrar a la vista, el listado de la papelera tarda un momento en llegar
   * y hasta entonces la lista en memoria es la de los archivos ACTIVOS: se
   * veían 42 documentos vivos bajo el cartel "sin liberar", y "Elegir todos"
   * los marcaba para eliminar definitivamente. El servidor los ignora (sólo
   * toca filas con `deletedAt`), pero la pantalla no tiene por qué ofrecerlo.
   */
  const enPapelera = useMemo(() => docs.filter((d) => d.deletedAt !== null), [docs]);

  const pesoTotal = useMemo(() => enPapelera.reduce((s, d) => s + d.size, 0), [enPapelera]);
  const pesoElegido = useMemo(
    () => enPapelera.reduce((s, d) => (elegidos.has(d.id) ? s + d.size : s), 0),
    [enPapelera, elegidos],
  );
  const todos = enPapelera.length > 0 && elegidos.size === enPapelera.length;

  const alternar = (id: string) =>
    setElegidos((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  /** Corre la acción, deja de mentir sobre el estado y limpia la selección si salió. */
  const correr = async (que: "restaurar" | "eliminar" | "vaciar", fn: () => Promise<unknown>) => {
    setTrabajando(que);
    try {
      await fn();
      setElegidos(new Set());
    } catch (err) {
      // El motivo lo muestra el banner del módulo; acá evitamos la promesa suelta.
      console.warn("[papelera] acción falló", err);
    } finally {
      setTrabajando(null);
    }
  };

  if (enPapelera.length === 0) {
    return (
      <div className="bg-white dark:bg-[var(--surface-raised)] border-2 border-dashed border-[var(--rule-base)] rounded-2xl p-10 text-center">
        <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)] mb-4">
          <Trash2 className="h-7 w-7" />
        </div>
        <p className="text-lg font-extrabold text-[var(--text-primary)]">La papelera está vacía</p>
        <p className="text-sm text-[var(--text-secondary)] mt-1.5">
          Los documentos que elimines aparecen acá y los podés recuperar.
        </p>
      </div>
    );
  }

  const ocupado = trabajando !== null;

  return (
    <div className="space-y-3">
      {/* Cuánto retiene la papelera + vaciarla de una */}
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--surface-sunken)] text-[var(--text-tertiary)]">
          <HardDrive className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-[var(--text-primary)] tabular-nums">
            {enPapelera.length} documento(s) · {formatBytes(pesoTotal)} sin liberar
          </p>
          <p className="text-xs text-[var(--text-secondary)]">
            Ocupan espacio hasta que los elimines. Los que cumplan{" "}
            {DIAS_RETENCION_PAPELERA} días en la papelera se borran solos.
          </p>
        </div>
        <button
          onClick={() =>
            confirm(
              `¿Vaciar la papelera?\n\nSe eliminan ${enPapelera.length} documento(s) y se liberan ${formatBytes(pesoTotal)}.\nNo se puede deshacer.`,
            ) && correr("vaciar", () => onPurgeMany())
          }
          disabled={ocupado}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-[var(--data-error-500)]/40 text-[var(--data-error-700)] dark:text-[var(--data-error-500)] text-sm font-bold hover:bg-[var(--data-error-50)] dark:hover:bg-[var(--data-error-500)]/10 disabled:opacity-50 transition-colors"
        >
          {trabajando === "vaciar" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Vaciar papelera
        </button>
      </div>

      {/* Barra de la selección — sólo cuando hay algo marcado */}
      {elegidos.size > 0 && (
        <div className="sticky top-2 z-30 flex flex-wrap items-center gap-x-2 gap-y-1.5 px-4 py-2.5 rounded-2xl bg-primary text-white shadow-lg">
          <span className="text-sm font-bold tabular-nums">
            {elegidos.size} elegido(s) · {formatBytes(pesoElegido)}
          </span>
          <button
            onClick={() => setElegidos(todos ? new Set() : new Set(enPapelera.map((d) => d.id)))}
            className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold"
          >
            {todos ? "Ninguno" : `Elegir los ${enPapelera.length}`}
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => correr("restaurar", () => onRestoreMany([...elegidos]))}
              disabled={ocupado}
              aria-label={`Restaurar los ${elegidos.size} elegidos`}
              className="text-xs px-2.5 py-1 rounded-md bg-white/20 hover:bg-white/30 font-bold inline-flex items-center gap-1 disabled:opacity-50"
            >
              {trabajando === "restaurar" ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />}
              Restaurar
            </button>
            <button
              onClick={() =>
                confirm(
                  `¿Eliminar ${elegidos.size} documento(s) definitivamente?\n\nSe liberan ${formatBytes(pesoElegido)}. No se puede deshacer.`,
                ) && correr("eliminar", () => onPurgeMany([...elegidos]))
              }
              disabled={ocupado}
              aria-label={`Eliminar definitivamente los ${elegidos.size} elegidos`}
              className="text-xs px-2.5 py-1 rounded-md bg-[var(--data-error-500)] hover:brightness-110 font-bold inline-flex items-center gap-1 disabled:opacity-50"
            >
              {trabajando === "eliminar" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Trash2 className="h-3 w-3" />}
              Eliminar def.
            </button>
            <button onClick={() => setElegidos(new Set())} className="text-xs font-bold px-2 py-1 hover:underline">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border-2 border-[var(--rule-base)] bg-white dark:bg-[var(--surface-raised)] overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[var(--rule-base)] bg-[var(--surface-sunken)]">
          <input
            type="checkbox"
            checked={todos}
            onChange={(e) => setElegidos(e.target.checked ? new Set(enPapelera.map((d) => d.id)) : new Set())}
            className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--color-primary)]"
            aria-label="Elegir todos los de la papelera"
          />
          <span className="text-xs text-[var(--text-tertiary)] inline-flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
            Restaurá lo que se borró por error; lo demás se puede eliminar definitivamente.
          </span>
        </div>
        <ul className="divide-y divide-[var(--rule-soft)]">
          {enPapelera.map((d) => {
            const { Icon, tint, bg } = getFileIcon(d.mimeType, d.name);
            const marcado = elegidos.has(d.id);
            const plazo = textoRetencion(d.deletedAt);
            return (
              <li
                key={d.id}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 transition-colors",
                  marcado && "bg-primary/5",
                )}
              >
                <input
                  type="checkbox"
                  checked={marcado}
                  onChange={() => alternar(d.id)}
                  className="h-4 w-4 rounded border-2 border-[var(--rule-base)] accent-[var(--color-primary)]"
                  aria-label={`Elegir ${d.name}`}
                />
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", bg)}>
                  <Icon className={cn("h-4 w-4", tint)} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-sm text-[var(--text-primary)] truncate">{d.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)] tabular-nums">
                    {formatBytes(d.size)}
                    {d.category ? ` · ${d.category}` : ""}
                    {d.deletedAt ? ` · ${borradoHace(d.deletedAt)}` : ""}
                    {plazo && (
                      <span
                        className={cn(
                          "ml-1 font-bold",
                          plazo.urgente
                            ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                            : "text-[var(--text-tertiary)]",
                        )}
                      >
                        · {plazo.texto}
                      </span>
                    )}
                  </p>
                </div>
                <button
                  onClick={() => onRestore(d.id)}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)] text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Restaurar
                </button>
                <button
                  onClick={() => {
                    if (confirm(`¿Eliminar "${d.name}" definitivamente? No se puede deshacer.`)) onPurge(d.id);
                  }}
                  disabled={ocupado}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--data-error-50)] dark:bg-[var(--data-error-500)]/15 text-[var(--data-error-700)] dark:text-[var(--data-error-500)] text-xs font-bold hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Eliminar def.
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
