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

import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { Keyboard, type LucideIcon } from "@buleje/design-system/icons";
import { Kicker, PageTitle } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "./action-menu";
import SelectorDeVista from "./selector-de-vista";
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
            {/* Los atajos vivían en DOS tiras de texto al pie —una del libro y
                otra de la tabla— que juntas se comían dos renglones de cada
                vista para decir algo que se lee una vez. Acá quedan en un solo
                botón que abre la hoja completa (que ya incluye los de la vista
                activa vía `atajosDeVista`). */}
            {flat.length > 1 && (
              <button
                type="button"
                onClick={abrirAyuda}
                title="Atajos del teclado (?)"
                aria-label="Ver los atajos del teclado"
                className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)] lg:inline-flex"
              >
                <Keyboard className="h-4 w-4" />
              </button>
            )}
            {actions && actions.length > 0 && <ActionMenu label={actionsLabel} actions={actions} />}
          </div>
        </div>

        {/* Navegación: un solo selector con todas las vistas, agrupadas por
            fase del libro.

            Eran dos rieles —las fases, y al lado las vistas de la activa—. Con
            nueve destinos andaba; el CTP tiene veintitrés y ahí el segundo riel
            se comía una fila entera y en pantallas angostas había que
            deslizarlo a ciegas para descubrir qué contenía. Ahora el botón dice
            dónde estás y al abrirlo se ven los veintitrés juntos, no los seis
            de la fase en la que uno cayó. Los atajos `g` + letra siguen yendo
            directo sin abrir nada. */}
        {flat.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)] px-2 py-2 sm:px-3">
            <SelectorDeVista groups={groups} view={view} onView={onView} alerts={alerts} />
          </div>
        )}
      </section>

      {children}

    </div>
  );
}
