"use client";

import {
  AlertCircle,
  CheckCircle2,
  Circle,
  Clock,
  ExternalLink,
} from "@buleje/design-system/icons";
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
        "bg-[var(--surface-canvas)] border rounded-xl p-5 transition-all",
        isDone
          ? "border-emerald-200 dark:border-emerald-900/40 opacity-60"
          : isBlocked
            ? "border-teal-200 dark:border-teal-900/40"
            : "border-[var(--rule-base)] hover:border-teal-300 dark:hover:border-[var(--accent-dark)]",
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
            <CheckCircle2 className="w-6 h-6 text-[var(--data-success-500)]" />
          ) : (
            <Circle className="w-6 h-6 text-gray-300 dark:text-gray-600 hover:text-[var(--accent)]" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-start justify-between gap-3 mb-1">
            <h3
              className={[
                "text-base font-bold",
                isDone ? "text-gray-400 line-through" : "text-[var(--text-primary)]",
              ].join(" ")}
            >
              {item.title}
            </h3>

            {/* Badges */}
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-[length:var(--ts-xs)] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${pCfg.cls}`}
              >
                {pCfg.label}
              </span>
              <span className="flex items-center gap-1 text-[length:var(--ts-xs)] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                {CATEGORY_ICON[item.category]}
                {item.category}
              </span>
              <span className="flex items-center gap-1 text-[length:var(--ts-xs)] font-bold px-2 py-0.5 rounded-full bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                <Clock className="w-2.5 h-2.5" />
                {item.estimatedMinutes}m
              </span>
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-[var(--text-tertiary)] mb-3">{item.description}</p>

          {/* Blocked reason */}
          {item.blockedReason && (
            <div className="mb-3 p-2 rounded-lg bg-teal-50 dark:bg-teal-950/20 border border-teal-500 dark:border-teal-500/40 text-xs text-teal-500 dark:text-teal-500 flex items-center gap-2">
              <AlertCircle className="w-3 h-3 shrink-0" />
              {item.blockedReason}
            </div>
          )}

          {/* Steps */}
          {!isDone && (
            <details className="mb-3 group">
              <summary className="text-xs font-semibold text-[var(--text-secondary)] cursor-pointer hover:text-[var(--accent-dark)] list-none flex items-center gap-1">
                <span className="group-open:rotate-90 transition-transform inline-block">▶</span>
                Pasos exactos ({item.steps.length})
              </summary>
              <ol className="mt-2 ml-4 space-y-1 text-xs text-[var(--text-secondary)]">
                {item.steps.map((step, idx) => (
                  <li key={idx} className="flex gap-2">
                    <span className="text-[var(--accent)] font-bold shrink-0">
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
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent-dark)] hover:bg-[var(--accent-dark)] text-white text-xs font-semibold transition-colors"
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
                    ? "bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300"
                    : "bg-[var(--surface-sunken)] text-[var(--text-secondary)] hover:bg-gray-200",
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
