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
import { type LucideIcon } from "@buleje/design-system/icons";
import { TituloModulo } from "./titulo-modulo";
import { type MenuAccion } from "./action-menu";
import { MasDelLibro, useMideAlMenos } from "./libro-herramientas";
import { isEditableTarget, isModalOpen } from "@/lib/keyboard-guards";
import { useModuleTabs } from "@/contexts/module-tabs-context";
import { FranjaDelLibro, FranjaLibroContext, type FranjaLibro } from "./libro-franja-permiso";
import { CLASE_SOLO_ANCHO, ProveedorAccionesDeLaVista } from "./libro-acciones-vista";
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
  /**
   * Rótulo para el riel angosto (menos de 80rem, donde ya van sin ícono):
   * «Lotes» por «Lotes de aserrío». El nombre entero sigue siendo el del
   * botón para el lector de pantalla, para el `title` y para la barra lateral.
   */
  labelCorto?: string;
}

/**
 * Desliza un tablist para que su pestaña elegida quede entera a la vista
 * (centrada). Con `scrollLeft` y no `scrollIntoView`, que movería la página
 * (mismo arreglo que `BarraDeSecciones`). Sin caja propia (`display:contents`)
 * o sin desborde no hace nada.
 */
function centrarElegida(lista: HTMLElement | null) {
  if (!lista || lista.scrollWidth <= lista.clientWidth) return;
  const elegida = lista.querySelector<HTMLElement>('[aria-selected="true"]');
  if (!elegida) return;
  const rl = lista.getBoundingClientRect();
  const re = elegida.getBoundingClientRect();
  lista.scrollLeft += re.left + re.width / 2 - (rl.left + rl.width / 2);
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
  /**
   * El nombre corto («Libro CTP») para cuando el título comparte su fila con
   * las fases y las acciones y no entra entero (banda de 33 a 64rem: la
   * pantalla de 1280 con la barra lateral abierta). Sin él, se corta con «…».
   */
  tituloCorto?: string;
  icon: LucideIcon;
  /** Vacío (o una sola vista) = módulo sin sub-navegación: la fila no se dibuja. */
  groups?: LibroGroup[];
  view?: string;
  onView?: (view: string) => void;
  /** Alertas por vista → punto en el grupo que la contiene. */
  alerts?: Record<string, number>;
  /** Chip de estado (score de cumplimiento). */
  status?: ReactNode;
  /** Chip del permiso/contrato bajo el que se trabaja (`ContratoActivoChip`).
   *  Lo pasa cada libro forestal: `shared` no importa de `forestal`. */
  contrato?: ReactNode;
  /** Control de contexto del libro (período). A la vista si la fila tiene
   *  lugar (grupo de acciones ≥56rem); si no, dentro del «⋯». */
  context?: ReactNode;
  /** La campana de avisos del libro. Mismo lugar que el período: a la vista
   *  si entra, si no en el «⋯». */
  avisos?: ReactNode;
  /** Acciones sueltas a la izquierda del menú (ej. el asistente IA). */
  tools?: ReactNode;
  /** Acciones del libro (exportar, informar…): van al final del «⋯». */
  actions?: LibroAction[];
  /** @deprecated Las acciones ya no tienen botón propio: van en el «⋯» del libro. */
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
  tituloCorto,
  icon: Icon,
  groups = SIN_GRUPOS,
  view = "",
  onView,
  alerts,
  status,
  contrato,
  context,
  tools,
  actions,
  avisos,
  atajosDeVista,
  children,
}: LibroChromeProps) {
  const { registerSubTabs, registerOnChange, clearSubTabs } = useModuleTabs();
  /* La franja «Viendo solo <permiso>» la publica el chip del permiso (libro-franja-permiso). */
  const [franja, setFranja] = useState<FranjaLibro | null>(null);
  /* El hueco del riel adonde cada vista manda sus acciones (libro-acciones-vista).
     `setHueco` es estable: como ref de callback no re-dispara nada (un setter
     nuevo en cada render metía el bucle de «Maximum update depth»). */
  const [hueco, setHueco] = useState<HTMLDivElement | null>(null);
  /* El período y la campana se ven en la fila sólo con lugar de sobra:
     permiso con su titular + puntaje + período + avisos + «⋯» ≈ 56rem. */
  const accionesRef = useRef<HTMLDivElement>(null);
  const herramientasALaVista = useMideAlMenos(accionesRef, 56 * 16);
  const flat = useMemo(() => groups.flatMap((g) => g.views), [groups]);
  const activeGroup = useMemo(
    () => groups.find((g) => g.views.some((v) => v.key === view)) ?? groups[0],
    [groups, view],
  );

  /* La pestaña activa, siempre a la vista (pedido del 17-10, medido: a 400
     «Producción» y «Despacho» quedaban fuera del riel deslizable y nada las
     traía; tampoco a la fase «Gestión»). También al cambiar el ancho. */
  const rielFases = useRef<HTMLDivElement>(null);
  const rielVistas = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const listas = [rielFases.current, rielVistas.current];
    const centrar = () => listas.forEach(centrarElegida);
    centrar();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(centrar);
    for (const l of listas) if (l) ro.observe(l);
    return () => ro.disconnect();
  }, [view, activeGroup?.id]);

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

  const herramientasEnElMas =
    tools || (!herramientasALaVista && (context || avisos)) ? (
      <>
        {!herramientasALaVista && context}
        {!herramientasALaVista && avisos}
        {tools}
      </>
    ) : null;

  return (
    <FranjaLibroContext.Provider value={setFranja}>
    <div className="space-y-3">
      <section
        data-module={moduleId}
        /* Sin `overflow-hidden`: el período, cuando va a la vista en la fila,
           abre su lista `absolute` y se recortaba. Las esquinas del riel de
           abajo las redondea el propio riel. */
        className="@container/banda rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-sm)]"
      >
        {/* Fila 1 — título · fases · permiso · puntaje · «⋯», en UNA fila de
            56 px desde 56rem de banda (Brandon 17-10: «compactar… reducir
            espacios»; antes partía en dos hasta los 78rem). Lo que cede, en
            orden: el rótulo de arriba del título (debajo de 78rem), el
            permiso y el puntaje (se compactan contra el ancho del grupo
            `acciones`, que es contenedor), y por último el título, que se
            corta con «…» y dice el nombre entero al pasar el mouse.
            Debajo de 56rem: título y acciones arriba (o acciones en su
            renglón, en el celular) y las fases en el último renglón, pegadas
            a las vistas que gobiernan.
            Se mide la BANDA y no la ventana: la barra lateral abierta o
            cerrada cambia 300 px el ancho real. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2 px-3 py-1 sm:px-4 @min-[56rem]/banda:flex-nowrap">
          {/* Identidad: la misma que usan TODAS las pestañas (titulo-modulo.tsx,
              Brandon 08-10 «todos iguales, como esta pestaña»). */}
          <TituloModulo
            icon={Icon}
            eyebrow={eyebrow}
            title={
              tituloCorto ? (
                <span title={title}>
                  <span className="@min-[33rem]/banda:@max-[64rem]/banda:hidden">{title}</span>
                  <span className="hidden @min-[33rem]/banda:@max-[64rem]/banda:inline">{tituloCorto}</span>
                </span>
              ) : (
                title
              )
            }
            truncar
            className="grow basis-[10rem] @min-[56rem]/banda:grow-0 @min-[56rem]/banda:basis-auto @max-[78rem]/banda:[&>.libro-kicker]:hidden"
          />
          {/* La FASE del libro comparte fila con el título (Brandon 2026-09-07):
              las cuatro fases siempre a la vista; las vistas de la activa, en
              el riel de abajo. Debajo de 56rem bajan al último renglón. */}
          {flat.length > 1 && groups.length > 1 && (
          <div className="order-last flex min-w-0 basis-full @min-[56rem]/banda:order-none @min-[56rem]/banda:basis-auto @min-[56rem]/banda:shrink-0">
          <div
            ref={rielFases}
            role="tablist"
            aria-label="Fase del libro"
            className="flex min-w-0 max-w-full items-center gap-0.5 overflow-x-auto rounded-xl bg-[var(--surface-sunken)] p-0.5 scrollbar-none"
            /* `contain: layout paint` (patrón de `StoreDetailClient.tsx`): sin
               esto, el scroll horizontal de ESTE riel se filtraba al
               `document.documentElement.scrollWidth` de toda la página (medido
               400→551px a 400px de ancho apenas cargaba el badge de
               pendientes) aunque el riel ya clipeaba su propio contenido —
               Chromium deja "asomar" el overflow de un `overflow-x-auto`
               anidado si nada aísla su layout. */
            style={{ scrollbarWidth: "none", contain: "layout paint" }}
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
                  className={`relative inline-flex h-11 shrink-0 items-center gap-1.5 rounded-[10px] px-2.5 text-sm font-bold transition-colors @max-[88rem]/banda:px-2 ${
                    activo
                      ? "bg-[var(--surface-raised)] text-[var(--accent-dark)] shadow-[var(--shadow-sm)] dark:text-[var(--accent)]"
                      : "text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {g.label}
                  {alertas > 0 && (
                    <>
                      <span
                        title={`${alertas} pendiente${alertas === 1 ? "" : "s"} en ${g.label}`}
                        className="grid h-4 min-w-4 place-items-center rounded-full bg-[var(--data-warning-500)] px-1 font-mono text-[length:var(--ts-2xs)] tabular-nums text-white"
                        aria-hidden="true"
                      >
                        {alertas}
                      </span>
                      {/* El número suelto se leía pegado al nombre del grupo
                          («Operación 11»), que suena a un grupo llamado así. */}
                      <span className="sr-only">{`· ${alertas} pendiente${alertas === 1 ? "" : "s"}`}</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          </div>
          )}
          {/* Permiso · puntaje · [período · avisos] · «⋯». El grupo es
              contenedor (`acciones`) en todos los anchos: el chip del permiso,
              su interruptor y el puntaje se compactan contra SU ancho con
              `@max-[..]/acciones` —primero el titular del permiso, después
              los rótulos—. Nunca baja de 21rem (lo que mide compacto); si al
              lado del título no entra, baja entero a su renglón.
              El período y la campana se ven en la fila sólo si el grupo mide
              56rem o más (pantallas anchas); si no, van al «⋯», con el resto
              de las herramientas y las acciones del libro. */}
          <div
            ref={accionesRef}
            className="ml-auto min-w-[min(100%,21rem)] flex-1 basis-0 [container-name:acciones] [container-type:inline-size]"
          >
            <div className="flex flex-nowrap items-center justify-end gap-2 @max-[36rem]/acciones:gap-1.5">
              {/* El permiso de trabajo va ANTES del estado: es bajo qué papel se
                  está parado, y eso manda sobre cualquier indicador. Lo pasa cada
                  libro (los forestales) en vez de importarlo acá: `shared` no
                  depende de `forestal`. */}
              {contrato}
              {status}
              {herramientasALaVista && context}
              {herramientasALaVista && avisos}
              <MasDelLibro acciones={actions} onAtajos={flat.length > 1 ? abrirAyuda : undefined}>
                {herramientasEnElMas}
              </MasDelLibro>
            </div>
          </div>
        </div>

        {/* Segundo riel: las vistas de la fase activa y, en la esquina, las
            ACCIONES de la vista (Brandon 17-10: «los botones … al lado de las
            pestañas en la esquina»). Cada vista las manda con
            `<AccionesDeLaVista>` (libro-acciones-vista.tsx) al hueco del final.
            Se pliega según el ancho del riel, no de la ventana:
            · ≥80rem  vistas con ícono, acciones con texto;
            · 60–80   vistas sin ícono y con su rótulo corto si lo tienen,
                      acciones sólo ícono («+ Nuevo» corto); si aun así no
                      entran, las acciones bajan a su línea;
            · 40–60   el riel salta de línea y las acciones cierran la última;
            · <40     el riel se desliza de lado y las acciones van en su fila. */}
        {flat.length > 1 && (
        <div className="@container/riel rounded-b-[15px] border-t border-[var(--rule-soft)] bg-[var(--surface-canvas)]">
          {/* Desde 60rem las vistas van con su ancho natural y las acciones, a
              la derecha; si no entran juntas, las ACCIONES bajan a su línea
              (antes el tablist cedía y escondía vistas: a 1280 en Lotes,
              «Volumen disponible» y «Despacho» quedaban tapadas, 17-10). */}
          <div className="flex flex-wrap items-center gap-1 px-2 py-1 sm:px-3">
          <div
            ref={rielVistas}
            role="tablist"
            aria-label={activeGroup?.label}
            className="flex min-w-0 max-w-full basis-full items-center gap-1 overflow-x-auto scrollbar-none @min-[40rem]/riel:@max-[60rem]/riel:contents @min-[60rem]/riel:flex-none @min-[60rem]/riel:basis-auto"
            /* Mismo aislamiento que el riel de fases de arriba: sin `contain`
               este riel (7 vistas con sus badges) era el que realmente
               empujaba la página entera a 551px de ancho a 400px de viewport
               — medido con Playwright hidiendo subárboles uno por uno hasta
               aislar ESTE nodo como el único responsable. Entre 40 y 60rem es
               `contents`: sus vistas envuelven en la fila de afuera y las
               acciones cierran la última línea en vez de bajar solas. */
            style={{ scrollbarWidth: "none", contain: "layout paint" }}
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
                  className={`relative inline-flex h-12 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors sm:px-3 @max-[80rem]/riel:px-2 ${
                    activo
                      ? "bg-primary/10 font-bold text-[var(--accent-ink)] dark:text-[var(--accent)] dark:bg-primary/20"
                      : "font-medium text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  <VIcon className={`h-4 w-4 shrink-0 ${CLASE_SOLO_ANCHO}`} />
                  {v.labelCorto ? (
                    <>
                      {/* El corto se ve; el entero lo lee el lector (y la
                          búsqueda por texto de los recorridos de QA). */}
                      <span aria-hidden="true" className="hidden @max-[80rem]/riel:inline">
                        {v.labelCorto}
                      </span>
                      <span className="@max-[80rem]/riel:sr-only">{v.label}</span>
                    </>
                  ) : (
                    <span>{v.label}</span>
                  )}
                  {/* El aviso de la vista era un punto de 6 px con `aria-hidden`:
                      no decía CUÁNTOS y un lector de pantalla no lo anunciaba
                      (2026-09-19, medido con el pendiente de corridas sin
                      materia prima, que llevaba meses sin poder encenderse).
                      Ahora es el mismo badge numérico que el del grupo —una sola
                      forma de avisar en toda la banda— y lleva el conteo al
                      nombre accesible del botón. */}
                  {(alerts?.[v.key] ?? 0) > 0 && (
                    <>
                      <span
                        className="grid h-4 min-w-4 shrink-0 place-items-center rounded-full bg-[var(--data-warning-500)] px-1 font-mono text-[length:var(--ts-2xs)] tabular-nums text-white"
                        aria-hidden="true"
                      >
                        {alerts?.[v.key]}
                      </span>
                      <span className="sr-only">
                        {`· ${alerts?.[v.key]} pendiente${alerts?.[v.key] === 1 ? "" : "s"}`}
                      </span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
          {/* El hueco de las acciones de la vista. `relative`: ancla los
              rótulos `sr-only` de los botones plegados (un `absolute` suelto
              ensanchaba la página). Vacío no ocupa lugar. */}
          <div
            ref={setHueco}
            data-acciones-riel=""
            className="relative ml-auto flex shrink-0 flex-wrap items-center justify-end gap-2 empty:hidden @max-[40rem]/riel:basis-full"
          />
          </div>
        </div>
        )}
      </section>

      <FranjaDelLibro franja={franja} />

      {/* Sin riel (una sola vista) no hay esquina: `undefined` = cada vista
          pinta sus acciones en su lugar, como siempre. */}
      <ProveedorAccionesDeLaVista value={flat.length > 1 ? hueco : undefined}>{children}</ProveedorAccionesDeLaVista>

    </div>
    </FranjaLibroContext.Provider>
  );
}
