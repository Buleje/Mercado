"use client";

/**
 * ContratoActivoChip — el permiso de trabajo, en la banda del libro.
 *
 * Pedido de Brandon (2026-09-19, señalando la banda del LO-TH): elegir el
 * contrato ahí mismo, rápido, y que quede fijo para toda la página y para las
 * operaciones que registre, pudiendo cambiarlo y que se aplique a todo.
 *
 * ## Por qué un chip y no un desplegable más en cada formulario
 *
 * Porque el permiso no es un campo de un formulario: es bajo qué papel está
 * parado el que trabaja. Puesto en la banda se ve siempre —incluso mientras se
 * registra en otra pantalla— y se cambia en un clic. Los cinco formularios
 * siguen usando `SelectorContrato`; lo que este chip les da es el valor
 * propuesto ([[contrato-como-eje-adr421]]: sugiere, no pisa lo que el documento
 * ya trae).
 *
 * ## La lista se pide al abrir, no al montar
 *
 * El chip se pinta con lo guardado en `localStorage`, así que un libro que
 * nunca abre el menú no gasta una llamada. Al abrirlo se pide la lista y, de
 * paso, se refresca el cartel: si el permiso cambió de titular, el chip deja de
 * mostrar el nombre viejo.
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, FileText, TriangleAlert } from "@buleje/design-system/icons";
import { useContratoActivo, type ContratoActivo } from "@/contexts/contrato-activo-context";
import { useContratos } from "@/hooks/use-contratos";

/** Un contrato vencido no debería seguir recibiendo operaciones sin que se vea. */
function estaVencido(vigenciaHasta: string | null): boolean {
  if (!vigenciaHasta) return false;
  const hasta = new Date(vigenciaHasta);
  if (Number.isNaN(hasta.getTime())) return false;
  return hasta.getTime() < Date.now();
}

export default function ContratoActivoChip({
  enGrupo = false,
}: {
  /**
   * Dentro de `BandaPermiso` (LO-CTP), pegado a «Solo este permiso»: el borde
   * lo pone el grupo y el chip sólo redondea su lado izquierdo. Los dos son UN
   * control —qué permiso y si se filtra por él— y se leen como uno.
   */
  enGrupo?: boolean;
} = {}) {
  const { activo, fijar, listo } = useContratoActivo();
  const [abierto, setAbierto] = useState(false);
  const caja = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  /* El menú va en un portal: la tarjeta del libro tiene `overflow-hidden` para
     su borde redondeado y recortaba la lista a media altura (visto a 400 px,
     2026-09-19). Por eso se posiciona a mano contra el rect del botón. */
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number; maxHeight: number } | null>(null);

  const ubicar = useCallback(() => {
    const r = boton.current?.getBoundingClientRect();
    if (!r) return;
    const MARGEN = 12;
    const abajo = window.innerHeight - r.bottom - MARGEN;
    const arriba = r.top - MARGEN;
    /* A 400 px el menú entero (332 px) no entra debajo del chip y se salía de la
       ventana. Si abajo no hay lugar y arriba hay más, se abre hacia arriba; en
       cualquier caso el alto se acota al espacio real y la lista scrollea. */
    const haciaArriba = abajo < 220 && arriba > abajo;
    /* Anclar sólo por el borde derecho del chip empujaba el menú fuera de la
       pantalla por la IZQUIERDA (medido a 400 px: left = -172). El ancla se
       acota para que el menú entre entero: nunca más a la izquierda de 8 px. */
    const ancho = Math.min(384, window.innerWidth - 16); // 24rem, o lo que haya
    const right = Math.min(
      Math.max(8, window.innerWidth - r.right),
      Math.max(8, window.innerWidth - ancho - 8),
    );
    setPos(
      haciaArriba
        ? { bottom: window.innerHeight - r.top + 4, right, maxHeight: Math.max(160, arriba) }
        : { top: r.bottom + 4, right, maxHeight: Math.max(160, abajo) },
    );
  }, []);

  useLayoutEffect(() => {
    if (!abierto) return;
    ubicar();
    window.addEventListener("resize", ubicar);
    // `true` = fase de captura: el scroll que importa es el del contenedor
    // interno del panel, que no burbujea hasta window.
    window.addEventListener("scroll", ubicar, true);
    return () => {
      window.removeEventListener("resize", ubicar);
      window.removeEventListener("scroll", ubicar, true);
    };
  }, [abierto, ubicar]);

  // La lista sólo se pide cuando de verdad se va a mostrar.
  const { contratos, cargando, error } = useContratos();

  const vencidoElActivo = useMemo(() => {
    const c = contratos.find((x) => x.id === activo?.id);
    return c ? estaVencido(c.vigenciaHasta) : false;
  }, [contratos, activo?.id]);

  /* El cartel guardado puede haber quedado viejo (el permiso cambió de titular
     o de código). Cuando la lista llega, el chip se pone al día solo. */
  useEffect(() => {
    if (!activo || cargando || contratos.length === 0) return;
    const real = contratos.find((c) => c.id === activo.id);
    if (!real) return;
    const titular = real.alias ?? real.titularNombre ?? null;
    if (real.codigo !== activo.codigo || titular !== activo.titular) {
      fijar({ id: real.id, codigo: real.codigo, titular });
    }
  }, [contratos, cargando, activo, fijar]);

  useEffect(() => {
    if (!abierto) return;
    const afuera = (e: MouseEvent) => {
      const t = e.target as Node;
      /* El menú vive en un portal, fuera de `caja`: sin mirarlo también, el
         mousedown sobre una opción contaba como «afuera», cerraba el menú y el
         click nunca llegaba a la opción — el selector no seleccionaba nada. */
      if (caja.current?.contains(t) || menu.current?.contains(t)) return;
      setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setAbierto(false);
      }
    };
    document.addEventListener("mousedown", afuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", afuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const elegir = (c: ContratoActivo | null) => {
    fijar(c);
    setAbierto(false);
  };

  if (!listo) {
    // Reserva el alto exacto: sin esto la banda salta cuando llega el valor.
    return <div className="h-10 w-[11rem]" aria-hidden="true" />;
  }

  return (
    <div ref={caja} className="relative flex min-w-0">
      <button
        ref={boton}
        type="button"
        onClick={() => setAbierto((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={abierto}
        title={
          activo
            ? `Trabajando bajo ${activo.codigo}${activo.titular ? ` · ${activo.titular}` : ""}. Se propone en cada operación que registres. Clic para cambiarlo.`
            : "Ningún permiso fijado: cada operación te va a pedir el suyo. Clic para elegir uno."
        }
        /* Mismo lenguaje que el chip de carátula del LO-TH (ADR-068): con dato
           es un borde neutro de 1 px; sin dato, aviso de 2 px (en grupo, el
           borde lo pone `BandaPermiso`).
           El titular ya no depende del ancho de la VENTANA (`min-[1800px]`
           mentía con la barra lateral abierta): va con `basis-0`, así que sólo
           ocupa lo que sobra después del código y es lo primero que cede
           cuando la banda aprieta; con menos de 46rem de grupo se esconde
           entero (un «C…» suelto no dice nada). El código se corta último. */
        className={`inline-flex min-w-0 max-w-[24rem] items-center gap-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] ${
          enGrupo
            ? `h-full rounded-l-[11px] px-2.5 hover:bg-[var(--surface-canvas)] ${activo ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"}`
            : activo
              ? "h-10 rounded-xl border border-[var(--rule-base)] px-3 bg-[var(--surface-raised)] text-[var(--text-primary)] hover:bg-[var(--surface-canvas)]"
              : "h-10 rounded-xl border-2 border-dashed px-3 border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-canvas)]"
        }`}
      >
        <FileText className="h-4 w-4 shrink-0" aria-hidden="true" />
        {activo ? (
          <>
            <span className="min-w-0 shrink truncate font-mono text-xs font-bold tabular-nums">{activo.codigo}</span>
            {activo.titular && (
              <span className="min-w-0 flex-1 basis-0 truncate text-[var(--text-tertiary)] max-lg:hidden @max-[46rem]/acciones:hidden">
                {activo.titular}
              </span>
            )}
            {vencidoElActivo && (
              <TriangleAlert
                className="h-3.5 w-3.5 shrink-0 text-[var(--data-warning-600)]"
                aria-label="El permiso está vencido"
              />
            )}
          </>
        ) : (
          <span className="truncate">Elegir permiso</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {abierto && pos && createPortal(
        <div
          ref={menu}
          role="listbox"
          aria-label="Permiso de trabajo"
          style={{ top: pos.top, bottom: pos.bottom, right: pos.right, maxHeight: pos.maxHeight }}
          className="fixed z-[70] w-[24rem] max-w-[calc(100vw-1rem)] overflow-y-auto rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-1.5 shadow-lg"
        >
          <p className="px-2.5 pb-1.5 pt-1 text-xs text-[var(--text-tertiary)]">
            Lo que elijas queda fijo en todo el panel y se propone en cada operación que registres.
          </p>

          <button
            type="button"
            role="option"
            aria-selected={!activo}
            onClick={() => elegir(null)}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-[var(--surface-sunken)]"
          >
            <Check className={`h-4 w-4 shrink-0 ${activo ? "opacity-0" : "opacity-100"}`} aria-hidden="true" />
            <span>Sin permiso fijo</span>
            <span className="ml-auto text-xs text-[var(--text-tertiary)]">cada operación pide el suyo</span>
          </button>

          {cargando && (
            <p className="px-2.5 py-3 text-sm text-[var(--text-tertiary)]">Cargando permisos…</p>
          )}
          {error && !cargando && (
            <p className="px-2.5 py-3 text-sm text-[var(--data-error-600)]">{error}</p>
          )}
          {!cargando && !error && contratos.length === 0 && (
            <p className="px-2.5 py-3 text-sm text-[var(--text-tertiary)]">
              Todavía no hay permisos cargados. Se cargan en Libro CTP · Contratos.
            </p>
          )}

          {contratos.map((c) => {
            const elegido = c.id === activo?.id;
            const vencido = estaVencido(c.vigenciaHasta);
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={elegido}
                onClick={() => elegir({ id: c.id, codigo: c.codigo, titular: c.alias ?? c.titularNombre ?? null })}
                className="flex w-full items-start gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-[var(--surface-sunken)]"
              >
                <Check
                  className={`mt-0.5 h-4 w-4 shrink-0 ${elegido ? "opacity-100" : "opacity-0"}`}
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-mono text-xs font-bold tabular-nums text-[var(--text-primary)]">
                    {c.codigo}
                  </span>
                  <span className="block truncate text-xs text-[var(--text-tertiary)]">
                    {c.alias ?? c.titularNombre}
                    {c.tipo ? ` · ${c.tipo}` : ""}
                  </span>
                </span>
                {vencido && (
                  <span className="mt-0.5 shrink-0 rounded-md bg-[var(--data-warning-50)] px-1.5 py-0.5 text-[length:var(--ts-2xs)] font-semibold text-[var(--data-warning-700)] dark:bg-[var(--data-warning-500)]/12 dark:text-[var(--data-warning-500)]">
                    vencido
                  </span>
                )}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}
