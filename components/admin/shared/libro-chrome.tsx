"use client";

/**
 * libro-chrome — la cabina de mando de los libros forestales (CTP y TH).
 *
 * Antes cada libro apilaba: cabecera editorial con 4-5 botones que envolvían a
 * dos filas + selector de período en su propia fila + doce sub-tabs que
 * envolvían a dos filas más. Unos 370px de cromo antes de la primera cifra del
 * libro — en un portátil, más de un tercio de la pantalla.
 *
 * Acá va todo en un solo bloque: identidad + estado + período + acciones en una
 * fila, y la navegación agrupada por FASE del libro (Operación → Trazabilidad →
 * Control → Gestión) en otra. Doce destinos planos no se recuerdan; cuatro
 * grupos de tres, sí — y de paso el orden enseña el flujo de la planta.
 *
 * Compartido entre los dos libros a propósito: el operario que sabe moverse en
 * el CTP sabe moverse en el de Títulos Habilitantes.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronDown, Loader2, type LucideIcon } from "@buleje/design-system/icons";
import { Kicker, PageTitle } from "@buleje/design-system";
import { isEditableTarget, isModalOpen } from "@/lib/keyboard-guards";
import { useModuleTabs } from "@/contexts/module-tabs-context";

export interface LibroView {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Qué se hace acá, en una línea. Va como tooltip, no ocupa pantalla. */
  hint: string;
}

export interface LibroGroup {
  id: string;
  label: string;
  views: LibroView[];
}

export interface LibroAction {
  id: string;
  label: string;
  /** Una línea de por qué/para qué. Solo en el menú desplegable. */
  hint?: string;
  icon: LucideIcon;
  onSelect: () => void;
  /** `dark` = acción oficial (la que se presenta ante la autoridad). */
  tone?: "default" | "dark";
  busy?: boolean;
  disabled?: boolean;
}

interface LibroChromeProps {
  /** Persistencia de orden/registro en el sidebar. */
  moduleId: string;
  eyebrow: string;
  title: string;
  icon: LucideIcon;
  /** Vacío (o una sola vista) = módulo sin sub-navegación: la fila no se dibuja. */
  groups?: LibroGroup[];
  view?: string;
  onView?: (view: string) => void;
  /** Alertas por vista → punto en el grupo que la contiene. */
  alerts?: Record<string, number>;
  /** Chip de estado (score de cumplimiento). */
  status?: ReactNode;
  /** Control de contexto del libro (período). */
  context?: ReactNode;
  /** Acciones sueltas a la izquierda del menú (ej. el asistente IA). */
  tools?: ReactNode;
  actions?: LibroAction[];
  actionsLabel?: string;
  children?: ReactNode;
}

/** Referencia estable: un `[]` literal como default se re-crea en cada render y
 *  dispara el registro de sub-tabs en bucle (Maximum update depth). */
const SIN_GRUPOS: LibroGroup[] = [];

export default function LibroChrome({
  moduleId,
  eyebrow,
  title,
  icon: Icon,
  groups = SIN_GRUPOS,
  view = "",
  onView,
  alerts,
  status,
  context,
  tools,
  actions,
  actionsLabel = "Acciones",
  children,
}: LibroChromeProps) {
  const { registerSubTabs, registerOnChange, clearSubTabs } = useModuleTabs();
  const flat = useMemo(() => groups.flatMap((g) => g.views), [groups]);
  const activeGroup = useMemo(
    () => groups.find((g) => g.views.some((v) => v.key === view)) ?? groups[0],
    [groups, view],
  );

  // El handler del sidebar se registra UNA vez y lee la última versión por ref:
  // registrarlo en cada render lo mete en el estado del contexto → re-render →
  // registro → bucle infinito (React corta con "Maximum update depth").
  const onViewRef = useRef(onView);
  useEffect(() => {
    onViewRef.current = onView;
  });
  useEffect(() => {
    registerOnChange((id) => onViewRef.current?.(id));
    return () => clearSubTabs();
  }, [registerOnChange, clearSubTabs]);

  // El sidebar sigue listando las vistas planas: ahí el espacio vertical sobra
  // y el operario que ya sabe adónde va no debería pasar por el grupo.
  useEffect(() => {
    // Un módulo sin sub-vistas no registra nada: el sidebar se queda con las
    // del módulo anterior si le mandamos una lista vacía en cada render.
    if (flat.length === 0) return;
    registerSubTabs(
      flat.map((v) => ({ id: v.key, label: v.label, icon: v.icon })),
      view,
    );
  }, [flat, view, registerSubTabs]);

  // Alt+← / Alt+→ recorren TODAS las vistas en orden de flujo, cruzando grupos:
  // el atajo sigue el libro, no la caja donde lo dibujamos.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      if (isEditableTarget(e.target) || isModalOpen()) return;
      const i = flat.findIndex((v) => v.key === view);
      if (i === -1) return;
      e.preventDefault();
      const paso = e.key === "ArrowRight" ? 1 : -1;
      onView?.(flat[(i + paso + flat.length) % flat.length].key);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flat, view, onView]);

  const alertasDe = (g: LibroGroup) =>
    g.views.reduce((n, v) => n + (alerts?.[v.key] ?? 0), 0);

  return (
    <div className="space-y-4">
      <section
        data-module={moduleId}
        className="overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
      >
        {/* Identidad + estado + contexto + acciones — una sola fila. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white shadow-[var(--shadow-sm)]"
          >
            <Icon className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <Kicker className="block leading-none">{eyebrow}</Kicker>
            <PageTitle className="font-display text-[length:var(--ts-xl)] font-normal sm:text-[length:var(--ts-2xl)]">
              {title}
            </PageTitle>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {status}
            {context}
            {tools}
            {actions && actions.length > 0 && <ActionMenu label={actionsLabel} actions={actions} />}
          </div>
        </div>

        {/* Navegación: fase del libro → vista de esa fase.
            En pantallas angostas cada riel se desliza en vez de envolver: con
            wrap, los cuatro grupos se pisaban entre sí a 390px. */}
        {flat.length > 1 && (
        <div className="flex flex-col gap-2 border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:px-3">
          {groups.length > 1 && (
          <div
            role="tablist"
            aria-label="Fase del libro"
            className="flex max-w-full items-center gap-0.5 self-start overflow-x-auto rounded-xl bg-[var(--surface-sunken)] p-1 scrollbar-none"
            style={{ scrollbarWidth: "none" }}
          >
            {groups.map((g) => {
              const activo = g.id === activeGroup?.id;
              const alertas = alertasDe(g);
              return (
                <button
                  key={g.id}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  onClick={() => !activo && onView?.(g.views[0].key)}
                  className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-bold transition-colors sm:px-3 ${
                    activo
                      ? "bg-[var(--surface-raised)] text-[var(--accent-dark)] shadow-[var(--shadow-sm)] dark:text-[var(--accent)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {g.label}
                  {alertas > 0 && (
                    <span
                      title={`${alertas} pendiente${alertas === 1 ? "" : "s"} en ${g.label}`}
                      className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--data-warning-500)] px-1 font-mono text-[length:var(--ts-2xs)] tabular-nums text-white"
                    >
                      {alertas}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          )}

          {groups.length > 1 && (
            <span aria-hidden="true" className="hidden h-6 w-px bg-[var(--rule-base)] sm:block" />
          )}

          <div
            role="tablist"
            aria-label={activeGroup?.label}
            className="flex max-w-full items-center gap-1 overflow-x-auto scrollbar-none sm:flex-wrap"
            style={{ scrollbarWidth: "none" }}
          >
            {activeGroup?.views.map((v) => {
              const activo = v.key === view;
              const VIcon = v.icon;
              return (
                <button
                  key={v.key}
                  type="button"
                  role="tab"
                  aria-selected={activo}
                  title={v.hint}
                  onClick={() => onView?.(v.key)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors sm:px-3 ${
                    activo
                      ? "bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] dark:bg-primary/20"
                      : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <VIcon className="h-4 w-4 shrink-0" />
                  <span>{v.label}</span>
                  {(alerts?.[v.key] ?? 0) > 0 && (
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--data-warning-500)]" aria-hidden="true" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
        )}
      </section>

      {children}
    </div>
  );
}

/**
 * Menú de acciones del libro. Exportar/importar/informar son cuatro botones que
 * se usan una vez por mes: ocupaban dos filas de la cabecera para eso. Acá van
 * plegados, con la acción oficial destacada.
 */
function ActionMenu({ label, actions }: { label: string; actions: LibroAction[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const busy = actions.find((a) => a.busy);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="inline-flex h-10 items-center gap-2 rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-canvas)]"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        <span>{busy ? "Generando…" : label}</span>
        <ChevronDown className={`h-3.5 w-3.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="menu"
            className="absolute right-0 z-50 mt-2 w-[19rem] overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
          >
            {actions.map((a, i) => {
              const AIcon = a.icon;
              return (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  disabled={a.disabled || a.busy}
                  onClick={() => {
                    setOpen(false);
                    a.onSelect();
                  }}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-50 ${
                    i > 0 ? "border-t border-[var(--rule-soft)]" : ""
                  } ${a.tone === "dark" ? "bg-primary/5" : ""}`}
                >
                  {a.busy ? (
                    <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                  ) : (
                    <AIcon
                      className={`mt-0.5 h-4 w-4 shrink-0 ${
                        a.tone === "dark" ? "text-primary" : "text-[var(--text-tertiary)]"
                      }`}
                    />
                  )}
                  <span className="min-w-0">
                    <b className="block text-sm font-bold text-[var(--text-primary)]">{a.label}</b>
                    {a.hint && <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{a.hint}</span>}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
