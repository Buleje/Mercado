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

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Keyboard, SlidersHorizontal, X, type LucideIcon } from "@buleje/design-system/icons";
import { Kicker, PageTitle } from "@buleje/design-system";
import ActionMenu, { marcoDeFixed, type MenuAccion } from "./action-menu";
import { useModalAccesible } from "@/hooks/use-modal-accesible";
import { isEditableTarget, isModalOpen } from "@/lib/keyboard-guards";
import { useModuleTabs } from "@/contexts/module-tabs-context";
import {
  useAdminShortcuts,
  useRegisterShortcuts,
  type ShortcutSection,
} from "@/contexts/admin-shortcuts-context";

export interface LibroView {
  key: string;
  label: string;
  icon: LucideIcon;
  /** Qué se hace acá, en una línea. Va como tooltip, no ocupa pantalla. */
  hint: string;
  /**
   * Tecla de salto directo: se llega con `g` y esta letra. Explícita y no
   * derivada de la inicial, porque "Producción" y "Planta" empiezan igual y
   * adivinar la letra es peor que no tener atajo.
   */
  tecla?: string;
}

export interface LibroGroup {
  id: string;
  label: string;
  views: LibroView[];
}

/**
 * Una acción del menú de la cabina. Es el MISMO tipo que usan las barras de las
 * vistas (`admin/shared/action-menu`): el menú se extrajo de acá cuando
 * Producción y Ingresos necesitaron plegar sus propios botones, y dos tipos
 * gemelos habrían divergido a la primera opción nueva.
 */
export type LibroAction = MenuAccion;

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
  /** Atajos propios de la vista activa — se suman a la hoja que abre `?`. */
  atajosDeVista?: ShortcutSection[];
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
  atajosDeVista,
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

  /** La hoja de atajos es la del shell (`?`): acá sólo se le aportan secciones. */
  const { open: abrirAyuda } = useAdminShortcuts();
  /** Se apretó `g` y se espera la letra del destino. */
  const esperandoDestino = useRef(false);

  /**
   * Teclado del libro:
   * · `Alt+←/→` recorren TODAS las vistas en orden de flujo, cruzando grupos —
   *   el atajo sigue el libro, no la caja donde lo dibujamos;
   * · `g` + letra salta directo (con doce vistas, recorrer de a una son once
   *   pulsaciones para llegar a la última).
   *
   * `?` NO se maneja acá: la hoja de ayuda es la del shell del admin y este
   * componente le aporta sus secciones (si abriera una propia, `?` mostraría
   * dos modales superpuestos contando cada uno una mitad).
   *
   * Todo se apaga mientras se escribe o con un modal abierto, y ningún atajo
   * usa Ctrl/⌘ para no pisar los del navegador ni la paleta global del admin.
   */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isEditableTarget(e.target) || isModalOpen()) return;

      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        const i = flat.findIndex((v) => v.key === view);
        if (i === -1) return;
        e.preventDefault();
        const paso = e.key === "ArrowRight" ? 1 : -1;
        onView?.(flat[(i + paso + flat.length) % flat.length].key);
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      // Secuencia `g` → letra. La ventana se cierra con cualquier otra tecla:
      // un `g` suelto no debe quedar armado esperando para siempre.
      if (esperandoDestino.current) {
        esperandoDestino.current = false;
        const destino = flat.find((v) => v.tecla && v.tecla.toLowerCase() === e.key.toLowerCase());
        if (destino) {
          e.preventDefault();
          onView?.(destino.key);
        }
        return;
      }
      if (e.key === "g" || e.key === "G") {
        esperandoDestino.current = true;
        window.setTimeout(() => {
          esperandoDestino.current = false;
        }, 1500);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [flat, view, onView]);

  /** Lo que este libro aporta a la hoja del shell: navegación derivada de las
   *  vistas reales (si mañana se agrega una vista, aparece sola) + la vista activa. */
  const seccionesAtajos: ShortcutSection[] = useMemo(
    () => [
      {
        title: `Moverse en ${title}`,
        items: [
          { keys: ["Alt", "→"], description: "Vista siguiente" },
          { keys: ["Alt", "←"], description: "Vista anterior" },
          ...flat.filter((v) => v.tecla).map((v) => ({ keys: ["G", v.tecla!.toUpperCase()], description: v.label })),
        ],
      },
      ...(atajosDeVista ?? []),
    ],
    [flat, atajosDeVista, title],
  );
  useRegisterShortcuts(`libro:${moduleId}`, seccionesAtajos);

  const alertasDe = (g: LibroGroup) =>
    g.views.reduce((n, v) => n + (alerts?.[v.key] ?? 0), 0);

  return (
    <div className="space-y-4">
      <section
        data-module={moduleId}
        className="overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
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
            {/* `libro-kicker`/`libro-title`: tamaño propio del título de libro
                y kicker legible (globals.css, bloque «PANEL ADMIN —
                Tipografía»). El título usa `--ts-libro-title` para que no lo
                encoja el `max-height` de las laptops. */}
            <Kicker className="libro-kicker block leading-none">{eyebrow}</Kicker>
            <PageTitle className="libro-title font-display text-[length:var(--ts-xl)] font-normal sm:text-[length:var(--ts-2xl)]">
              {title}
            </PageTitle>
          </div>
          {/* La FASE del libro comparte fila con el título (misma banda que
              el resto del panel, Brandon 2026-09-07): las cuatro fases siempre
              a la vista; las vistas de la activa, en el riel de abajo. Siguen
              siendo dos rieles — lo que cambió es que el primero ya no gasta
              una fila propia. */}
          {flat.length > 1 && groups.length > 1 && (
          <div
            role="tablist"
            aria-label="Fase del libro"
            className="flex max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-[var(--surface-sunken)] p-1 scrollbar-none sm:ml-2"
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
          {/* Estado · Herramientas · Acciones, en la fila del título. Las
              herramientas (período, buscar guía, avisos, modo patio, atajos…)
              van plegadas en UN botón que abre un panel (Brandon 2026-09-07:
              «un botón que al presionar aparece un modal con esos botones»):
              sueltas ocupaban una fila entera, y la fila de abajo es de las
              pestañas. El score y el menú de acciones quedan a la vista: son
              un vistazo y un clic. */}
          <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {status}
            {(context || tools) ? (
              <HerramientasDelLibro>
                {context}
                {tools}
                {flat.length > 1 && <BotonAtajos onClick={abrirAyuda} enPanel />}
              </HerramientasDelLibro>
            ) : (
              flat.length > 1 && <BotonAtajos onClick={abrirAyuda} />
            )}
            {actions && actions.length > 0 && (
              <ActionMenu label={actionsLabel} title={actionsLabel} actions={actions} soloIcono />
            )}
          </div>
        </div>

        {/* Segundo riel: SÓLO las vistas de la fase activa. Esta fila es de la
            navegación (Brandon 2026-09-07): las herramientas del libro no
            entran acá — viven arriba, plegadas en «Herramientas». En angosto
            se desliza en vez de envolver: con wrap las vistas se pisaban a
            390px. */}
        {flat.length > 1 && (
        <div className="border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2 py-2 sm:px-3">

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
                  title={v.tecla ? `${v.hint}  ·  atajo: g ${v.tecla}` : v.hint}
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

/** El botón de la hoja de atajos. Dentro del panel se muestra siempre; suelto,
 *  sólo en pantallas grandes (en móvil el atajo de teclado no existe). */
function BotonAtajos({ onClick, enPanel = false }: { onClick: () => void; enPanel?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Atajos del teclado (?)"
      aria-label="Ver los atajos del teclado"
      className={`${enPanel ? "inline-flex" : "hidden lg:inline-flex"} h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]`}
    >
      <Keyboard className="h-4 w-4" />
    </button>
  );
}

/**
 * «Herramientas» — un botón que abre el panel con los controles del libro.
 *
 * Se dibuja en un PORTAL con posición medida, igual que `ActionMenu`: la
 * cabecera es una `<section class="overflow-hidden">` y un panel `absolute`
 * adentro se recorta. El velo de atrás cierra al tocar afuera; Escape también.
 * Los controles que van adentro pueden abrir lo suyo (el selector de período,
 * la campana de avisos): el panel no tiene overflow que los recorte.
 */
function HerramientasDelLibro({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  /* Mismo patrón que `ActionMenu` (ver su comentario): con la cabina abierta
     DENTRO de un `AdminModal`, portalear siempre a `body` deja el panel bajo
     el `pointer-events: none` que Radix le pone al body — se ve, no se toca. */
  const portalARef = useRef<HTMLElement | null>(null);
  // Escape ya lo maneja el listener de la ventana de abajo; el hook agrega
  // la trampa de Tab (sin ella se escapa al resto de la página) y devuelve
  // el foco al botón que lo abrió.
  const cerrarHerramientas = useCallback(() => setOpen(false), []);
  useModalAccesible(panelRef, { onCerrar: cerrarHerramientas, cerrarConEscape: false, activo: open });

  const ubicar = useCallback(() => {
    const ancla = anclaRef.current;
    const b = ancla?.getBoundingClientRect();
    if (!b || !ancla) return;
    const dialogo = ancla.closest<HTMLElement>('[role="dialog"]');
    portalARef.current = dialogo;
    const marco = marcoDeFixed(dialogo);
    const base = marco ?? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
    const bTop = b.top - base.top;
    const bBottom = b.bottom - base.top;
    /* Dentro de un diálogo con transform, este panel queda recortado a SU
       caja (transform + overflow-hidden juntos, como `Dialog.Content` de
       Radix): si no entra abajo, se abre arriba en vez de cortarse contra el
       borde inferior. Fuera de un diálogo (el caso de siempre) `base` es el
       viewport entero y esto nunca dispara. */
    const entraAbajo = bBottom + 8 + 200 <= base.height;
    setPos({
      top: entraAbajo ? bBottom + 8 : Math.max(12, bTop - 8 - 200),
      right: Math.max(12, base.width - (b.right - base.left)),
    });
  }, []);

  useLayoutEffect(() => {
    if (open) ubicar();
  }, [open, ubicar]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [open, ubicar]);

  const panel = open && pos && (
    <>
      <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Herramientas del libro"
        tabIndex={-1}
        /* Sin overflow: los controles de adentro (la campana de avisos, el
           período) abren sus propios desplegables `absolute`, y un overflow
           acá los recortaría al tamaño del panel. */
        style={{ top: pos.top, right: pos.right }}
        className="fixed z-[61] w-[min(92vw,44rem)] rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3 shadow-[var(--shadow-lg)] outline-none"
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <Kicker className="block leading-none">Herramientas del libro</Kicker>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar herramientas"
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-tertiary)] transition-colors hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">{children}</div>
      </div>
    </>
  );

  return (
    <>
      <button
        ref={anclaRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Herramientas del libro: período, búsqueda, avisos, modo patio y atajos"
        aria-label="Herramientas del libro"
        /* Sólo ícono en todos los anchos (Brandon, 2026-09-19: «que los botones
           no ocupen mucho espacio»). Con el texto puesto, título + fases +
           botones no entraban en una fila y los botones caían solos a una
           segunda. Borde de 1 px: el neutro del panel es uno solo (ADR-068). */
        className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border transition-colors ${
          open
            ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
        }`}
      >
        <SlidersHorizontal className="h-4 w-4" aria-hidden />
        <span className="sr-only">Herramientas</span>
      </button>
      {typeof document !== "undefined" && panel ? createPortal(panel, portalARef.current ?? document.body) : null}
    </>
  );
}
