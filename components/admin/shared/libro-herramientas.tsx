"use client";

/**
 * libro-herramientas — el «⋯» de la cabecera de los libros.
 *
 * Herramientas (período, buscar guía, avisos, modo patio, atajos) y acciones
 * del libro (carpeta de fiscalización, formato oficial, exportar…) en UN
 * botón. Eran dos al final de la fila del título —«Herramientas» de 40 px y el
 * «⋯» de acciones de 48—, y en la banda de 60rem (1280 px con la barra lateral
 * abierta) esos 48 px eran los que le faltaban al título para entrar en la
 * misma fila que las fases, el permiso y el puntaje (Brandon 17-10:
 * «compactar… reducir espacios»).
 *
 * Se dibuja en un PORTAL con posición medida, igual que `ActionMenu`: un panel
 * `absolute` dentro de la cabecera se recortaría. El velo de atrás cierra al
 * tocar afuera; Escape también. Los controles de arriba (el selector de
 * período, la campana de avisos) abren lo suyo: esa parte del panel no tiene
 * overflow que los recorte. La lista de acciones sí se desliza si es larga.
 */

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Check, Keyboard, Loader2, MoreHorizontal, X } from "@buleje/design-system/icons";
import { Kicker } from "@buleje/design-system";
import { marcoDeFixed, type MenuAccion } from "./action-menu";
import { useModalAccesible } from "@/hooks/use-modal-accesible";

/** El botón de la hoja de atajos. Dentro del panel se muestra siempre; suelto,
 *  sólo en pantallas grandes (en móvil el atajo de teclado no existe). */
export function BotonAtajos({ onClick, enPanel = false }: { onClick: () => void; enPanel?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Atajos del teclado (?)"
      aria-label="Ver los atajos del teclado"
      className={`${enPanel ? "inline-flex" : "hidden lg:inline-flex"} h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-tertiary)] transition-colors hover:border-[var(--accent)] hover:text-[var(--text-primary)]`}
    >
      <Keyboard className="h-4 w-4" />
    </button>
  );
}

/**
 * `true` mientras el elemento mida al menos `px` de ancho. Sin
 * `ResizeObserver` (jsdom de los tests) queda en `false`: lo de ese lado va al
 * «⋯», que es donde siempre estuvo. El elemento medido tiene que ser un
 * contenedor (`container-type: inline-size`): su ancho no depende de lo que
 * se le ponga adentro, así que mover algo adentro o afuera no lo hace oscilar.
 */
export function useMideAlMenos(ref: RefObject<HTMLElement | null>, px: number): boolean {
  const [cabe, setCabe] = useState(false);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const medir = () => setCabe(el.getBoundingClientRect().width >= px);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, px]);
  return cabe;
}

/** Las acciones del libro dentro del panel: la misma forma que las opciones de `ActionMenu`. */
function ListaDeAcciones({ acciones, alElegir }: { acciones: MenuAccion[]; alElegir: (a: MenuAccion) => void }) {
  return (
    <div className="-mx-3 -mb-3 mt-3 max-h-[min(55vh,26rem)] overflow-y-auto overscroll-contain border-t border-[var(--rule-base)]">
      <Kicker className="block bg-[var(--surface-sunken)] px-4 pb-1.5 pt-2.5 leading-none">Acciones del libro</Kicker>
      {acciones.map((a, i) => {
        const AIcon = a.icon;
        const abreSeccion = !!a.seccion && a.seccion !== acciones[i - 1]?.seccion;
        const peligro = a.tone === "danger";
        return (
          <Fragment key={a.id}>
            {abreSeccion && (
              <div
                role="separator"
                aria-label={a.seccion}
                className="border-t border-[var(--rule-base)] bg-[var(--surface-sunken)] px-4 pb-1.5 pt-2.5 text-xs font-black uppercase tracking-widest text-[var(--text-tertiary)]"
              >
                {a.seccion}
              </div>
            )}
            <button
              type="button"
              disabled={a.disabled || a.busy}
              onClick={() => alElegir(a)}
              className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-canvas)] disabled:opacity-50 ${
                i > 0 && !abreSeccion ? "border-t border-[var(--rule-soft)]" : ""
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
                      : peligro
                        ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]"
                        : "text-[var(--text-tertiary)]"
                  }`}
                />
              )}
              <span className="min-w-0 flex-1">
                <b
                  className={`block text-sm font-bold ${
                    peligro ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]"
                  }`}
                >
                  {a.label}
                </b>
                {a.hint && <span className="mt-0.5 block text-xs text-[var(--text-tertiary)]">{a.hint}</span>}
              </span>
              {a.meta && <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-secondary)]">{a.meta}</span>}
            </button>
          </Fragment>
        );
      })}
    </div>
  );
}

/**
 * El «⋯» del libro: arriba las herramientas (`children`, más el botón de
 * atajos), abajo las acciones. Sin herramientas ni acciones no se dibuja.
 */
export function MasDelLibro({
  children,
  acciones,
  onAtajos,
}: {
  children?: ReactNode;
  acciones?: MenuAccion[];
  onAtajos?: () => void;
}) {
  const [open, setOpen] = useState(false);
  /* Lo de adentro queda MONTADO tras la primera apertura (30-10): la campana de
     avisos abre un `AdminModal`, el observador de abajo cierra el panel y, si el
     panel se desmontaba, se llevaba la ventana recién abierta (no abría nada
     debajo de 1600 px, donde la campana vive acá). Cerrado = oculto, no borrado. */
  const [montado, setMontado] = useState(false);
  useEffect(() => {
    if (open) setMontado(true);
  }, [open]);
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
  const cerrar = useCallback(() => setOpen(false), []);
  useModalAccesible(panelRef, { onCerrar: cerrar, cerrarConEscape: false, activo: open });

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
       borde inferior. Fuera de un diálogo `base` es el viewport entero y esto
       nunca dispara. */
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

  /* Una herramienta que abre una ventana («Buscar guía», 2026-10-11): el panel
     (z-61) quedaba flotando ENCIMA de la ventana nueva, y como Radix apaga los
     clics fuera de ella, ni se podía cerrar. Al aparecer un `AdminModal` en el
     body, el panel se cierra solo. */
  useEffect(() => {
    if (!open) return;
    const mo = new MutationObserver(() => {
      if (document.querySelector("[data-modal-variante]")) setOpen(false);
    });
    mo.observe(document.body, { childList: true });
    return () => mo.disconnect();
  }, [open]);

  const hayAcciones = !!acciones && acciones.length > 0;
  const hayHerramientas = !!children || !!onAtajos;
  if (!hayAcciones && !hayHerramientas) return null;
  /* Lo que se está generando (la carpeta, el Excel) se ve en el botón: el
     panel se cierra al elegir y, sin esto, no quedaba señal de que algo corría. */
  const generando = acciones?.some((a) => a.busy) ?? false;

  const panel = (open || montado) && pos && (
    <>
      {open && <div className="fixed inset-0 z-modal-2" onClick={() => setOpen(false)} aria-hidden="true" />}
      <div
        ref={panelRef}
        role="dialog"
        aria-label="Herramientas y acciones del libro"
        tabIndex={-1}
        hidden={!open}
        /* Sin overflow: los controles de arriba (la campana de avisos, el
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
        {hayHerramientas && (
          <div className="flex flex-wrap items-center gap-2">
            {children}
            {onAtajos && <BotonAtajos onClick={onAtajos} enPanel />}
          </div>
        )}
        {hayAcciones && (
          <ListaDeAcciones
            acciones={acciones}
            alElegir={(a) => {
              setOpen(false);
              a.onSelect();
            }}
          />
        )}
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
        title="Herramientas y acciones del libro: período, búsqueda, avisos, exportar, atajos"
        /* El nombre de siempre: los recorridos de qa lo buscan por él. */
        aria-label={generando ? "Herramientas del libro · generando…" : "Herramientas del libro"}
        /* Sólo ícono en todos los anchos (Brandon, 2026-09-19: «que los
           botones no ocupen mucho espacio»). 48 px como todo botón del panel
           (ADR-489). Borde de 1 px: el neutro del panel es uno solo (ADR-068). */
        className={`inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-colors ${
          open
            ? "border-[var(--accent)] bg-primary/10 text-[var(--accent-ink)] dark:text-[var(--accent)]"
            : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
        }`}
      >
        {generando ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <MoreHorizontal className="h-5 w-5" aria-hidden />}
      </button>
      {typeof document !== "undefined" && panel ? createPortal(panel, portalARef.current ?? document.body) : null}
    </>
  );
}
