"use client";

import { useState, useRef, useEffect, useLayoutEffect, useId, useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { isEditableTarget, isModalOpen } from "@/lib/keyboard-guards";
import { ChevronLeft, ChevronRight, GripVertical } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { insertarFaltantes, leerOrdenGuardado } from "./orden-pestanas";
import type { LucideIcon } from "lucide-react";
import { useModuleTabs } from "@/contexts/module-tabs-context";
import { ModuleDepthProvider, useModuleDepth } from "@/components/admin/shared/module-depth";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { BANDA_MODULO, FILA_TITULO_MODULO, TituloModulo } from "./titulo-modulo";
import { rotuloDelMenu } from "./rotulo-del-menu";

/**
 * Pestañas en dos estilos: `linea` (barra sin título, la de siempre) y `fase`,
 * la caja hundida de la banda del Libro TH (clases de libro-chrome.tsx), que va
 * al lado del título si entra y en su propia fila debajo si no.
 */
type EstiloPestana = "linea" | "fase";
const PESTANA: Record<EstiloPestana, { base: string; activa: string; inactiva: string }> = {
  linea: {
    // Mobile: tap target accesible (min ~44px alto via py-2.5 + texto sm).
    base: "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-3 py-2.5 text-sm transition-all duration-[var(--dur-base)] sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm",
    activa: "border-primary bg-primary/5 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]",
    inactiva: "border-transparent font-normal text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]",
  },
  fase: {
    base: "relative inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-bold transition-colors duration-[var(--dur-base)]",
    activa: "bg-[var(--surface-raised)] text-[var(--accent-dark)] shadow-[var(--shadow-sm)] dark:text-[var(--accent)]",
    inactiva: "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]",
  },
};

/**
 * Bloque de texto del título cuando lleva rótulo Y ⓘ: grilla en vez del flex
 * que envuelve de TituloModulo. Un flex-wrap mide de ancho natural rótulo +
 * título + ⓘ EN UNA FILA aunque se dibujen en dos: la banda le reservaba
 * ~130 px vacíos (10-10: «Dropship» de Compras empezaba 145 px después del
 * título) y esos px eran los que les faltaban a las pestañas para ir al lado.
 * En la grilla el rótulo cruza las dos columnas y el ⓘ va pegado al título.
 */
const TEXTO_TITULO_EN_GRILLA = "grid grid-cols-[auto_1fr] justify-items-start [&>:first-child]:col-span-2";

/**
 * ¿Entran título · pestañas · acciones en UNA fila de la banda?
 *
 * Suma anchos NATURALES —el bloque del título, cada pestaña (`shrink-0`,
 * `whitespace-nowrap`), el chip del `rightSlot` y las acciones (`shrink-0`)—
 * y los compara con el ancho útil de la fila. Ninguno de esos anchos cambia
 * con la respuesta: bajar las pestañas sólo les cambia el `order` y el
 * `flex-basis` a ellas, no a sus botones. Por eso no oscila, a diferencia de
 * medir el ALTO de la banda o si el riel desborda (eso sí depende de dónde
 * quedaron). Margen del riel: los 4 px de `sm:ml-1`, fijo, para que tampoco
 * dependa de la respuesta.
 */
function entranAlLado(fila: HTMLElement, riel: HTMLElement, titulo: HTMLElement | null, acciones: HTMLElement | null) {
  const px = (valor: string) => Number.parseFloat(valor) || 0;
  const f = getComputedStyle(fila);
  const r = getComputedStyle(riel);
  const libre = fila.clientWidth - px(f.paddingLeft) - px(f.paddingRight);
  const separacion = px(f.columnGap);
  const hijos = Array.from(riel.children);
  const anchoRiel =
    hijos.reduce((suma, hijo) => suma + hijo.getBoundingClientRect().width, 0) +
    px(r.columnGap) * Math.max(0, hijos.length - 1) +
    px(r.paddingLeft) +
    px(r.paddingRight) +
    4;
  const anchoTitulo = titulo ? titulo.getBoundingClientRect().width : 0;
  const anchoAcciones = acciones ? separacion + acciones.getBoundingClientRect().width : 0;
  return anchoTitulo + separacion + anchoRiel + anchoAcciones <= libre + 0.5;
}

/** La pestaña del panel (`?tab=`), para el rótulo. Cambia de pestaña = otro módulo montado. */
const suscribirUrl = (avisar: () => void) => {
  window.addEventListener("popstate", avisar);
  return () => window.removeEventListener("popstate", avisar);
};
const leerTabDeUrl = () => new URLSearchParams(window.location.search).get("tab");
const sinTabEnServidor = () => null;

export interface AdminTab {
  id: string;
  label: string;
  shortLabel?: string;
  icon?: LucideIcon;
  badge?: number | string;
  disabled?: boolean;
  /** Tooltip nativo al hover. Cae a `label` si no se provee. */
  title?: string;
}

interface AdminTabBarProps {
  tabs: AdminTab[];
  activeTab: string;
  onTabChange: (id: string) => void;
  moduleId: string;
  draggable?: boolean;
  className?: string;
  vertical?: boolean;
  /** Las tabs envuelven a 2+ filas cuando superan el ancho, en vez de scroll
      horizontal con chevrons. Útil para módulos con muchas sub-tabs (ej. Finanzas
      con 14) donde el scroll esconde opciones. Default `true` (Brandon 2026-06-18:
      coherencia admin — ninguna pestaña queda oculta tras scroll). Pasar
      `wrap={false}` para forzar scroll horizontal en contextos angostos. */
  wrap?: boolean;
  children?: ReactNode;
  onTabHover?: (id: string) => void;
  /** Contenido alineado a la derecha del tab bar (ej. status chip). */
  rightSlot?: ReactNode;
  /**
   * Identidad del módulo dibujada en la MISMA fila que las pestañas, a la
   * izquierda, compartiendo con ellas la regla inferior.
   *
   * Por qué existe: un hub con dos niveles de pestañas apilaba título, regla,
   * pestañas, subtítulo, regla y pestañas otra vez. Medido en Análisis a
   * 1363x677 (una laptop con el chrome del navegador puesto): 232px hasta el
   * primer dato, el 34% de la pantalla, y el subtítulo del segundo nivel
   * repetía lo que ya decían las pestañas de abajo.
   *
   * Con `heading`, el título y las pestañas de primer nivel ocupan una sola
   * banda. Reemplaza al <AdminModuleHeader> de arriba — no se usan los dos.
   *
   * Si la barra está ANIDADA (cuelga del panel de otra barra, module-depth
   * > 0) el título no se dibuja: la pestaña del hub ya lo dice. Sobreviven
   * `actions`, dentro del riel, a la derecha de las pestañas.
   */
  heading?: {
    title: string;
    /**
     * Rótulo chico arriba del título. Sin él se arma con la sección y la
     * categoría del menú lateral (rotulo-del-menu.ts); `""` lo apaga.
     */
    eyebrow?: string;
    /** Va al ⓘ junto al título, no debajo. */
    description?: ReactNode;
    icon?: LucideIcon;
    /** Nivel semántico. `h1` salvo que el módulo cuelgue de otro título. */
    as?: "h1" | "h2";
    /**
     * Acciones del módulo (actualizar, exportar, «Nueva receta»…): lo que
     * antes iba como `children` del <AdminModuleHeader>. Comparten la banda:
     * si todo entra en una fila van al final (título · pestañas · acciones);
     * si no, se quedan a la derecha del título y las pestañas bajan a su
     * fila. Su ancho cuenta para decidirlo. Distinto de `rightSlot`, que vive
     * DENTRO del tablist (un chip de estado pegado a las pestañas).
     */
    actions?: ReactNode;
  };
}

export default function AdminTabBar({
  tabs,
  activeTab,
  onTabChange,
  moduleId,
  draggable = true,
  className,
  vertical = false,
  wrap = true,
  children,
  onTabHover,
  rightSlot,
  heading,
}: AdminTabBarProps) {
  const { registerSubTabs, registerOnChange, clearSubTabs } = useModuleTabs();

  /**
   * Ids para atar cada pestaña con su panel (`aria-controls`/`aria-labelledby`).
   * `useId` y no el `moduleId`: dos barras del mismo módulo en pantalla —pasa
   * con los hubs— repetirían ids y el lector de pantalla ataría mal los pares.
   */
  const barraId = useId();

  // Sólo el módulo dueño de la página dibuja su identidad en la banda.
  const profundidad = useModuleDepth();
  const bandaConTitulo = Boolean(heading) && profundidad === 0;
  const estilo: EstiloPestana = bandaConTitulo ? "fase" : "linea";
  /**
   * ¿Las pestañas van al lado del título o en su propia fila debajo?
   *
   * Brandon 10-10: «en Ventas las secciones están debajo y quiero que estén al
   * lado del título como en todas mis demás páginas». Antes decidían la
   * CANTIDAD (≤5 pestañas, ≤3 con acciones) y una container query fija de
   * 60rem: a 1280 px con el sidebar la banda mide 964 px y Ventas & Caja
   * (título ~210 px + pestañas 690 px) bajaba aunque entraba.
   *
   * Ahora se suman los anchos naturales (`entranAlLado`) y se compara con la
   * fila: al lado si entra, abajo si no. Nunca dos filas de pestañas al lado
   * del título (el riel al lado no envuelve), que es lo que dejaba al título
   * como un pie de la segunda fila (Compras, 8 pestañas). `null` = sin medir
   * todavía (servidor, primer render, jsdom): rige la container query de antes.
   */
  const [pestanasAlLado, setPestanasAlLado] = useState<boolean | null>(null);
  const pestanasAbajo = estilo === "fase" && pestanasAlLado === false;
  const filaRef = useRef<HTMLDivElement>(null);
  const accionesRef = useRef<HTMLDivElement>(null);
  const tabDeLaUrl = useSyncExternalStore(suscribirUrl, leerTabDeUrl, sinTabEnServidor);
  const rotulo = heading ? (heading.eyebrow ?? rotuloDelMenu(tabDeLaUrl, heading.title)) : undefined;

  /**
   * Cuando las pestañas bajan a su propia fila (`order-3 basis-full`), las
   * acciones se quedan junto al título vía `order`: la fila de arriba queda
   * «título … acciones» y la de abajo, las pestañas.
   */
  const acciones = bandaConTitulo && heading?.actions ? (
    <div ref={accionesRef} className="order-2 ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-2">
      {heading.actions}
    </div>
  ) : null;
  // Anidada: las acciones van dentro del riel, junto al `rightSlot`.
  const accionesEnRiel = !bandaConTitulo && heading?.actions ? heading.actions : null;
  const idDeTab = (id: string) => `${barraId}-tab-${id}`;
  const idDelPanel = `${barraId}-panel`;

  /**
   * Flechas dentro de la barra, como manda el patrón de tabs de ARIA.
   *
   * Es distinto del Alt+←/→ global de arriba: aquel funciona desde cualquier
   * lado de la pantalla, éste sólo cuando el foco YA está en las pestañas, que
   * es lo que espera quien navega con teclado. Home/End van a los extremos.
   *
   * Activación automática (mover el foco cambia de pestaña): es lo habitual en
   * barras donde el panel es barato de renderizar, y evita el doble paso de
   * "flecha, flecha, Enter".
   */
  const teclasDeBarra = (e: React.KeyboardEvent) => {
    const anterior = vertical ? "ArrowUp" : "ArrowLeft";
    const siguiente = vertical ? "ArrowDown" : "ArrowRight";
    if (!["Home", "End", anterior, siguiente].includes(e.key)) return;
    const usables = orderedTabs.filter((t) => !t.disabled);
    if (usables.length < 2) return;
    const i = usables.findIndex((t) => t.id === activeTab);
    if (i === -1) return;
    e.preventDefault();
    const destino =
      e.key === "Home"
        ? usables[0]
        : e.key === "End"
          ? usables[usables.length - 1]
          : usables[(i + (e.key === siguiente ? 1 : -1) + usables.length) % usables.length];
    onTabChange(destino.id);
    // El foco sigue a la selección: si se quedara donde estaba, la próxima
    // flecha partiría desde otro lugar del que se ve resaltado.
    requestAnimationFrame(() => document.getElementById(idDeTab(destino.id))?.focus());
  };

  /**
   * Alt+← / Alt+→ recorren las sub-tabs del módulo activo.
   * Alt+1..9 ya está tomado para saltar entre MÓDULOS (useKeyboardShortcuts),
   * así que acá van las flechas: mismo gesto mental que cambiar de pestaña.
   * Se saltean las deshabilitadas y da la vuelta al llegar al extremo.
   */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!e.altKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
      // Mismo guard que el resto de atajos: nada de robar teclas mientras se
      // escribe en un campo o hay un modal abierto.
      if (isEditableTarget(e.target) || isModalOpen()) return;
      const usables = tabs.filter((t) => !t.disabled);
      if (usables.length < 2) return;
      const i = usables.findIndex((t) => t.id === activeTab);
      if (i === -1) return;
      e.preventDefault();
      const paso = e.key === "ArrowRight" ? 1 : -1;
      const siguiente = usables[(i + paso + usables.length) % usables.length];
      onTabChange(siguiente.id);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [tabs, activeTab, onTabChange]);

  // Register tabs in sidebar context so sidebar can render them
  useEffect(() => {
    registerSubTabs(
      tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
      activeTab,
    );
    registerOnChange(onTabChange);
    return () => clearSubTabs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabs.length, registerSubTabs, registerOnChange, clearSubTabs]);

  // Keep sidebar in sync with active tab changes from module
  useEffect(() => {
    registerSubTabs(
      tabs.map((t) => ({ id: t.id, label: t.label, icon: t.icon })),
      activeTab,
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const tabsRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  /* Con título en la banda, la flecha derecha va a la altura del riel y no
     de toda la banda: si no, su degradé tapaba las acciones y el borde del
     título en el celular (08-10, Inicio a 400 px). */
  const [riel, setRiel] = useState<{ top: number; alto: number; derecha: number } | null>(null);
  const [draggedTab, setDraggedTab] = useState<string | null>(null);
  const [dragOverTab, setDragOverTab] = useState<string | null>(null);

  /**
   * El orden COMPLETO: el guardado tal cual —con las pestañas que todavía no
   * llegaron (una que el usuario movió y aparece tarde conserva su lugar)— más
   * las de ahora que no estaban guardadas.
   */
  const [tabOrder, setTabOrder] = useState<string[]>(() => {
    const deFabrica = tabs.map((tab) => tab.id);
    if (typeof window === "undefined") return deFabrica;
    let guardado: string[] | null = null;
    try {
      guardado = leerOrdenGuardado(localStorage.getItem(`tab-order-${moduleId}`));
    } catch {}
    return guardado ? insertarFaltantes(guardado, deFabrica) : deFabrica;
  });

  /**
   * El orden de verdad: el guardado (o el de fábrica) MÁS las pestañas que
   * aparecieron después de montar. `tabOrder` se arma una sola vez, y una
   * pestaña que llega tarde —gateada por algo que se lee async: el rol, las
   * especializaciones, el plan— no estaba en él y no se dibujaba NUNCA (08-10:
   * «Forestal» del Inicio desaparecía al esperar el rol). La nueva entra detrás
   * de la que la precede en `tabs`, no al final.
   */
  const ordenIds = useMemo(
    () =>
      insertarFaltantes(
        tabOrder.filter((id) => tabs.some((tab) => tab.id === id)),
        tabs.map((tab) => tab.id),
      ),
    [tabOrder, tabs],
  );

  const orderedTabs = ordenIds
    .map((id) => tabs.find((tab) => tab.id === id))
    .filter(Boolean) as AdminTab[];

  const checkScroll = useCallback(() => {
    const element = tabsRef.current;
    if (!element) return;
    setCanScrollLeft(element.scrollLeft > 2);
    setCanScrollRight(element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
    const banda = element.offsetParent as HTMLElement | null;
    const top = element.offsetTop;
    const alto = element.offsetHeight;
    const derecha = banda ? Math.max(0, banda.clientWidth - element.offsetLeft - element.offsetWidth) : 0;
    setRiel((prev) =>
      prev && prev.top === top && prev.alto === alto && prev.derecha === derecha ? prev : { top, alto, derecha },
    );
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    // La banda cambia de alto sin que cambie la ventana (cargan las acciones,
    // se pliega el sidebar): la flecha sigue al riel.
    const banda = tabsRef.current?.parentElement;
    const ro = banda && typeof ResizeObserver !== "undefined" ? new ResizeObserver(checkScroll) : null;
    if (banda) ro?.observe(banda);
    return () => {
      window.removeEventListener("resize", checkScroll);
      ro?.disconnect();
    };
  }, [checkScroll]);

  const scrollTabs = (direction: "left" | "right") => {
    tabsRef.current?.scrollBy({
      left: direction === "left" ? -200 : 200,
      behavior: "smooth",
    });
    setTimeout(checkScroll, 350);
  };

  const handleDrop = (targetId: string) => {
    if (!draggedTab || draggedTab === targetId) return;

    const newOrder = [...ordenIds];
    const fromIndex = newOrder.indexOf(draggedTab);
    const toIndex = newOrder.indexOf(targetId);

    newOrder.splice(fromIndex, 1);
    newOrder.splice(toIndex, 0, draggedTab);
    /* Las que hoy no se ven (llegan tarde o el rol las esconde) vuelven a su
       lugar relativo: reordenar sin ellas no puede borrarles el sitio. */
    const completo = insertarFaltantes(newOrder, tabOrder);

    setTabOrder(completo);

    try {
      localStorage.setItem(`tab-order-${moduleId}`, JSON.stringify(completo));
    } catch {}

    setDraggedTab(null);
    setDragOverTab(null);
  };

  const resetOrder = () => {
    const defaultOrder = tabs.map((tab) => tab.id);
    setTabOrder(defaultOrder);
    try {
      localStorage.removeItem(`tab-order-${moduleId}`);
    } catch {}
  };

  const isReordered = JSON.stringify(ordenIds) !== JSON.stringify(tabs.map((tab) => tab.id));

  /**
   * Mide si las pestañas entran al lado del título (ver `pestanasAlLado`).
   * `useLayoutEffect`: corre antes de pintar, así el primer cuadro ya sale
   * con las pestañas en su lugar. Observa la fila (cambia el ancho de la
   * ventana o se pliega el sidebar), el título (carga la fuente), cada
   * pestaña (aparece un contador) y las acciones (llegan datos).
   */
  const clavePestanas = `${ordenIds.join("|")}|${isReordered}|${Boolean(rightSlot)}|${Boolean(heading?.actions)}`;
  useLayoutEffect(() => {
    const fila = filaRef.current;
    const rielActual = tabsRef.current;
    if (estilo !== "fase" || !fila || !rielActual || typeof ResizeObserver === "undefined") return;
    const titulo = fila.firstElementChild instanceof HTMLElement ? fila.firstElementChild : null;
    const accionesActuales = accionesRef.current;
    const medir = () => setPestanasAlLado(entranAlLado(fila, rielActual, titulo, accionesActuales));
    medir();
    const ro = new ResizeObserver(medir);
    for (const el of [fila, titulo, accionesActuales, ...Array.from(rielActual.children)]) {
      if (el) ro.observe(el);
    }
    return () => ro.disconnect();
  }, [estilo, clavePestanas]);

  if (vertical) {
    return (
      <div data-admin-tabbar="" className={cn("flex flex-col gap-3 lg:flex-row lg:items-stretch lg:gap-0", className)}>
        {/* Sub-tab nav: flush against main sidebar with matching style */}
        <nav className={cn(
          "w-full shrink-0",
          // Desktop: fixed strip matching sidebar visual style
          "lg:w-40 lg:self-stretch lg:-ml-3 sm:lg:-ml-6 lg:pl-3 sm:lg:pl-6 lg:pr-0",
          "lg:border-r lg:border-gray-200 lg:dark:border-[var(--rule-base)]",
          "lg:bg-white lg:dark:bg-[var(--surface-raised)]",
          "lg:pt-1 lg:pb-4",
        )}>
          {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus --
              el tablist NO debe ser focusable: el patrón de ARIA pone el foco
              en las pestañas con tabIndex roving y el tablist sólo escucha las
              flechas por burbujeo. Hacerlo focusable agregaría una parada de
              Tab que no lleva a ningún lado. */}
          <div
            role="tablist"
            aria-orientation="vertical"
            onKeyDown={teclasDeBarra}
            className="grid grid-cols-2 gap-0.5 sm:grid-cols-3 lg:grid-cols-1 lg:pt-0"
          >
            {orderedTabs.map((tab) => {
              const Icon = tab.icon;

              return (
                <button
                  key={tab.id}
                  onClick={() => !tab.disabled && onTabChange(tab.id)}
                  /* Patrón de tabs de ARIA: la pestaña activa sólo se
                     distinguía por color y borde, y un lector leía botones
                     iguales sin decir en cuál estás. `aria-selected` es la
                     señal correcta acá (no `aria-current`, que es para
                     navegación) y el `tabIndex` roving hace que Tab entre y
                     salga de la barra en un paso, no pestaña por pestaña. */
                  role="tab"
                  id={idDeTab(tab.id)}
                  aria-selected={activeTab === tab.id}
                  aria-controls={children ? idDelPanel : undefined}
                  tabIndex={activeTab === tab.id ? 0 : -1}
                  onMouseEnter={() => onTabHover?.(tab.id)}
                  title={tab.title ?? tab.label}
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-2 text-left text-[length:var(--ts-sm)] transition-all duration-[var(--dur-fast)]",
                    "lg:rounded-none lg:rounded-r-lg",
                    activeTab === tab.id
                      ? "bg-primary/10 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)] border-l-[3px] border-l-primary dark:bg-primary/15"
                      : "text-[var(--text-tertiary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)] dark:hover:bg-white/[0.06] border-l-[3px] border-l-transparent",
                    "rounded-xl lg:rounded-none lg:rounded-r-lg",
                    tab.disabled && "cursor-not-allowed opacity-40",
                  )}
                >
                  {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
                  <span className="truncate">{tab.label}</span>
                  {tab.badge != null && (
                    <span className="ml-auto flex h-4 min-w-[16px] shrink-0 items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 text-[length:var(--ts-2xs)] font-bold text-white">
                      {tab.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {isReordered && (
            <button
              onClick={resetOrder}
              className="mt-1.5 w-full border-t border-[var(--rule-soft)] px-3 pt-1.5 text-left text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] transition-colors hover:text-primary "
            >
              Restablecer orden
            </button>
          )}
        </nav>

        {/* Content: fills 100% remaining space */}
        {/* `tabIndex={0}`: el panel tiene que poder recibir foco para que Tab
            desde la pestaña activa lleve a su contenido y no al siguiente
            control de la página. */}
        <div
          id={idDelPanel}
          role={children ? "tabpanel" : undefined}
          aria-labelledby={children ? idDeTab(activeTab) : undefined}
          tabIndex={children ? 0 : undefined}
          className="min-w-0 flex-1 outline-none lg:pl-4"
        >
          {/* Todo lo que entre acá está DEBAJO de un título que ya se dibujó:
              su propio AdminModuleHeader se compacta solo. Ver module-depth.tsx. */}
          <ModuleDepthProvider>{children}</ModuleDepthProvider>
        </div>
      </div>
    );
  }

  const rielDePestanas = (
    // eslint-disable-next-line jsx-a11y/interactive-supports-focus -- ver el comentario de la rama vertical: el foco va en las pestañas, no acá.
      <div
        ref={tabsRef}
        onScroll={checkScroll}
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={teclasDeBarra}
        className={cn(
          "flex",
          // Con `heading` las pestañas van DENTRO de la banda, como en el
          // Libro TH (referencia de Brandon 08-10): en la caja hundida de las
          // fases, al lado del título si entran (`pestanasAlLado`) y en su
          // fila de abajo si no. Sin `heading`, la línea de siempre.
          estilo === "fase"
            ? cn(
                "order-1 min-w-0 max-w-full flex-none items-center gap-0.5 rounded-xl bg-[var(--surface-sunken)] p-1",
                pestanasAlLado === null
                  ? "sm:ml-1 @max-[60rem]/banda:order-3 @max-[60rem]/banda:basis-full"
                  : pestanasAbajo
                    ? "order-3 basis-full"
                    : "sm:ml-1",
              )
            : "-mx-1 gap-0.5 border-b border-[var(--rule-base)] px-1 sm:gap-1",
          // Angosto: una sola fila que se desliza (recupera ~90px verticales
          // que las 3 filas del wrap le robaban al contenido). Desde 48rem de
          // CONTENEDOR —no de viewport, que ignora el ancho del sidebar—
          // vuelve el wrap de siempre.
          // Al lado del título el riel NUNCA envuelve por dentro: si
          // envolviera, el título (alineado al fondo de la banda) quedaría
          // junto a la segunda fila de pestañas. Envuelve sólo en su fila.
          wrap && (estilo === "linea" || pestanasAbajo)
            ? "overflow-x-auto scroll-smooth scrollbar-none @min-[48rem]:flex-wrap @min-[48rem]:gap-y-1 @min-[48rem]:overflow-x-visible"
            : "overflow-x-auto scroll-smooth scrollbar-none",
        )}
        /* `contain`: el desliz de la caja hundida no se filtra al ancho de la
           página a 400 px (mismo arreglo que la fila de fases del libro). */
        style={estilo === "fase" ? { scrollbarWidth: "none", contain: "layout paint" } : { scrollbarWidth: "none" }}
      >
        {orderedTabs.map((tab) => {
          const Icon = tab.icon;

          return (
            <button
              key={tab.id}
              draggable={draggable}
              onDragStart={() => setDraggedTab(tab.id)}
              onDragOver={(event) => {
                event.preventDefault();
                setDragOverTab(tab.id);
              }}
              onDragLeave={() => setDragOverTab(null)}
              onDrop={() => handleDrop(tab.id)}
              onDragEnd={() => {
                setDraggedTab(null);
                setDragOverTab(null);
              }}
              onClick={() => !tab.disabled && onTabChange(tab.id)}
              role="tab"
              id={idDeTab(tab.id)}
              aria-selected={activeTab === tab.id}
              aria-controls={children ? idDelPanel : undefined}
              tabIndex={activeTab === tab.id ? 0 : -1}
              onMouseEnter={() => onTabHover?.(tab.id)}
              disabled={tab.disabled}
              title={tab.title ?? tab.label}
              className={cn(
                PESTANA[estilo].base,
                // El `grow` de antes (tabs estiradas para justificar las filas
                // en móvil) ya no aplica: en angosto la barra es una sola fila
                // deslizable, no un wrap de varias filas. Se conserva sólo el
                // padding compacto.
                wrap && estilo === "linea" && "max-sm:px-2",
                draggable && "cursor-grab active:cursor-grabbing",
                activeTab === tab.id ? PESTANA[estilo].activa : PESTANA[estilo].inactiva,
                tab.disabled && "cursor-not-allowed opacity-40",
                draggedTab === tab.id && "scale-95 opacity-40",
                dragOverTab === tab.id && draggedTab !== tab.id && "rounded-t-lg ring-2 ring-primary ring-offset-1",
              )}
            >
              {/* El handle de reorden por drag solo aplica en desktop (en touch
                  el drag de sub-tabs no es un gesto usable y el ⋮⋮ es ruido). */}
              {draggable && estilo === "linea" && <GripVertical className="hidden lg:inline-block h-3 w-3 shrink-0 opacity-30" />}
              {Icon && <Icon className="h-4 w-4 shrink-0 sm:h-3.5 sm:w-3.5" />}
              <span>{tab.shortLabel || tab.label}</span>
              {tab.badge != null && (
                <span className="flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[var(--data-error-500)] px-1 text-[length:var(--ts-2xs)] font-bold text-white">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}

        {isReordered && (
          <button
            onClick={resetOrder}
            className="ml-1 shrink-0 whitespace-nowrap px-2 py-1.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)] transition-colors hover:text-primary"
            title="Restablecer orden de tabs"
          >
            Restablecer
          </button>
        )}

        {/* Slot derecho — status chip u otras acciones contextuales.
            ml-auto empuja todo a la derecha, pr-2 margen del borde. */}
        {(rightSlot || accionesEnRiel) && (
          <div className="ml-auto flex shrink-0 items-center gap-2 pr-2">
            {accionesEnRiel}
            {rightSlot}
          </div>
        )}
      </div>
  );

  return (
    <>
    {/* `data-admin-tabbar`: lo lee el AdminModuleHeader que va JUSTO ARRIBA
        (`:has(+ …)`) para soltar su borde inferior. Sin esto quedaban dos
        reglas horizontales a 40px una de otra. */}
    <div
      data-admin-tabbar=""
      className={cn(
        // Con `heading`, la identidad del módulo y las pestañas comparten la
        // MISMA tarjeta que la banda del Libro TH (titulo-modulo.tsx). Los
        // chevrons de scroll son `absolute`: el tablist puede ir en cualquier
        // fila mientras `relative` siga en esta caja.
        bandaConTitulo ? cn(BANDA_MODULO, "relative") : "@container relative",
        className,
      )}
    >
      {bandaConTitulo && heading && (
        // Fila de identidad, igual a la del libro: título · pestañas · acciones.
        // Si no entra todo: las acciones se quedan junto al título y las
        // pestañas bajan a su fila. La descripción va al ⓘ, no debajo
        // (regla «explicar con ⓘ», Brandon 09-24 y 01-10).
        <div ref={filaRef} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
          <div className={FILA_TITULO_MODULO}>
            <TituloModulo
              icon={heading.icon}
              eyebrow={rotulo}
              title={heading.title}
              as={heading.as ?? "h1"}
              className={rotulo && heading.description ? TEXTO_TITULO_EN_GRILLA : undefined}
              ayuda={
                heading.description ? (
                  <InfoTip side="bottom" title={heading.title} what={heading.description} />
                ) : undefined
              }
            />
          </div>
          {estilo === "fase" && rielDePestanas}
          {acciones}
        </div>
      )}
      {!bandaConTitulo && canScrollLeft && (
        <button
          onClick={() => scrollTabs("left")}
          className="absolute left-0 top-0 bottom-0 z-10 flex w-10 items-center bg-linear-to-r from-[var(--surface-canvas)] via-[var(--surface-canvas)]/90 to-transparent transition-opacity duration-[var(--dur-base)]"
          aria-label="Ver tabs anteriores"
        >
          <ChevronLeft className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      )}

      {estilo === "linea" && rielDePestanas}

      {canScrollRight && (
        <button
          onClick={() => scrollTabs("right")}
          style={bandaConTitulo && riel ? { top: riel.top, height: riel.alto, right: riel.derecha } : undefined}
          className={cn(
            "absolute right-0 top-0 bottom-0 z-10 flex w-10 items-center justify-end bg-linear-to-l to-transparent transition-opacity duration-[var(--dur-base)]",
            estilo === "fase"
              ? "rounded-r-xl from-[var(--surface-sunken)] via-[var(--surface-sunken)]/90"
              : "from-[var(--surface-canvas)] via-[var(--surface-canvas)]/90",
          )}
          aria-label="Ver más tabs"
        >
          <ChevronRight className="h-4 w-4 text-[var(--text-secondary)]" />
        </button>
      )}
    </div>
    {/* El panel de la barra horizontal es hermano, no hijo: `aria-labelledby`
        ata el par por id, así que no necesitan ser contiguos en el árbol. */}
    <div
      id={idDelPanel}
      role={children ? "tabpanel" : undefined}
      aria-labelledby={children ? idDeTab(activeTab) : undefined}
      tabIndex={children ? 0 : undefined}
      className="outline-none"
    >
      <ModuleDepthProvider>{children}</ModuleDepthProvider>
    </div>
    </>
  );
}