"use client";

import { Plus, Sparkles, Pencil, Trash2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { describeRules } from "@/lib/documentos/smart-folders";
import type { ModeloArchivo } from "./use-archivo";
export default function CarpetasInteligentes({ arch }: { arch: ModeloArchivo }) {
  const { setSmartModal, smartFolders, filterMode, activeSmartId, setFilterMode, setActiveSmartId, confirm,
    persistSmart } = arch;
  return (
    <>
          {/* Carpetas inteligentes (filtros guardados) */}
          <div className="mt-3 flex items-center justify-between px-3">
            <span className="text-[length:var(--ts-2xs,11px)] font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Inteligentes</span>
            <button onClick={() => setSmartModal("new")} className="text-[var(--text-tertiary)] hover:text-primary" aria-label="Nueva carpeta inteligente" title="Nueva carpeta inteligente">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          <ul className="mt-1 space-y-0.5">
            {smartFolders.map((sf) => {
              const active = filterMode === "smart" && activeSmartId === sf.id;
              return (
                <li key={sf.id} className="group/sf flex items-center">
                  <button
                    onClick={() => { setFilterMode("smart"); setActiveSmartId(sf.id); }}
                    className={cn("flex min-w-0 flex-1 items-center gap-2 rounded-xl px-3 py-2 text-left text-sm font-bold transition-colors", active ? "bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]" : "text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]")}
                  >
                    <Sparkles className="h-4 w-4 shrink-0 text-[var(--accent)]" />
                    <span className="min-w-0 flex-1 truncate">
                      {sf.name}
                      <span className="block truncate text-[length:var(--ts-2xs,11px)] font-normal text-[var(--text-tertiary)]">{describeRules(sf.rules)}</span>
                    </span>
                  </button>
                  <button onClick={() => setSmartModal(sf)} className="px-1 text-[var(--text-tertiary)] opacity-0 group-hover/sf:opacity-100 hover:text-primary" aria-label="Editar" title="Editar"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={async () => { if (await confirm({ title: `¿Borrar la carpeta inteligente "${sf.name}"?`, intent: "danger", confirmLabel: "Sí, borrar" })) { persistSmart(smartFolders.filter((x) => x.id !== sf.id)); if (activeSmartId === sf.id) { setActiveSmartId(null); setFilterMode("all"); } } }} className="px-1 text-[var(--text-tertiary)] opacity-0 group-hover/sf:opacity-100 hover:text-[var(--data-error-700)]" aria-label="Borrar" title="Borrar"><Trash2 className="h-3.5 w-3.5" /></button>
                </li>
              );
            })}
            {smartFolders.length === 0 && (
              <li className="px-3 py-1 text-[length:var(--ts-2xs,11px)] text-[var(--text-tertiary)]">Ej: “Facturas ≥ S/1000”, “Vence este mes”.</li>
            )}
          </ul>
    </>
  );
}