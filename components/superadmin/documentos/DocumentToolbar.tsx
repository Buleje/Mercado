"use client";

import { Search, ArrowDownUp, LayoutGrid, List, CheckSquare, FileText } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { DOC_CATEGORIES } from "@/lib/types/documents";
import { CAT_LABEL, SORT_LABEL, type SortKey, type ViewMode } from "./shared";

interface Props {
  search: string;
  onSearch: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
  sort: SortKey;
  onSort: (v: SortKey) => void;
  view: ViewMode;
  onView: (v: ViewMode) => void;
  selecting: boolean;
  onToggleSelecting: () => void;
  contentMode: boolean;
  onToggleContentMode: () => void;
}

const SELECT_CLASS =
  "h-12 text-base border-2 border-[var(--rule-base)] rounded-2xl px-3 bg-[var(--surface-raised)] text-[var(--text-primary)]";

export default function DocumentToolbar({
  search,
  onSearch,
  category,
  onCategory,
  sort,
  onSort,
  view,
  onView,
  selecting,
  onToggleSelecting,
  contentMode,
  onToggleContentMode,
}: Props) {
  return (
    <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
      <div className="flex flex-1 max-w-md gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-[var(--text-tertiary)]" />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder={
              contentMode ? "Buscar dentro del contenido (OCR)…" : "Buscar por nombre o etiqueta…"
            }
            className="w-full pl-10 pr-3 h-12 text-base border-2 border-[var(--rule-base)] rounded-2xl bg-[var(--surface-raised)] text-[var(--text-primary)]"
          />
        </div>
        <button
          type="button"
          onClick={onToggleContentMode}
          aria-pressed={contentMode}
          title="Buscar dentro del contenido (texto OCR)"
          className={cn(
            "flex items-center gap-1.5 h-12 px-3 rounded-2xl border-2 text-sm font-semibold transition-colors shrink-0",
            contentMode
              ? "border-primary text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10"
              : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]",
          )}
        >
          <FileText className="h-5 w-5" />
          <span className="hidden sm:inline">En contenido</span>
        </button>
      </div>

      <select
        value={category}
        onChange={(e) => onCategory(e.target.value)}
        aria-label="Filtrar por categoría"
        className={SELECT_CLASS}
      >
        <option value="todos">Todas las categorías</option>
        {DOC_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CAT_LABEL[c] ?? c}
          </option>
        ))}
      </select>

      <div className="relative">
        <ArrowDownUp className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[var(--text-tertiary)] pointer-events-none" />
        <select
          value={sort}
          onChange={(e) => onSort(e.target.value as SortKey)}
          aria-label="Ordenar"
          className={cn(SELECT_CLASS, "pl-9")}
        >
          {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
            <option key={k} value={k}>
              {SORT_LABEL[k]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 lg:ml-auto">
        {/* Toggle selección múltiple */}
        <button
          type="button"
          onClick={onToggleSelecting}
          aria-pressed={selecting}
          title="Seleccionar varios"
          className={cn(
            "flex items-center gap-2 h-12 px-3 rounded-2xl border-2 text-base font-semibold transition-colors",
            selecting
              ? "border-primary text-[var(--accent-ink)] dark:text-[var(--accent)] bg-primary/10"
              : "border-[var(--rule-base)] text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]",
          )}
        >
          <CheckSquare className="h-5 w-5" />
          <span className="hidden sm:inline">Seleccionar</span>
        </button>

        {/* Toggle vista lista / grid */}
        <div className="flex h-12 rounded-2xl border-2 border-[var(--rule-base)] overflow-hidden">
          <button
            type="button"
            onClick={() => onView("list")}
            aria-pressed={view === "list"}
            title="Vista lista"
            className={cn(
              "px-3 flex items-center transition-colors",
              view === "list"
                ? "bg-primary text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]",
            )}
          >
            <List className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => onView("grid")}
            aria-pressed={view === "grid"}
            title="Vista cuadrícula"
            className={cn(
              "px-3 flex items-center transition-colors",
              view === "grid"
                ? "bg-primary text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--surface-alt)]",
            )}
          >
            <LayoutGrid className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}
