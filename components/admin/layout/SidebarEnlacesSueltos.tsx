"use client";

/**
 * Menú lateral «sin categorías»: cada pestaña visible es un enlace directo
 * (Brandon 2026-10-20). Recibe los grupos ya filtrados por `tabsDeCategoria`
 * del sidebar — acá no se decide qué se ve, sólo cómo se dibuja — y separa los
 * grupos con una línea fina sin título. Funciona igual desplegado (ícono +
 * nombre + avisos) y compacto (sólo íconos, el nombre sale en el tooltip).
 * Colores y separación: los del diseño elegido (sidebar-temas.ts).
 */
import React from "react";
import { cn } from "@/lib/utils";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import { MODULE_INFO } from "@/app/admin/_lib/tab-categories";
import { preloadTab } from "@/app/admin/_lib/tab-preload";
import { PillPronto } from "@/components/admin/shared/SidebarFlyout";
import { ScopeBadge } from "@/components/admin/layout/ScopeBadge";
import type { GrupoDeEnlaces } from "@/components/admin/layout/sidebar-enlaces";
import type { Densidad, EstiloBarra } from "@/components/admin/layout/sidebar-temas";

type TabItem = { id: Tab; label: string; icon: React.ElementType };

export interface SidebarEnlacesSueltosProps {
  grupos: GrupoDeEnlaces[];
  compacto: boolean;
  tab: Tab;
  allTabs: readonly TabItem[];
  resolveLabel: (id: string, fallback: string) => string;
  navigateTab: (tab: Tab) => void;
  alerts: Record<string, number>;
  destacados: Set<string>;
  estilo: EstiloBarra;
  densidad: Densidad;
  accentBarStyle: React.CSSProperties;
  colorDeIcono: (categoriaId: string) => string;
  onHoverCompacto: (el: HTMLElement | null, label: string, tip?: string) => void;
  onLeaveCompacto: () => void;
}

export function SidebarEnlacesSueltos(p: SidebarEnlacesSueltosProps) {
  const porId = React.useMemo(() => new Map(p.allTabs.map((t) => [t.id as string, t])), [p.allTabs]);
  return (
    <div data-modo-menu="enlaces">
      {p.grupos.map((g) => (
        <React.Fragment key={g.categoriaId}>
          {g.separadorAntes && (
            <div aria-hidden className={cn("border-t", p.compacto ? "mx-1.5 my-1.5" : p.densidad.separador, p.estilo.border)} />
          )}
          {g.visibles.map((id) => {
            const info = porId.get(id);
            if (!info) return null;
            const label = p.resolveLabel(id, info.label);
            return p.compacto ? (
              <EnlaceCompacto key={id} p={p} id={id} label={label} Icono={info.icon} />
            ) : (
              <EnlaceDesplegado key={id} p={p} id={id} label={label} Icono={info.icon} categoriaId={g.categoriaId} />
            );
          })}
          {!p.compacto &&
            g.pronto.map((id) => {
              const info = porId.get(id);
              const Icono = info?.icon;
              return (
                <div
                  key={`pronto-${id}`}
                  title="Módulo disponible pronto"
                  className={cn(
                    "relative w-full flex items-center rounded-xl text-[length:var(--ts-sm)] opacity-50 cursor-not-allowed select-none",
                    p.densidad.fila,
                    p.densidad.gap,
                    p.estilo.text,
                  )}
                >
                  {Icono && <Icono className="h-[18px] w-[18px] shrink-0" />}
                  <span className="truncate">{info ? p.resolveLabel(id, info.label) : id}</span>
                  <PillPronto className="ml-auto" />
                </div>
              );
            })}
        </React.Fragment>
      ))}
    </div>
  );
}

type EnlaceProps = { p: SidebarEnlacesSueltosProps; id: string; label: string; Icono: React.ElementType };

function EnlaceDesplegado({ p, id, label, Icono, categoriaId }: EnlaceProps & { categoriaId: string }) {
  const activo = p.tab === id;
  const avisos = p.alerts[id] ?? 0;
  return (
    <button
      type="button"
      data-tour-tab={id}
      aria-current={activo ? "page" : undefined}
      onClick={() => p.navigateTab(id as Tab)}
      onMouseEnter={() => preloadTab(id)}
      onFocus={() => preloadTab(id)}
      className={cn(
        "group relative w-full flex items-center rounded-xl text-[length:var(--ts-sm)] font-medium transition-all duration-[var(--dur-fast)]",
        p.densidad.fila,
        p.densidad.gap,
        activo ? p.estilo.activeItem : cn(p.estilo.text, p.estilo.hover),
      )}
    >
      {activo && (
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full" style={p.accentBarStyle} />
      )}
      <Icono
        className={cn(
          "h-[18px] w-[18px] shrink-0 transition-all duration-[var(--dur-base)] group-hover:scale-110",
          activo ? p.estilo.iconoActivo : p.colorDeIcono(categoriaId),
        )}
      />
      <span className="truncate flex-1 text-left">{label}</span>
      <ScopeBadge tabId={id} variant="dot" />
      {p.destacados.has(id) && avisos === 0 && id !== "asistente-ia" && (
        <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-md bg-[var(--data-warning-500)]/20 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)] leading-none">
          Destacado
        </span>
      )}
      {id === "asistente-ia" && avisos === 0 && (
        <span className="shrink-0 text-[length:var(--ts-2xs)] font-bold px-1.5 py-0.5 rounded-md bg-primary text-primary-foreground leading-none">
          Nuevo
        </span>
      )}
      {avisos > 0 && (
        <span className="text-[length:var(--ts-2xs)] font-bold min-w-[18px] h-[18px] rounded-full flex items-center justify-center bg-[var(--data-error-700)] text-white leading-none animate-pulse">
          {avisos}
        </span>
      )}
    </button>
  );
}

function EnlaceCompacto({ p, id, label, Icono }: EnlaceProps) {
  const activo = p.tab === id;
  const avisos = p.alerts[id] ?? 0;
  return (
    <button
      type="button"
      data-tour-tab={id}
      aria-label={label}
      aria-current={activo ? "page" : undefined}
      onClick={() => p.navigateTab(id as Tab)}
      onMouseEnter={(e) => {
        preloadTab(id);
        p.onHoverCompacto(e.currentTarget, label, MODULE_INFO[id as Tab]?.tip);
      }}
      onMouseLeave={p.onLeaveCompacto}
      onFocus={() => preloadTab(id)}
      className={cn(
        "relative w-full flex items-center justify-center rounded-xl transition-all mb-0.5 px-0 py-2.5",
        activo ? p.estilo.activeItem : cn(p.estilo.text, p.estilo.hover),
      )}
    >
      {activo && <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full" style={p.accentBarStyle} />}
      <Icono className="h-5 w-5 shrink-0" />
      {avisos > 0 && (
        <span
          className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-[var(--data-error-700)] text-white text-xs font-extrabold tabular-nums leading-none ring-2 ring-[var(--surface-raised)] dark:ring-[var(--surface-canvas)] shadow-sm"
          title={`${avisos} ${avisos === 1 ? "aviso" : "avisos"} sin leer`}
        >
          {avisos > 9 ? "9+" : avisos}
        </span>
      )}
    </button>
  );
}
