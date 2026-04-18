"use client";

/**
 * RouteCard — card individual de ruta en el sitemap.
 *
 * Muestra: icon + label + status chip + descripción + path mono + tags.
 * Link externo abre en new tab; interno abre in-place.
 */

import Link from "next/link";
import { createElement } from "react";
import { type SiteRoute } from "@/lib/site-map";
import {
  ExternalLink,
  Lock,
} from "@buleje/design-system/icons";
import { getIconByName } from "./icon-map";

interface Props {
  route: SiteRoute;
}

const STATUS_META: Record<SiteRoute["status"], { label: string; className: string }> = {
  live: {
    label: "Live",
    className: "bg-[var(--data-success-50)] text-[var(--data-success)]",
  },
  beta: {
    label: "Beta",
    className: "bg-[var(--data-info-50)] text-[var(--data-info)]",
  },
  wip: {
    label: "WIP",
    className: "bg-[var(--data-warning-50)] text-[var(--data-warning)]",
  },
  mock: {
    label: "Mock",
    className: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  },
  legacy: {
    label: "Legacy",
    className: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
  },
};

const AUTH_LABEL: Record<SiteRoute["auth"], string> = {
  public: "Público",
  customer: "Customer",
  admin: "Admin",
  superadmin: "SuperAdmin",
  supplier: "Supplier",
  driver: "Driver",
};

export default function RouteCard({ route }: Props) {
  const IconComp = route.icon ? getIconByName(route.icon) : null;
  const iconEl = IconComp
    ? createElement(IconComp, { className: "w-4 h-4", strokeWidth: 1.75 })
    : null;
  const status = STATUS_META[route.status];
  // Reemplaza [param] con `_` para permitir navegar en dev
  const href = route.path.replace(/\[[^\]]+\]/g, "_");
  const isDynamic = route.path.includes("[");
  const requiresAuth = route.auth !== "public";

  return (
    <article className="group relative bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-xl p-4 hover:border-[var(--accent)]/40 hover:shadow-[var(--shadow-sm)] transition-all">
      {/* Header: icon + label + status */}
      <div className="flex items-start gap-3 mb-2">
        <span
          aria-hidden="true"
          className="shrink-0 inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)] group-hover:text-[var(--accent)] group-hover:bg-[var(--accent-soft)] transition-colors"
        >
          {iconEl}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] truncate">
              {route.label}
            </h3>
            {requiresAuth && (
              <span
                className="inline-flex items-center gap-1 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]"
                title={`Requiere auth: ${AUTH_LABEL[route.auth]}`}
              >
                <Lock className="w-3 h-3" />
                <span className="sr-only">{AUTH_LABEL[route.auth]}</span>
              </span>
            )}
          </div>
          <p className="text-xs text-[var(--text-tertiary)] leading-snug mt-0.5 line-clamp-2">
            {route.description}
          </p>
        </div>
        <span
          className={[
            "shrink-0 inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-bold uppercase tracking-wider",
            status.className,
          ].join(" ")}
        >
          {status.label}
        </span>
      </div>

      {/* Path mono + action */}
      <div className="mt-3 flex items-center gap-2">
        <code
          className="flex-1 min-w-0 truncate text-[length:var(--ts-xs)] font-mono text-[var(--text-secondary)] bg-[var(--surface-sunken)] px-2 py-1 rounded-md"
          title={route.path}
        >
          {route.path}
        </code>
        <Link
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Abrir ${route.label}`}
          title={isDynamic ? "Ruta dinámica — `_` reemplaza al param" : undefined}
          className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--accent)] hover:underline shrink-0 px-2 py-1"
        >
          Abrir
          <ExternalLink className="w-3 h-3" />
        </Link>
      </div>

      {/* Tags */}
      {route.tags && route.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {route.tags.slice(0, 5).map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[length:var(--ts-2xs)] font-medium text-[var(--text-tertiary)] bg-[var(--surface-sunken)] border border-[var(--rule-base)]"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </article>
  );
}
