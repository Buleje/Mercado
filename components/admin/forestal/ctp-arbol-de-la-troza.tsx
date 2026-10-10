"use client";

/**
 * «Del bosque» (ADR-450 L4): la troza del Libro CTP recuerda de qué árbol
 * salió. Se lee del Libro TH con el estado de sus líneas —una tala anulada se
 * cuenta como historia— y lleva al mapa del bosque parado en ese árbol.
 *
 * Tres piezas: el bloque (ficha y tarjeta de la troza), el chip «Árbol 113»
 * (patio) y el salto al mapa. Lo que dice cada renglón sale de
 * `renglonesDelBosque` (puro, con test).
 */

import Link from "next/link";
import { Map as MapIcon, Trees } from "@buleje/design-system/icons";
import { cn } from "@/lib/utils";
import { fraseDelArbol, type ArbolDeTroza } from "@/lib/forestal/arbol-de-troza";
import { arbolConHistoria, renglonesDelBosque, urlDelArbolEnElMapa } from "@/lib/forestal/tarjeta-troza";
import { LOTH_TAB_ID } from "./loth-mapa-tala-url";
import { Hito } from "./ctp-troza-ficha-partes";

/**
 * Ir al mapa del Libro TH, parado en el árbol. Dentro del panel, sin recargar
 * (la receta de `ficha-del-permiso-url`: `admin:navigate` y después los
 * parámetros propios, que `navigateTab` borraría); fuera del panel (el patio,
 * `/admin/patio`), navegando de verdad.
 */
export function irAlArbolEnElMapa(codigo: string): void {
  const enElPanel = /\/admin\/?$/.test(window.location.pathname);
  if (!enElPanel) {
    window.location.assign(urlDelArbolEnElMapa(codigo));
    return;
  }
  const destino = urlDelArbolEnElMapa(codigo, window.location.pathname);
  if (new URLSearchParams(window.location.search).get("tab") === LOTH_TAB_ID) {
    window.history.pushState(null, "", destino);
  } else {
    window.dispatchEvent(new CustomEvent("admin:navigate", { detail: { tab: LOTH_TAB_ID, vista: "mapa" } }));
    window.history.replaceState(null, "", destino);
  }
  window.dispatchEvent(new PopStateEvent("popstate"));
}

const BOTON_MAPA =
  "mt-1.5 inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--accent-ink)] transition-colors hover:border-[var(--accent)] dark:text-[var(--accent)] sm:h-9";

/** Los renglones y el salto al mapa; lo comparten la ficha y la tarjeta. */
function Renglones({ arbol, comoEnlace }: { arbol: ArbolDeTroza; comoEnlace?: boolean }) {
  return (
    <>
      <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
        {renglonesDelBosque(arbol).map((r) => (
          <div key={r.rotulo} className="contents">
            <dt className="text-[var(--text-secondary)]">{r.rotulo}:</dt>
            <dd className={cn("font-medium", r.aviso ? "text-[var(--data-warning-ink)]" : "text-[var(--text-primary)]")}>{r.valor}</dd>
          </div>
        ))}
      </dl>
      {arbol.mapa &&
        (comoEnlace ? (
          <Link href={urlDelArbolEnElMapa(arbol.arbolCodigo)} className={BOTON_MAPA}>
            <MapIcon className="h-4 w-4" aria-hidden /> Ver en el mapa del bosque
          </Link>
        ) : (
          <button type="button" onClick={() => irAlArbolEnElMapa(arbol.arbolCodigo)} className={BOTON_MAPA}>
            <MapIcon className="h-4 w-4" aria-hidden /> Ver en el mapa del bosque
          </button>
        ))}
    </>
  );
}

/**
 * El hito «Del bosque» de la ficha (primero en la historia: el árbol es lo
 * que pasó antes de la guía). Sin `arbol` pero con el código copiado al
 * recibir, igual se nombra el árbol: su línea del Libro TH no se encontró.
 * Sin ninguno de los dos, la troza no vino del Libro TH y no se dibuja nada.
 */
export function HitoDelBosque({ arbol, arbolCodigo }: { arbol: ArbolDeTroza | null | undefined; arbolCodigo: string | null | undefined }) {
  if (!arbol) {
    if (!arbolCodigo) return null;
    return (
      <Hito icono={Trees} ocurrio tono="warn" titulo={`Salió del árbol ${arbolCodigo}`}>
        <p>No se encontró su línea de Trozado en el Libro TH: queda el código del árbol que viajó en la guía.</p>
      </Hito>
    );
  }
  return (
    <Hito icono={Trees} ocurrio tono={arbolConHistoria(arbol) ? "warn" : "ok"} titulo={fraseDelArbol(arbol)}>
      <Renglones arbol={arbol} />
    </Hito>
  );
}

/** El mismo bloque, para la tarjeta del QR (`/admin/q/<id>`): fuera del panel, con enlace de verdad. */
export function BloqueDelBosque({ arbol, arbolCodigo }: { arbol: ArbolDeTroza | null | undefined; arbolCodigo: string | null | undefined }) {
  if (!arbol && !arbolCodigo) return null;
  return (
    <section aria-labelledby="del-bosque-titulo" className="flex gap-3 px-4 py-3 text-sm sm:px-5" data-del-bosque>
      <Trees className="mt-0.5 h-5 w-5 shrink-0 text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-bold uppercase tracking-[var(--ls-wider)] text-[var(--text-tertiary)]">Del bosque</p>
        <p id="del-bosque-titulo" className="text-base font-bold text-[var(--text-primary)]">
          {arbol ? fraseDelArbol(arbol) : `Salió del árbol ${arbolCodigo}`}
        </p>
        {arbol ? (
          <div className="mt-1">
            <Renglones arbol={arbol} comoEnlace />
          </div>
        ) : (
          <p className="text-[var(--text-secondary)]">No se encontró su línea de Trozado en el Libro TH.</p>
        )}
      </div>
    </section>
  );
}

/** «Árbol 113»: el chip del patio. Sin código, nada. */
export function ChipArbol({ codigo, className }: { codigo: string | null | undefined; className?: string }) {
  const c = codigo?.trim();
  if (!c) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full bg-[var(--data-success-500)]/12 px-2.5 py-0.5 text-sm font-bold text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]",
        className,
      )}
      data-chip-arbol={c}
    >
      <Trees className="h-4 w-4" aria-hidden /> Árbol {c}
    </span>
  );
}
