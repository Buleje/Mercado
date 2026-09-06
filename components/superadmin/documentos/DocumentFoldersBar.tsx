"use client";

import { useState } from "react";
import { Folder, FolderOpen, Plus, Check, X, Loader2 } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import type { DbDocumentFolder } from "@/lib/types/documents";

/** Valor de carpeta activa: id de carpeta | "todas" | "none" (sin carpeta). */
export type FolderFilter = string | "todas" | "none";

interface Props {
  folders: DbDocumentFolder[];
  active: FolderFilter;
  counts: { todas: number; none: number; byId: Record<string, number> };
  onPick: (v: FolderFilter) => void;
  onCreate: (name: string) => void | Promise<void>;
  creating?: boolean;
}

const CHIP =
  "flex items-center gap-1.5 h-9 px-3 rounded-full border-2 text-sm font-semibold transition-colors whitespace-nowrap";

export default function DocumentFoldersBar({
  folders,
  active,
  counts,
  onPick,
  onCreate,
  creating,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  const submit = async () => {
    const v = name.trim();
    if (!v) return;
    await onCreate(v);
    setName("");
    setAdding(false);
  };

  const chip = (key: FolderFilter, label: string, count: number, Icon: typeof Folder) => {
    const on = active === key;
    return (
      <button
        key={String(key)}
        type="button"
        onClick={() => onPick(key)}
        aria-pressed={on}
        className={cn(
          CHIP,
          on
            ? "border-primary bg-primary text-white"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:border-primary hover:text-primary",
        )}
      >
        <Icon className="h-4 w-4" />
        {label}
        <span className={cn("text-xs font-bold", on ? "text-white/80" : "text-[var(--text-tertiary)]")}>
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chip("todas", "Todas", counts.todas, FolderOpen)}
      {folders.map((f) => chip(f.id, f.name, counts.byId[f.id] ?? 0, Folder))}
      {folders.length > 0 && chip("none", "Sin carpeta", counts.none, Folder)}

      {adding ? (
        <div className="flex items-center gap-1">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") {
                setAdding(false);
                setName("");
              }
            }}
            autoFocus
            maxLength={80}
            placeholder="Nombre de carpeta"
            className="h-9 px-3 text-sm border-2 border-primary rounded-full bg-[var(--surface-raised)] text-[var(--text-primary)] outline-none"
          />
          <button
            type="button"
            onClick={submit}
            disabled={creating || !name.trim()}
            aria-label="Crear carpeta"
            className="grid place-items-center h-9 w-9 rounded-full bg-primary text-white disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setName("");
            }}
            aria-label="Cancelar"
            className="grid place-items-center h-9 w-9 rounded-full border-2 border-[var(--rule-base)] text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className={cn(CHIP, "border-dashed border-[var(--rule-base)] text-[var(--text-tertiary)] hover:border-primary hover:text-primary")}
        >
          <Plus className="h-4 w-4" /> Nueva carpeta
        </button>
      )}
    </div>
  );
}
