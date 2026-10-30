"use client";

import { useRef, useEffect, useId, useSyncExternalStore, type ReactNode } from "react";
import { isEditableTarget, isModalOpen } from "@/lib/keyboard-guards";
import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import { elegirLugar, repartirPestanas } from "@/lib/admin/pestanas-que-entran";
import {
  anchoConSeparacion,
  anchoUtil,
  leerMedidor,
  paddingX,
  separacionDe,
  useConMedidor,
  usePestanasQueEntran,
} from "@/hooks/use-pestanas-que-entran";
import { ContenidoPestana, MedidorDePestanas, PestanasMas } from "./pestanas-mas";
import { useOrdenDeLaBarra } from "./use-orden-de-la-barra";
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
const PESTANA: Record<EstiloPestana, { base: string; activa: string; inactiva: string; fila: string }> = {
  linea: {
    fila: "gap-0.5 sm:gap-1",
    // Mobile: tap target accesible (min ~44px alto via py-2.5 + texto sm).
    base: "flex shrink-0 items-center gap-2 whitespace-nowrap border-b-[3px] px-3 py-2.5 text-sm transition-all duration-[var(--dur-base)] sm:gap-1.5 sm:px-4 sm:py-2.5 sm:text-sm",
    activa: "border-primary bg-primary/5 font-semibold text-[var(--accent-ink)] dark:text-[var(--accent)]",
    inactiva: "border-transparent font-normal text-[var(--text-secondary)] hover:bg-[var(--surface-alt)] hover:text-[var(--text-primary)]",
  },
  fase: {
    fila: "gap-0.5",
    // 44 px en celular (mínimo táctil, 29-10); 36 desde sm, donde manda el mouse.
    base: "relative inline-flex h-11 sm:h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 text-sm font-bold transition-colors duration-[var(--dur-base)]",
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
 * Pestañas en UNA fila con «Más ▾» (priority+, Brandon 19-10 «Más espacio
 * arriba»): a 1280 px diez secciones bajaban sus pestañas a una 2.ª fila
 * (barra de 114-122 px contra 66) y a 400 px 47 pestañas quedaban fuera de la
 * pantalla tras un desliz. Ahora las que no entran van al «Más» de la misma
 * fila; la activa siempre se ve.
 *
 * Con título: al lado si entran al menos `MINIMO_AL_LADO` (o todas); si no,
 * en su fila debajo, igual de una sola fila. El ancho se suma con anchos
 * NATURALES (medidor escondido) y cajas que no cambian con la respuesta: no
 * oscila. `MARGEN_AL_LADO` = el `sm:ml-1` del riel al lado del título.
 */
const MINIMO_AL_LADO = 2;
const MARGEN_AL_LADO = 4;
/** Dónde van las pestañas en la banda con título (el `lugar` del reparto). */
const LUGAR_AL_LADO = 0;
const LUGAR_ABAJO = 1;
const LUGAR_COMPARTIDA = 2;

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
  /** Padding compacto de la pestaña en el celular (`linea`). Desde el 19-10
      las pestañas no envuelven ni se deslizan: van en UNA fila y lo que no
      entra, al «Más ▾» (ninguna queda escondida tras un desliz). */
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
    /**
     * Fila de ABAJO de la banda: el segundo nivel de lo elegido arriba (las
     * secciones de la pestaña, o las pestañas propias del módulo montado) con
     * sus acciones. Lo principal arriba, lo secundario abajo (Brandon 23-10:
     * en Mi Plata › Adelantos las pestañas del módulo quedaban ENCIMA de las
     * de Mi Plata, porque viajaban en `actions` y envolvían antes que ellas).
     *
     * Ocupa SIEMPRE su alto, aun vacía (cargando, sin datos): la banda no
     * salta al pasar de una pestaña a otra (70 → 122 → 170 px medidos a 1280
     * en Mi Plata). La regla que la separa sólo se dibuja si hay pestañas.
     */
    segundoNivel?: ReactNode;
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
  const filaRef = useRef<HTMLDivElement>(null);
  const accionesRef = useRef<HTMLDivElement>(null);
  const tabDeLaUrl = useSyncExternalStore(suscribirUrl, leerTabDeUrl, sinTabEnServidor);
  const rotulo = heading ? (heading.eyebrow ?? rotuloDelMenu(tabDeLaUrl, heading.title)) : undefined;

  /** Las acciones del módulo van en la banda (su caja se arma tras el reparto). */
  const conAccionesArriba = Boolean(bandaConTitulo && heading?.actions);
  // Anidada: las acciones van dentro del riel, junto al `rightSlot`.
  const accionesEnRiel = !bandaConTitulo && heading?.actions ? heading.actions : null;
  const idDeTab = (id: string) => `${barraId}-tab-${id}`;
  const idDelPanel = `${barraId}-panel`;

  /* El orden: el arrastrado a mano y, en la barra del módulo, «Menú en tu orden». */
  const orden = useOrdenDeLaBarra({ tabs, moduleId, activeTab, conUso: profundidad === 0 && !vertical });
  const arrastrable = draggable && !orden.ordenPorUsoPuesto;
  const porId = new Map(tabs.map((t) => [t.id, t]));
  const tabsBarra = orden.idsBarra.map((id) => porId.get(id)).filter((t): t is AdminTab => Boolean(t));

  /* ── Qué pestañas entran (priority+) ── */
  const conMedidor = useConMedidor();
  const medidorRef = useRef<HTMLDivElement>(null);
  const rielRef = useRef<HTMLDivElement>(null);
  const tituloRef = useRef<HTMLDivElement>(null);
  const slotRef = useRef<HTMLDivElement>(null);
  const conSlot = Boolean(rightSlot || accionesEnRiel);
  const reparto = usePestanasQueEntran(
    () => {
      const medidas = leerMedidor(medidorRef.current);
      const riel = rielRef.current;
      if (!medidas || !riel) return null;
      const base = {
        ids: orden.idsBarra,
        anchos: medidas.anchos,
        anchoMas: medidas.anchoMas,
        separacion: medidas.separacion,
        activa: activeTab,
        aMas: orden.aMas,
        conMas: orden.masFijo,
      };
      const slot = anchoConSeparacion(slotRef.current, medidas.separacion);
      if (!bandaConTitulo) {
        const ancho = anchoUtil(riel);
        return ancho > 0 ? { ...repartirPestanas({ ...base, disponible: ancho - slot }), lugar: 0 } : null;
      }
      const fila = filaRef.current;
      const libre = anchoUtil(fila);
      if (libre <= 0) return null;
      const sep = separacionDe(fila);
      const caja = paddingX(riel);
      const titulo = tituloRef.current?.getBoundingClientRect().width ?? 0;
      const conAcciones = anchoConSeparacion(accionesRef.current, sep);
      const alLado = { ancho: libre - titulo - sep - MARGEN_AL_LADO - caja - slot - conAcciones, minimo: MINIMO_AL_LADO };
      const abajo = { ancho: libre - caja - slot, minimo: 0 };
      /* Las acciones no entran junto al título (celular): antes quedaban en una
         fila sola, entre el título y las pestañas (3 filas, 170 px a 400). Si al
         lado de las pestañas entra al menos la activa, comparten la 2.ª fila. */
      if (conAcciones > 0 && titulo + conAcciones > libre) {
        const compartida = { ancho: libre - caja - slot - conAcciones, minimo: 1 };
        const r = elegirLugar([alLado, compartida, abajo], base);
        return { ...r, lugar: [LUGAR_AL_LADO, LUGAR_COMPARTIDA, LUGAR_ABAJO][r.lugar] ?? LUGAR_ABAJO };
      }
      return elegirLugar([alLado, abajo], base);
    },
    () => [filaRef.current, tituloRef.current, accionesRef.current, slotRef.current, medidorRef.current, bandaConTitulo ? null : rielRef.current],
    [conMedidor, bandaConTitulo, orden.idsBarra.join(","), orden.aMas.join(","), activeTab, orden.masFijo, conSlot, conAccionesArriba].join("|"),
  );
  const visibles = reparto ? reparto.visibles.map((id) => porId.get(id)).filter((t): t is AdminTab => Boolean(t)) : tabsBarra;
  const escondidas = reparto ? reparto.escondidas.map((id) => porId.get(id)).filter((t): t is AdminTab => Boolean(t)) : [];
  const mostrarMas = escondidas.length > 0 || orden.masFijo;
  const pestanasAbajo = bandaConTitulo && reparto?.lugar === LUGAR_ABAJO;
  /** Título solo arriba; pestañas y acciones juntas en la 2.ª fila. */
  const compartida = bandaConTitulo && reparto?.lugar === LUGAR_COMPARTIDA;

  /**
   * Cuando las pestañas bajan a su propia fila (`order-3 basis-full`), las
   * acciones se quedan junto al título vía `order`: la fila de arriba queda
   * «título … acciones» y la de abajo, las pestañas. Compartida: título ·
   * corte · pestañas + acciones.
   */
  const acciones = conAccionesArriba ? (
    <div
      ref={accionesRef}
      className={cn("ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-2", compartida ? "order-4" : "order-2")}
    >
      {heading?.actions}
    </div>
  ) : null;

  /** Elegir una del «Más»: pasa a verse (es la activa) y el foco la sigue. */
  const elegirDelMas = (id: string) => {
    onTabChange(id);
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(idDeTab(id))?.focus()));
  };

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
    // Sólo las que se ven: las del «Más» se eligen desde su menú.
    const usables = visibles.filter((t) => !t.disabled);
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
            {tabsBarra.map((tab) => {
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

          {orden.isReordered && (
            <button
              onClick={orden.resetOrder}
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
    <div
      ref={rielRef}
      className={cn(
        "flex",
        // Con `heading` las pestañas van DENTRO de la banda, como en el Libro
        // TH (referencia de Brandon 08-10): en la caja hundida de las fases, al
        // lado del título si entran y en su fila de abajo si no. Sin
        // `heading`, la línea de siempre. Nunca envuelven ni se deslizan: lo
        // que no entra va al «Más».
        estilo === "fase"
          ? cn(
              "order-1 min-w-0 max-w-full flex-none items-center gap-0.5 rounded-xl bg-[var(--surface-sunken)] p-0.5 sm:p-1",
              reparto === null
                ? "sm:ml-1 @max-[60rem]/banda:order-3 @max-[60rem]/banda:basis-full"
                : pestanasAbajo
                  ? "order-3 basis-full"
                  : compartida
                    ? "order-3"
                    : "sm:ml-1",
            )
          : "-mx-1 gap-0.5 border-b border-[var(--rule-base)] px-1 sm:gap-1",
        // Sin medir todavía (primer cuadro, servidor): todas, recortadas a la
        // fila. Nunca empujan el ancho de la página.
        reparto === null && "overflow-hidden",
      )}
    >
      {/* eslint-disable-next-line jsx-a11y/interactive-supports-focus -- ver el comentario de la rama vertical: el foco va en las pestañas, no acá. */}
      <div
        role="tablist"
        aria-orientation="horizontal"
        onKeyDown={teclasDeBarra}
        className={cn("flex min-w-0", PESTANA[estilo].fila)}
      >
        {visibles.map((tab) => (
          <button
            key={tab.id}
            draggable={arrastrable}
            onDragStart={() => orden.setDraggedTab(tab.id)}
            onDragOver={(event) => {
              event.preventDefault();
              orden.setDragOverTab(tab.id);
            }}
            onDragLeave={() => orden.setDragOverTab(null)}
            onDrop={() => orden.handleDrop(tab.id)}
            onDragEnd={() => {
              orden.setDraggedTab(null);
              orden.setDragOverTab(null);
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
              wrap && estilo === "linea" && "max-sm:px-2",
              arrastrable && "cursor-grab active:cursor-grabbing",
              activeTab === tab.id ? PESTANA[estilo].activa : PESTANA[estilo].inactiva,
              tab.disabled && "cursor-not-allowed opacity-40",
              orden.draggedTab === tab.id && "scale-95 opacity-40",
              orden.dragOverTab === tab.id && orden.draggedTab !== tab.id && "rounded-t-lg ring-2 ring-primary ring-offset-1",
            )}
          >
            <ContenidoPestana tab={tab} conAsa={arrastrable && estilo === "linea"} />
          </button>
        ))}
      </div>

      {/* «Más ▾»: las que no entran, el orden por uso y «Restablecer orden». */}
      {mostrarMas && (
        <PestanasMas
          estilo={estilo}
          escondidas={escondidas}
          onElegir={elegirDelMas}
          orden={orden.orden}
          restablecer={orden.isReordered ? orden.resetOrder : null}
        />
      )}

      {/* Slot derecho — status chip u otras acciones contextuales.
          ml-auto empuja todo a la derecha, pr-2 margen del borde. */}
      {conSlot && (
        <div ref={slotRef} className="ml-auto flex shrink-0 items-center gap-2 pr-2">
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
        // MISMA tarjeta que la banda del Libro TH (titulo-modulo.tsx).
        // `relative`: ancla el medidor escondido.
        bandaConTitulo ? cn(BANDA_MODULO, "relative") : "@container relative",
        className,
      )}
    >
      {conMedidor && (
        <MedidorDePestanas
          medidorRef={medidorRef}
          tabs={tabsBarra}
          claseTab={cn(PESTANA[estilo].base, wrap && estilo === "linea" && "max-sm:px-2", PESTANA[estilo].activa)}
          claseFila={PESTANA[estilo].fila}
          estiloMas={estilo}
          conAsa={arrastrable && estilo === "linea"}
          conContador={tabs.some((t) => t.badge != null)}
        />
      )}
      {bandaConTitulo && heading && (
        // Fila de identidad, igual a la del libro: título · pestañas · acciones.
        // Si no entra todo: las acciones se quedan junto al título y las
        // pestañas bajan a su fila. La descripción va al ⓘ, no debajo
        // (regla «explicar con ⓘ», Brandon 09-24 y 01-10).
        <div ref={filaRef} className={cn("flex flex-wrap items-center gap-x-3 px-3 py-2.5 sm:px-4", compartida ? "gap-y-0" : "gap-y-2")}>
          <div ref={tituloRef} className={FILA_TITULO_MODULO}>
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
          {/* El corte hace de separación (h-2 = el gap-y que se apaga en compartida). */}
          {compartida && <div aria-hidden className="order-2 h-2 basis-full" />}
          {estilo === "fase" && rielDePestanas}
          {acciones}
        </div>
      )}
      {estilo === "linea" && rielDePestanas}
      {heading?.segundoNivel && (
        /* `py-2` afuera y `min-h-12` adentro: vacía mide lo mismo que con la
           barra de secciones (48 px) puesta. La regla, sólo con pestañas
           adentro (lo que llega por portal no avisa cuándo llega). */
        <div
          data-segundo-nivel=""
          className="border-t border-transparent px-3 py-2 has-[[role=tablist]]:border-[var(--rule-soft)] sm:px-4"
        >
          <div className="flex min-h-12 min-w-0 flex-wrap items-center gap-2">{heading.segundoNivel}</div>
        </div>
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
