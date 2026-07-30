"use client";

/**
 * FolderBulkBar — acciones sobre varias carpetas a la vez.
 *
 * Poner el mismo emoji a ocho carpetas eran ocho modales; borrar cinco, cinco
 * confirmaciones. Acá se marcan con los checkboxes del árbol y se actúa una vez.
 *
 * Los emojis son CONTENIDO del usuario, no iconografía del sistema (la regla del
 * DS de "no emojis" habla del cromo de la app): el dueño de la carpeta la marca
 * como quiere, igual que le elige el color. Se ofrece una grilla de los que
 * sirven para papeles y también se puede pegar cualquier otro.
 *
 * Las etiquetas se SUMAN o se QUITAN, nunca se reemplaza el array: con varias
 * carpetas marcadas, reemplazar borraría las etiquetas propias de cada una.
 */

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Palette, Smile, Tag, Trash2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOLDER_COLORS } from "./folder-visuals";
import type { BulkFolderAccion } from "@/hooks/use-documents";

/** Emojis que sirven para papeles y trámites, no un picker de 1800. */
const EMOJIS = [
  "📁", "📂", "🗂️", "📄", "📃", "🧾", "🧮", "📊",
  "⚖️", "🛡️", "🏛️", "🏦", "💰", "💳", "🔑", "📌",
  "🏠", "🚚", "🔧", "🧰", "🌲", "🪵", "🐟", "🌱",
  "👤", "👥", "📸", "📅", "⭐", "🔥", "✅", "⚠️",
];

export interface FolderBulkBarProps {
  /** Cuántas carpetas están marcadas y sus ids. */
  ids: string[];
  /** Nombres, para que el confirm de borrado diga qué se lleva. */
  nombres: string[];
  /**
   * Ids de las subcarpetas de lo marcado. NO se borran solas: la FK es
   * `ON DELETE SET NULL`, así que si el usuario no las elige, suben a la raíz.
   * Se le pregunta y se borran explícitamente.
   */
  descendientesIds: string[];
  /** Etiquetas ya usadas en otras carpetas — para no inventar sinónimos. */
  sugerencias: string[];
  /** `ids` explícitos para cuando la acción alcanza más que lo marcado\n   *  (borrar el árbol completo). Sin eso, se aplica a lo marcado. */
  onAccion: (accion: BulkFolderAccion, ids?: string[]) => Promise<number>;
  onSalir: () => void;
  onSeleccionarTodas: () => void;
  totalCarpetas: number;
}

type Panel = "emoji" | "tags" | "color" | null;

export default function FolderBulkBar({
  ids,
  nombres,
  descendientesIds,
  sugerencias,
  onAccion,
  onSalir,
  onSeleccionarTodas,
  totalCarpetas,
}: FolderBulkBarProps) {
  const [panel, setPanel] = useState<Panel>(null);
  const [tag, setTag] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  const cajaRef = useRef<HTMLDivElement>(null);

  // Escape cierra el panel abierto y, si no hay ninguno, sale de la selección.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (panel) setPanel(null);
      else onSalir();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [panel, onSalir]);

  // Click fuera cierra el panel (no la selección: perderla por un click al lado
  // sería peor que dejarla abierta).
  useEffect(() => {
    if (!panel) return;
    const onClick = (e: MouseEvent) => {
      if (cajaRef.current && !cajaRef.current.contains(e.target as Node)) setPanel(null);
    };
    window.addEventListener("mousedown", onClick);
    return () => window.removeEventListener("mousedown", onClick);
  }, [panel]);

  async function correr(clave: string, accion: BulkFolderAccion, cerrar = true, idsExplicitos?: string[]) {
    setOcupado(clave);
    try {
      const n = await onAccion(accion, idsExplicitos);
      setHecho(`${n} ${n === 1 ? "carpeta" : "carpetas"}`);
      window.setTimeout(() => setHecho(null), 2200);
      if (cerrar) setPanel(null);
    } finally {
      setOcupado(null);
    }
  }

  async function borrar() {
    const lista = nombres.slice(0, 4).join(", ") + (nombres.length > 4 ? ` y ${nombres.length - 4} más` : "");
    const ok = window.confirm(
      `¿Eliminar ${ids.length} carpeta(s)?\n\n${lista}\n\nLos documentos que contienen NO se borran: pasan a la raíz.`,
    );
    if (!ok) return;

    // Las subcarpetas no caen solas. Se pregunta en vez de decidir por el
    // usuario: dejarlas en la raíz o borrarlas son dos intenciones distintas y
    // ninguna es obviamente la correcta.
    let aBorrar = ids;
    if (descendientesIds.length > 0) {
      const tambien = window.confirm(
        `Estas carpetas tienen ${descendientesIds.length} subcarpeta(s).\n\n` +
          `Aceptar = borrarlas también.\nCancelar = dejarlas (pasan a la raíz).`,
      );
      if (tambien) aBorrar = [...new Set([...ids, ...descendientesIds])];
    }
    await correr("delete", { action: "delete" }, true, aBorrar);
    onSalir();
  }

  const btn =
    "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition-colors disabled:opacity-50";

  return (
    <div
      ref={cajaRef}
      role="group"
      aria-label="Acciones sobre las carpetas marcadas"
      className="relative mx-1 mb-2 rounded-xl border-2 border-primary/40 bg-primary/5 p-2"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-xs font-bold text-white">
          <Check className="h-3.5 w-3.5" />
          {ids.length}
        </span>
        {ids.length < totalCarpetas && (
          <button type="button" onClick={onSeleccionarTodas} className={cn(btn, "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}>
            Todas ({totalCarpetas})
          </button>
        )}

        <button
          type="button"
          onClick={() => setPanel(panel === "emoji" ? null : "emoji")}
          aria-expanded={panel === "emoji"}
          className={cn(btn, panel === "emoji" ? "bg-[var(--surface-raised)] text-primary" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}
        >
          <Smile className="h-3.5 w-3.5" /> Emoji
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "tags" ? null : "tags")}
          aria-expanded={panel === "tags"}
          className={cn(btn, panel === "tags" ? "bg-[var(--surface-raised)] text-primary" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}
        >
          <Tag className="h-3.5 w-3.5" /> Etiquetar
        </button>
        <button
          type="button"
          onClick={() => setPanel(panel === "color" ? null : "color")}
          aria-expanded={panel === "color"}
          className={cn(btn, panel === "color" ? "bg-[var(--surface-raised)] text-primary" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}
        >
          <Palette className="h-3.5 w-3.5" /> Color
        </button>
        <button
          type="button"
          onClick={() => void borrar()}
          disabled={ocupado === "delete"}
          className={cn(btn, "text-[var(--data-error-700)] hover:bg-[var(--data-error-50)] dark:text-[var(--data-error-500)] dark:hover:bg-[var(--data-error-500)]/15")}
        >
          {ocupado === "delete" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
          Eliminar
        </button>

        <button
          type="button"
          onClick={onSalir}
          className={cn(btn, "ml-auto text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]")}
          aria-label="Salir de la selección"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {hecho && (
        <p className="mt-1.5 px-1 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--data-success-700)] dark:text-[var(--data-success-500)]">
          Listo · {hecho}
        </p>
      )}

      {panel === "emoji" && (
        <div className="mt-2 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
          <div className="grid grid-cols-8 gap-1">
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                disabled={ocupado !== null}
                onClick={() => void correr(`emoji-${e}`, { action: "emoji", emoji: e })}
                className="flex h-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-primary/10 disabled:opacity-50"
                aria-label={`Poner ${e} a las carpetas marcadas`}
              >
                {e}
              </button>
            ))}
          </div>
          <div className="mt-2 flex items-center gap-1.5 border-t-2 border-[var(--rule-soft)] pt-2">
            <input
              type="text"
              maxLength={8}
              placeholder="Pegá otro…"
              className="w-24 rounded-md border-2 border-[var(--rule-base)] px-2 py-1 text-sm outline-none focus:border-primary"
              onKeyDown={(e) => {
                const v = (e.target as HTMLInputElement).value.trim();
                if (e.key === "Enter" && v) void correr("emoji-custom", { action: "emoji", emoji: v });
              }}
            />
            <button
              type="button"
              disabled={ocupado !== null}
              onClick={() => void correr("emoji-null", { action: "emoji", emoji: null })}
              className="text-[length:var(--ts-2xs,11px)] font-bold text-[var(--text-tertiary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
            >
              Quitar emoji
            </button>
          </div>
        </div>
      )}

      {panel === "tags" && (
        <div className="mt-2 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
          {/* El input va en su propia fila: el sidebar es angosto y con los dos
              botones al lado quedaba de dos centímetros. */}
          <input
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tag.trim()) void correr("tag-add", { action: "addTags", tags: [tag.trim()] }, false);
            }}
            placeholder="legal, sunat, 2026…"
            autoFocus
            aria-label="Etiqueta para las carpetas marcadas"
            className="w-full rounded-md border-2 border-[var(--rule-base)] px-2 py-1.5 text-sm outline-none focus:border-primary"
          />
          <div className="mt-1.5 flex items-center gap-1.5">
            <button
              type="button"
              disabled={!tag.trim() || ocupado !== null}
              onClick={() => void correr("tag-add", { action: "addTags", tags: [tag.trim()] }, false)}
              className="flex-1 rounded-md bg-primary px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-50"
            >
              Agregar
            </button>
            <button
              type="button"
              disabled={!tag.trim() || ocupado !== null}
              onClick={() => void correr("tag-del", { action: "removeTags", tags: [tag.trim()] }, false)}
              className="flex-1 rounded-md border-2 border-[var(--rule-base)] px-2 py-1.5 text-xs font-bold text-[var(--text-secondary)] disabled:opacity-50"
              title="Quitar esta etiqueta de las carpetas marcadas"
            >
              Quitar
            </button>
          </div>
          {sugerencias.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1 border-t-2 border-[var(--rule-soft)] pt-2">
              <span className="text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">Ya usás:</span>
              {sugerencias.slice(0, 12).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setTag(s)}
                  className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-[length:var(--ts-2xs,11px)] font-bold text-[var(--text-secondary)] hover:bg-primary/10 hover:text-primary"
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {panel === "color" && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded-lg border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] p-2">
          {FOLDER_COLORS.map((c) => (
            <button
              key={c.key}
              type="button"
              disabled={ocupado !== null}
              onClick={() => void correr(`color-${c.key}`, { action: "color", color: c.value })}
              className="h-7 w-7 rounded-full border-2 border-white shadow-sm ring-1 ring-black/10 disabled:opacity-50"
              style={{ backgroundColor: c.value }}
              aria-label={`Pintar de ${c.label}`}
              title={c.label}
            />
          ))}
          <button
            type="button"
            disabled={ocupado !== null}
            onClick={() => void correr("color-null", { action: "color", color: null })}
            className="text-[length:var(--ts-2xs,11px)] font-bold text-[var(--text-tertiary)] underline-offset-2 hover:text-[var(--text-primary)] hover:underline"
          >
            Sin color
          </button>
        </div>
      )}
    </div>
  );
}
