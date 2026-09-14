"use client";

/**
 * ActionMenu — el botón «Opciones» de los módulos admin.
 *
 * Nació dentro de `libro-chrome` para plegar exportar/importar/informar, que se
 * usan una vez por mes y ocupaban dos filas de la cabecera. Vive acá porque el
 * mismo problema estaba en las barras de las vistas: Producción llegó a tener
 * siete controles en un renglón —buscar, filtros, descargar, recargar, simular,
 * parte de turno, dos selectores y el CTA— y a 1280px envolvían a tres filas
 * antes de la primera cifra.
 *
 * La regla que ordena qué se pliega: lo que se hace **todos los días** queda a la
 * vista (buscar, filtrar, el CTA); lo que se hace **de vez en cuando** entra al
 * menú con su explicación de una línea, que además es espacio que un botón-icono
 * no tenía para decir qué hace.
 *
 * SE DIBUJA EN UN PORTAL, no como hijo del botón: la cabecera del libro es una
 * `<section class="overflow-hidden">` de ~141px y un menú `absolute` de 525px
 * adentro se recorta a la altura del contenedor —se ve la primera opción y nada
 * más—. Ningún z-index arregla un recorte por overflow: hay que salir.
 */

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, MoreHorizontal, type LucideIcon } from "@buleje/design-system/icons";

export interface MenuAccion {
  id: string;
  label: string;
  /** Una línea de por qué/para qué. Solo en el menú desplegable. */
  hint?: string;
  icon: LucideIcon;
  onSelect: () => void;
  /**
   * `dark` = acción oficial (la que se presenta ante la autoridad).
   * `danger` = destruye datos. Se pinta distinta y va separada del resto: en un
   * menú donde todo lo demás exporta o importa, la que borra no puede parecer
   * una más de la lista.
   */
  tone?: "default" | "dark" | "danger";
  busy?: boolean;
  disabled?: boolean;
  /**
   * La opción que rige ahora (el agrupado activo, el lote abierto). Se marca con
   * un tilde: un menú que guarda estado y no lo muestra obliga a abrirlo,
   * elegir, y descubrir que ya estaba puesto.
   */
  activo?: boolean;
  /** Cifra a la derecha (m³, piezas). Va en mono para que la columna alinee. */
  meta?: string;
}

export interface ActionMenuProps {
  label: string;
  actions: MenuAccion[];
  /** Ícono del botón. Sin él, el menú de opciones usa los tres puntos. */
  icon?: LucideIcon;
  /**
   * `primary` = el CTA de la vista (degradé de acento).
   * `accent`  = una tarea pendiente que reclama atención, sin ser el CTA.
   * `outline` = el resto.
   */
  variant?: "outline" | "accent" | "primary";
  /** `md` (h-12) para las barras de las vistas; `sm` (h-10) para la cabina. */
  size?: "xs" | "sm" | "md";
  /** Número al lado del label (pendientes, seleccionados). */
  badge?: number;
  disabled?: boolean;
  title?: string;
  /** En móvil el botón se encoge a cuadrado y deja el label como `sr-only`. */
  compactoEnMovil?: boolean;
  /** Clases extra del botón (ej. `max-sm:flex-1` para que el CTA se estire). */
  className?: string;
  /**
   * Abrir desde afuera (un atajo de teclado). Cada incremento abre el menú; no
   * es un booleano porque apretar `N` dos veces seguidas tiene que volver a
   * abrirlo después de haberlo cerrado con Escape.
   */
  abrirSignal?: number;
  /** Qué decir cuando no hay ninguna acción disponible. */
  vacio?: ReactNode;
}

/** `xs` es para DENTRO de una fila de tabla: ahí un control de 40px manda la
 *  altura de la fila entera y multiplica el scroll por cada registro. */
const ALTO = { xs: "h-8", sm: "h-10", md: "h-12" } as const;
const RADIO = { xs: "rounded-lg", sm: "rounded-xl", md: "rounded-2xl" } as const;

/**
 * La caja contra la que se resuelve un `position: fixed` DESCENDIENTE.
 *
 * Por spec, `fixed` se ancla al viewport salvo que un ANCESTRO tenga
 * `transform`/`translate`/`rotate`/`scale`/`filter`/`perspective`/`will-change`
 * equivalente — ahí pasa a anclarse a la caja de ESE ancestro. El
 * `Dialog.Content` de Radix centra con `sm:-translate-x-1/2 sm:-translate-y-1/2`
 * en desktop.
 *
 * OJO: Tailwind **v4** compila esas clases a la propiedad `translate` — NO a
 * `transform` (confirmado en el bundle: `["translate","var(--tw-translate-x)
 * var(--tw-translate-y)"]`). Mirar sólo `transform` decía "no hay marco" para
 * el propio diálogo del libro, y el panel se ubicaba con el alto del VIEWPORT
 * en vez del diálogo — medido: panel `top 587 → bottom 888` contra un diálogo
 * que terminaba en `759` (2026-09-14). En el bottom-sheet de mobile no hay
 * ninguna de estas y sigue siendo el viewport de toda la vida. `null` = viewport.
 */
export function marcoDeFixed(el: HTMLElement | null): DOMRect | null {
  if (!el) return null;
  const s = getComputedStyle(el);
  /* `|| "none"` por si el motor de estilos (jsdom viejo) ni conoce la
     propiedad: sin esto, un `undefined` "distinto de none" marcaría cualquier
     elemento como si tuviera transform. */
  const val = (p: keyof CSSStyleDeclaration) => (s[p] as string | undefined) || "none";
  const establece =
    val("transform") !== "none" ||
    val("translate") !== "none" ||
    val("rotate") !== "none" ||
    val("scale") !== "none" ||
    val("filter") !== "none" ||
    val("perspective") !== "none" ||
    /transform|perspective|filter/.test(val("willChange"));
  return establece ? el.getBoundingClientRect() : null;
}

/**
 * Cuántos `ActionMenu` están abiertos ahora mismo DENTRO de cada diálogo.
 *
 * Contador y no un booleano: nada impide que dos filas de la misma tabla abran
 * su menú a la vez (uno con el mouse, otro con teclado), y cerrar uno no puede
 * borrarle al otro la marca. `WeakMap` para no quedarse con el diálogo vivo en
 * memoria después de que se desmonte.
 *
 * `AdminModal` lee el atributo `data-menu-abierto` que esto pone en su propio
 * `Dialog.Content` para decidir si Escape cierra sólo el menú (dejando el
 * diálogo abierto) o el diálogo entero — ver el comentario ahí.
 */
const menusAbiertosPorDialogo = new WeakMap<Element, number>();
/** Exportado: lo reusan otros menúes/popovers a mano (no sólo `ActionMenu`)
 *  que tengan el mismo problema con Escape dentro de un `AdminModal`. */
export function marcarMenuAbierto(dialogo: Element | null, abierto: boolean) {
  if (!dialogo) return;
  const actual = menusAbiertosPorDialogo.get(dialogo) ?? 0;
  const nuevo = Math.max(0, actual + (abierto ? 1 : -1));
  menusAbiertosPorDialogo.set(dialogo, nuevo);
  if (nuevo > 0) dialogo.setAttribute("data-menu-abierto", "true");
  else dialogo.removeAttribute("data-menu-abierto");
}

export default function ActionMenu({
  label,
  actions,
  icon: Icono,
  variant = "outline",
  size = "sm",
  badge,
  disabled,
  title,
  compactoEnMovil = false,
  className = "",
  abrirSignal,
  vacio,
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const anclaRef = useRef<HTMLButtonElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number; maxHeight: number } | null>(null);
  const listaRef = useRef<HTMLDivElement>(null);
  /**
   * Dónde se portalea el panel (ADR "menú de fila sin clics dentro del
   * libro"): DENTRO del `[role=dialog]` más cercano si el botón vive en uno,
   * `document.body` si no.
   *
   * Portalear siempre a `body` dejaba el panel bajo el `pointer-events: none`
   * que Radix le pone al body mientras un `Dialog` está abierto: el menú se
   * VEÍA pero ningún ítem recibía clic (`elementsFromPoint` devolvía la fila
   * de la tabla de abajo). `pointer-events: auto` sólo en el panel no alcanza:
   * el `DismissableLayer` de Radix toma ese clic como "afuera" y cierra el
   * diálogo, y su `FocusScope` le roba el foco al menú. Portalear como
   * DESCENDIENTE del diálogo resuelve las tres cosas de una: hereda
   * `pointer-events: auto` del `Dialog.Content`, y para `contains()` (el
   * chequeo de "afuera" de Radix) y el `FocusScope` el panel ya es parte del
   * diálogo. Es un ref y no state: se necesita LISTO antes de que el render
   * que dibuja `pos` (dentro del mismo `useLayoutEffect`) decida el portal.
   */
  const portalARef = useRef<HTMLElement | null>(null);
  /**
   * Si quedan opciones fuera de vista, arriba o abajo.
   *
   * Un menú que scrollea sin avisar esconde opciones: en una ventana de 620 px
   * la última («Importar del SNIFFS») quedaba a 175 px de distancia y nada en
   * pantalla decía que existiera. El usuario concluye que no está.
   */
  const [corte, setCorte] = useState({ arriba: false, abajo: false });
  const busy = actions.find((a) => a.busy);

  const medirCorte = useCallback(() => {
    const el = listaRef.current;
    if (!el) return;
    /* 2 px de tolerancia: los altos fraccionarios del zoom del navegador dejan
       un degradé encendido para siempre al final del scroll. */
    setCorte({
      arriba: el.scrollTop > 2,
      abajo: el.scrollTop + el.clientHeight < el.scrollHeight - 2,
    });
  }, []);

  /**
   * Dónde y con cuánto alto se dibuja.
   *
   * Se abre hacia abajo salvo que no entre: ahí va hacia arriba. Y siempre con
   * un techo de alto — un menú más largo que la pantalla no se puede recorrer
   * de otra forma, y con seis acciones ya pasaba en un portátil.
   */
  const ubicar = useCallback(() => {
    const ancla = anclaRef.current;
    const b = ancla?.getBoundingClientRect();
    if (!b || !ancla) return;
    /* El diálogo MÁS CERCANO al botón — con modales anidados (`aboveModals`)
       es el de encima, que es el único con el que el operador puede
       interactuar ahora mismo. */
    const dialogo = ancla.closest<HTMLElement>('[role="dialog"]');
    portalARef.current = dialogo;
    const marco = marcoDeFixed(dialogo);
    const base = marco ?? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };

    const MARGEN = 12;
    const bTop = b.top - base.top;
    const bBottom = b.bottom - base.top;
    const bRight = b.right - base.left;
    const abajo = base.height - bBottom - MARGEN;
    const arriba = bTop - MARGEN;
    const haciaArriba = abajo < 240 && arriba > abajo;
    const disponible = haciaArriba ? arriba : abajo;
    setPos({
      top: haciaArriba ? Math.max(MARGEN, bTop - Math.min(disponible, 520) - 8) : bBottom + 8,
      right: Math.max(MARGEN, base.width - bRight),
      /* SIN piso de 200: eso fue justo lo que empujó el panel fuera del
         diálogo cuando `disponible` daba menos (el menú de la fila igual
         scrollea adentro con `overflow-y-auto` en `listaRef`, así que un
         `maxHeight` chico no esconde nada — recorta con aviso). */
      maxHeight: Math.max(0, disponible - 8),
    });
  }, []);

  /* `useLayoutEffect` y no `useEffect`: posicionarlo después de pintar lo hace
     aparecer un frame en la esquina y saltar a su lugar. */
  useLayoutEffect(() => {
    if (!open) return;
    ubicar();
    /* Después del layout: antes de pintar, `scrollHeight` todavía es 0. */
    requestAnimationFrame(medirCorte);
  }, [open, ubicar, medirCorte]);

  useEffect(() => {
    if (!open) return;
    /*
     * Cierra el menú y marca el Escape como resuelto (`preventDefault`): el
     * `DismissableLayer` de Radix sólo cierra el diálogo de abajo si
     * `!event.defaultPrevented`. Es su mecanismo documentado y no depende del
     * orden de los listeners. La marca `data-menu-abierto` sola NO alcanzaba:
     * cerrar el menú la borra en el microtask que corre antes del listener de
     * Radix (medido en el navegador el 2026-09-14: Escape se llevaba el menú y
     * el libro). La marca queda como segunda defensa en `AdminModal`.
     */
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      setOpen(false);
    };
    /* Al scrollear o redimensionar hay que re-ubicarlo: el menú está en
       coordenadas de viewport y el botón se movió. `capture` para enterarse
       también del scroll de los contenedores internos. */
    window.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [open, ubicar]);

  /**
   * Marca el diálogo ancestro mientras el menú está abierto (ver
   * `marcarMenuAbierto`): es lo que `AdminModal` mira en su `onEscapeKeyDown`
   * para NO cerrarse él también. Es la segunda defensa: la primera es el
   * `preventDefault` del listener de Escape de arriba, porque cerrar el menú
   * borra esta marca antes de que Radix la lea.
   */
  useEffect(() => {
    if (!open) return;
    const dialogo = anclaRef.current?.closest<HTMLElement>('[role="dialog"]') ?? null;
    if (!dialogo) return;
    marcarMenuAbierto(dialogo, true);
    return () => marcarMenuAbierto(dialogo, false);
  }, [open]);

  /* El atajo de teclado abre el mismo menú que el clic: si abriera otra cosa,
     serían dos caminos que hay que mantener iguales a mano. */
  useEffect(() => {
    if (abrirSignal == null || abrirSignal === 0) return;
    setOpen(true);
  }, [abrirSignal]);

  const menu = open && pos && (
    <>
      <div className="fixed inset-0 z-[60]" onClick={() => setOpen(false)} aria-hidden="true" />
      <div
        style={{ top: pos.top, right: pos.right, maxHeight: pos.maxHeight }}
        className="fixed z-[61] flex w-[19rem] flex-col overflow-hidden rounded-2xl border border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
      >
        {/* Los degradés van FUERA del área que scrollea, si no se irían con el
            contenido. `pointer-events-none` para no comerse el clic de la
            opción que tapan a medias. */}
        {corte.arriba && (
          <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-6 bg-linear-to-b from-[var(--surface-raised)] to-transparent" />
        )}
        <div
          role="menu"
          ref={listaRef}
          onScroll={medirCorte}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {actions.length === 0 && vacio && (
            <div className="px-4 py-3 text-sm text-[var(--text-tertiary)]">{vacio}</div>
          )}
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
                } ${a.tone === "dark" ? "bg-primary/5" : ""} ${a.activo ? "bg-primary/10" : ""}`}
              >
                {a.busy ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" />
                ) : a.activo ? (
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                ) : (
                  <AIcon
                    className={`mt-0.5 h-4 w-4 shrink-0 ${
                      a.tone === "dark"
                        ? "text-primary"
                        : a.tone === "danger"
                          ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                          : "text-[var(--text-tertiary)]"
                    }`}
                  />
                )}
                <span className="min-w-0 flex-1">
                  <b
                    className={`block text-sm font-bold ${
                      a.tone === "danger"
                        ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {a.label}
                  </b>
                  {a.hint && <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{a.hint}</span>}
                </span>
                {a.meta && (
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-secondary)]">{a.meta}</span>
                )}
              </button>
            );
          })}
        </div>
        {/* Decirlo con palabras además del degradé: el degradé solo se lee como
            un borde suave y no como «hay más». */}
        {corte.abajo && (
          <button
            type="button"
            onClick={() => {
              /* Al FINAL, no un tramo: el aviso promete «hay más» y lo que se
                 espera al tocarlo es verlo todo, no avanzar dos opciones. */
              const el = listaRef.current;
              el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
            className="flex shrink-0 items-center justify-center gap-1.5 border-t border-[var(--rule-soft)] bg-[var(--surface-sunken)] py-1.5 text-xs font-bold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)]"
          >
            <ChevronDown className="h-3.5 w-3.5" aria-hidden /> Hay más opciones
          </button>
        )}
      </div>
    </>
  );

  const BotonIcono = Icono ?? MoreHorizontal;
  const piel =
    variant === "primary"
      ? "bg-linear-to-br from-[var(--accent)] to-[var(--accent-dark)] text-white shadow-sm hover:brightness-110"
      : variant === "accent"
        ? "border-2 border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] hover:bg-primary/15 dark:text-[var(--accent)]"
        : "border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]";

  return (
    <div className="relative">
      <button
        ref={anclaRef}
        type="button"
        disabled={disabled}
        title={title}
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        /* Sin `aria-label`: el nombre accesible sale del texto visible (que en
           móvil queda `sr-only`, no oculto). Poner uno acá rompe el control por
           voz cuando el label cambia con el estado. */
        className={`inline-flex shrink-0 items-center justify-center gap-2 font-bold transition disabled:opacity-60 ${ALTO[size]} ${RADIO[size]} ${piel} ${
          size === "xs" ? "gap-1.5 px-2 text-xs" : "px-4"
        } ${variant === "primary" ? "text-base" : size === "xs" ? "" : "text-sm"} ${
          compactoEnMovil ? "max-sm:w-12 max-sm:px-0" : ""
        } ${className}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BotonIcono className="h-4 w-4 shrink-0" />}
        <span className={compactoEnMovil ? "max-sm:sr-only" : ""}>{busy ? "Generando…" : label}</span>
        {badge != null && badge > 0 && (
          <span
            className={`rounded-full px-1.5 text-xs font-bold tabular-nums ${
              variant === "primary" ? "bg-white/25 text-white" : "bg-[var(--accent)] text-white"
            }`}
          >
            {badge}
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 opacity-60 transition-transform ${open ? "rotate-180" : ""} ${
            compactoEnMovil ? "max-sm:hidden" : ""
          }`}
          aria-hidden
        />
      </button>

      {/* `document.body` no existe en el render del servidor: sin el guard, el
          SSR revienta antes de llegar al navegador. `portalARef` ya quedó
          fijado por `ubicar()` en el mismo `useLayoutEffect` que puso `pos`. */}
      {typeof document !== "undefined" && menu ? createPortal(menu, portalARef.current ?? document.body) : null}
    </div>
  );
}
