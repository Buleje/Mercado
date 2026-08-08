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
    const b = anclaRef.current?.getBoundingClientRect();
    if (!b) return;
    const MARGEN = 12;
    const abajo = window.innerHeight - b.bottom - MARGEN;
    const arriba = b.top - MARGEN;
    const haciaArriba = abajo < 240 && arriba > abajo;
    setPos({
      top: haciaArriba ? Math.max(MARGEN, b.top - Math.min(arriba, 520) - 8) : b.bottom + 8,
      right: Math.max(MARGEN, window.innerWidth - b.right),
      maxHeight: Math.max(200, (haciaArriba ? arriba : abajo) - 8),
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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    /* Al scrollear o redimensionar hay que re-ubicarlo: el menú está en
       coordenadas de viewport y el botón se movió. `capture` para enterarse
       también del scroll de los contenedores internos. */
    window.addEventListener("keydown", onKey);
    window.addEventListener("scroll", ubicar, true);
    window.addEventListener("resize", ubicar);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", ubicar, true);
      window.removeEventListener("resize", ubicar);
    };
  }, [open, ubicar]);

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
        className="fixed z-[61] flex w-[19rem] flex-col overflow-hidden rounded-2xl border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] shadow-[var(--shadow-lg)]"
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
        : "border-2 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]";

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
          SSR revienta antes de llegar al navegador. */}
      {typeof document !== "undefined" && menu ? createPortal(menu, document.body) : null}
    </div>
  );
}
