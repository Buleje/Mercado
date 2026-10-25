"use client";

import { BUILTIN_CATEGORIES, type BuiltinCategory } from "./compartido";
import { cn } from "@/lib/utils";
import { MoreHorizontal, ChevronDown } from "@buleje/design-system/icons";
import type { ModeloArchivo } from "./use-archivo";
import { precargarArchivo } from "./perezosos";
export default function VistasDelPanel({ arch }: { arch: ModeloArchivo }) {
  const { vistaConDatos, filterMode, otrosAbierto, setFilterMode, setActiveFolderId, setOtrosAbierto, conteoCodigo } = arch;
  // ADR-516 — con papeles por anotar, «Por registrar» sube a la vista con su cifra.
  const porPoner = conteoCodigo?.pendientes ?? 0;
  const esPrincipal = (id: BuiltinCategory["id"]) => id === "all" || id === "terceros" || (id === "codigo" && porPoner > 0);
  return (
    <>
          {(() => {
            const visibles = BUILTIN_CATEGORIES.filter((cat) => vistaConDatos[cat.id] || filterMode === cat.id);
            // «Todos» y «Terceros» (lo más usado, 23-10) a la vista; el resto en «Más vistas».
            const principales = visibles.filter((c) => esPrincipal(c.id));
            const resto = visibles.filter((c) => !esPrincipal(c.id));
            // Cerrado, el grupo igual muestra la vista activa si vive adentro
            // (si no, "Papelera" parecería que nada está seleccionado). Antes
            // se abría entero: 10 botones más en Papelera y Actividad, y a
            // 400 px la lista empujaba el contenido una pantalla abajo (11-10).
            const grupoAbierto = otrosAbierto;
            const activoAdentro = resto.find((c) => c.id === filterMode);
            const item = (cat: BuiltinCategory) => {
              const Icon = cat.icon;
              const active = filterMode === cat.id;
              return (
                <li key={cat.id}>
                  <button
                    onPointerEnter={() => precargarArchivo(cat.id)}
                    onFocus={() => precargarArchivo(cat.id)}
                    onClick={() => {
                      setFilterMode(cat.id as typeof filterMode);
                      setActiveFolderId(null);
                    }}
                    className={cn(
                      "w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-bold transition-colors",
                      active ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "text-primary" : cat.color)} />
                    <span className="flex-1 text-left">{cat.label}</span>
                    {cat.id === "codigo" && porPoner > 0 && (
                      <span className="rounded-full bg-[var(--data-warning-100)] px-1.5 text-[length:var(--ts-2xs)] font-bold tabular-nums text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/15 dark:text-[var(--data-warning-500)]">
                        {porPoner}
                      </span>
                    )}
                  </button>
                </li>
              );
            };
            return (
              <ul className="space-y-1 mb-4">
                {principales.map(item)}
                {resto.length > 0 && (
                  <li>
                    <button
                      onClick={() => setOtrosAbierto((v) => !v)}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] transition-colors"
                      aria-expanded={grupoAbierto}
                    >
                      <MoreHorizontal className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
                      <span className="flex-1 text-left">Más vistas</span>
                      <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)] transition-transform", grupoAbierto && "rotate-180")} />
                    </button>
                    {(grupoAbierto || activoAdentro) && (
                      <ul className="mt-1 ml-3 space-y-1 border-l-2 border-[var(--rule-soft)] pl-2">
                        {grupoAbierto ? resto.map(item) : activoAdentro && item(activoAdentro)}
                      </ul>
                    )}
                  </li>
                )}
              </ul>
            );
          })()}
    </>
  );
}