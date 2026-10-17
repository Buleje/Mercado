"use client";

/**
 * Una fila del buscador del panel (⌘K) y su esqueleto de carga. Salió de
 * `GlobalSearch.tsx` (17-10). Un comando muestra las tres cosas que pide el
 * PDF: la acción (título), el destino (debajo) y la entidad (chip).
 */

import type { ElementType } from "react";
import { ArrowRight } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { ResultadoEnlazable } from "@/components/admin/shared/ResultadoEnlazable";
import type { SearchResult } from "./indice-modulos";

// ── Highlight de texto coincidente ───────────────────────────────────────────

export function HighlightText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <span>{text}</span>;
  const regex = new RegExp(`(${query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
  const parts = text.split(regex);
  return (
    <span>
      {parts.map((part, i) =>
        regex.test(part) ? (
          <mark key={i} className="bg-[var(--data-warning-100)] dark:bg-[var(--data-warning-500)]/40 text-[var(--data-warning-500)] dark:text-[var(--data-warning-500)] rounded px-0.5">
            {part}
          </mark>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </span>
  );
}

// ── Skeleton de carga ─────────────────────────────────────────────────────────

export function ResultSkeleton() {
  return (
    <div className="px-4 py-3 space-y-3 animate-pulse">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--rule-soft)] shrink-0" />
          <div className="flex-1 space-y-1.5">
            <div className="h-3.5 bg-[var(--rule-soft)] rounded w-2/3" />
            <div className="h-3 bg-[var(--rule-soft)] rounded w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

interface FilaResultadoProps {
  r: SearchResult;
  query: string;
  href: string | null;
  seleccionado: boolean;
  /** Ícono y color del grupo (si la fila no trae el suyo). */
  iconoGrupo: ElementType;
  color: string;
  onElegir: () => void;
}

export function FilaResultado({ r, query, href, seleccionado, iconoGrupo, color, onElegir }: FilaResultadoProps) {
  const Icon = r.icono ?? iconoGrupo;
  return (
    <ResultadoEnlazable
      href={href}
      onElegir={onElegir}
      className={cn(
        // Separador `--rule-soft`: con `--rule-base` cada fila quedaba
        // subrayada y la lista se leía como una tabla rayada.
        "w-full flex items-center gap-3 px-4 min-h-11 py-1.5 text-left transition-colors border-b border-[var(--rule-soft)] dark:border-[var(--rule-base)] last:border-0",
        seleccionado
          ? "bg-primary/10 ring-1 ring-inset ring-[color-mix(in_oklab,var(--accent)_25%,transparent)]"
          : "hover:bg-[var(--surface-sunken)] "
      )}
    >
      <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-[var(--surface-sunken)] ", color)}>
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-[var(--text-primary)] truncate">
          <HighlightText text={r.title} query={query} />
        </p>
        <p className="text-xs text-[var(--text-tertiary)] dark:text-muted truncate">{r.subtitle}</p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {r.entidad && (
          <span className="max-w-[9rem] truncate rounded-full border border-[var(--rule-base)] bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
            {r.entidad}
          </span>
        )}
        {r.badge && (
          <span
            className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
            // Fallback al token de la superficie fuerte: antes era el hex
            // #6b7280, que no existe en la paleta.
            style={{ background: r.badgeColor ?? "var(--rule-strong)" }}
          >
            {r.badge}
          </span>
        )}
        {seleccionado && <ArrowRight className="h-3.5 w-3.5 text-primary" aria-hidden />}
      </div>
    </ResultadoEnlazable>
  );
}
