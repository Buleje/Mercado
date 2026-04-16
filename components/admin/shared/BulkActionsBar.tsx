"use client";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { CheckSquare, Square, MoreHorizontal } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface BulkAction {
  id: string;
  label: string;
  icon: LucideIcon;
  variant?: "default" | "danger";
  onClick: (selectedIds: string[]) => void;
}

interface BulkActionsBarProps {
  selectedIds: string[];
  totalCount: number;
  onSelectAll: () => void;
  onClearSelection: () => void;
  actions: BulkAction[];
  className?: string;
}

export default function BulkActionsBar({
  selectedIds,
  totalCount,
  onSelectAll,
  onClearSelection,
  actions,
  className,
}: BulkActionsBarProps) {
  const count = selectedIds.length;
  const [showMore, setShowMore] = useState(false);

  if (count === 0) return null;

  const visibleActions = actions.slice(0, 3);
  const overflowActions = actions.slice(3);

  return (
    <div className={cn(
      "sticky top-0 z-20 flex items-center gap-3 px-4 py-2.5 rounded-xl border border-primary/20 bg-primary/5 backdrop-blur-sm ",
      className,
    )}>
      {/* Selection info */}
      <button onClick={count === totalCount ? onClearSelection : onSelectAll} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline">
        {count === totalCount ? <CheckSquare className="h-3.5 w-3.5" /> : <Square className="h-3.5 w-3.5" />}
        {count} de {totalCount} seleccionados
      </button>

      <div className="h-4 w-px bg-primary/20" />

      {/* Visible actions */}
      {visibleActions.map(action => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            onClick={() => action.onClick(selectedIds)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
              action.variant === "danger"
                ? "bg-red-100 text-red-700 hover:bg-red-200"
                : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-200",
            )}
          >
            <Icon className="h-3.5 w-3.5" />
            {action.label}
          </button>
        );
      })}

      {/* Overflow menu */}
      {overflowActions.length > 0 && (
        <div className="relative">
          <button onClick={() => setShowMore(!showMore)} className="p-1.5 rounded-lg hover:bg-white/50 transition-colors">
            <MoreHorizontal className="h-4 w-4 text-gray-600" />
          </button>
          {showMore && (
            <div className="absolute top-full right-0 mt-1 w-44 bg-white border border-gray-200 rounded-xl py-1 z-30">
              {overflowActions.map(action => {
                const Icon = action.icon;
                return (
                  <button
                    key={action.id}
                    onClick={() => { action.onClick(selectedIds); setShowMore(false); }}
                    className={cn(
                      "w-full flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors",
                      action.variant === "danger" ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {action.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Clear */}
      <button onClick={onClearSelection} className="ml-auto text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors">
        Limpiar selección
      </button>
    </div>
  );
}
