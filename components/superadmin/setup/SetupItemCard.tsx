"use client";

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
} from "lucide-react";
import {
  PRIORITY_CONFIG,
  type SetupItem,
  type Status,
} from "@/lib/superadmin/setup-types";
import { CATEGORY_ICON } from "@/lib/superadmin/setup-data";

interface SetupItemCardProps {
  item: SetupItem;
  status: Status;
  onToggleStatus: (id: string) => void;
  onSetBlocked: (id: string, blocked: boolean) => void;
}

export default function SetupItemCard({
  item,
  status,
  onToggleStatus,
  onSetBlocked,
}: SetupItemCardProps) {
  const isDone = status === "done";
  const isBlocked = status === "blocked";
  const pCfg = PRIORITY_CONFIG[item.priority];

  return (
    <div
      className={[
        "bg-white dark:bg-gray-950 border rounded-2xl p-5 transition-all",
        isDone
          ? "border-emerald-200 dark:border-emerald-900/40 opacity-60"
          : isBlocked
            ? "border-amber-200 dark:border-amber-900/40"
            : "border-gray-200 dark:border-gray-800 hover:border-teal-300 dark:hover:border-teal-700",
      ].join(" ")}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <button
          onClick={() => onToggleStatus(item.id)}
          className="mt-0.5 shrink-0"
          title={isDone ? "Marcar como pendiente" : "Marcar como hecho"}
        >
          {isDone ? (
            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
          ) : (
            <Circle className="w-6 h-6 text-gray-300 dark:text-gray-600 hover:text-teal-500" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3
              className={[
                "text-base font-bold",
                isDone ? "text-gray-400 line-through" : "text-gray-900 dark:text-white",
              ].join(" ")}
            >
              {item.title}
            </h3>

            {/* Badges */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${pCfg.cls}`}
              >
                {pCfg.label}
              </span>
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                {CATEGORY_ICON[item.category]}
                {item.category}
              </span>
              <span className="flex items-center gap-1 text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                <Clock className="w-2.5 h-2.5" />
                {item.estimatedMinutes}m
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-3">{item.description}</p>

          {/* Blocked reason */}
          {item.blockedReason && (
            <div className="mb-3 p-2 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {item.blockedReason}
            </div>
          )}

          {/* Steps */}
          {!isDone && (
            <details className="mb-3 group">
              <summary className="text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer hover:text-teal-600 list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Pasos exactos ({item.steps.length})
              </summary>
              <ol className="mt-2 ml-4 space-y-1 text-xs text-gray-600 dark:text-gray-400">
                {item.steps.map((step, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="text-teal-600 dark:text-teal-400 font-bold shrink-0">
                      {idx + 1}.
                    </span>
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </details>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 mt-2">
            {item.link && !isDone && (
              <a
                href={item.link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold transition-colors"
              >
                {item.link.label}
                <ExternalLink className="w-3 h-3" />
              </a>
            )}

            {!isDone && (
              <button
                onClick={() => onSetBlocked(item.id, !isBlocked)}
                className={[
                  "px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors",
                  isBlocked
                    ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200",
                ].join(" ")}
              >
                {isBlocked ? "✓ Bloqueado" : "Marcar bloqueado"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
