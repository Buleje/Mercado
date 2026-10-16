"use client";

/**
 * La lupa de las hojas «como el papel» de «Datos de la GTF» (Brandon 16-10:
 * «que la guía tenga tipo lupa y otros para poder ver la guía más en una hoja
 * más amplia y completa»): una barra chica arriba de la hoja con «−», el % y
 * «+», «Ajustar al ancho» y «Hoja completa» (la hoja ENTERA en el alto
 * visible, de un vistazo como el papel), y debajo el visor gris con la hoja.
 *
 * Atajos sobre la hoja o la barra: Ctrl/⌘ + rueda y Ctrl/⌘ + «+», «−», «0».
 * El scroll queda adentro del visor (la página no se desborda a 400 px).
 * La lógica de la escala vive en `hooks/use-lupa-papel.ts`.
 *
 * `GtfHojaGrande` abre la misma hoja a pantalla completa, con proporción A4 y
 * margen de papel, sobre el modal de «Datos» (`aboveModals`).
 *
 * Sólo «Datos de la GTF» la usa: la vista previa de «Importar guías» dibuja
 * los mismos bloques SIN lupa (`LothImportarGuiasBloques` no la conoce).
 */

import type { ReactNode } from "react";
import { ArrowLeftRight, Fullscreen, Scan, ZoomIn, ZoomOut } from "@buleje/design-system/icons";
import AdminModal from "@/components/admin/shared/AdminModal";
import { button } from "@/components/ui-system/button-variants";
import { useLupaPapel, type LupaPapel, type ModoLupa } from "@/hooks/use-lupa-papel";
import { cn } from "@/lib/utils";

/**
 * El ancho del papel en pantalla (px sin escalar). A 1280 el visor del modal
 * deja ~1125 px: la hoja se ve como antes de la lupa. En una pantalla más
 * ancha la hoja no se estira (se desarmaría la proporción del papel): crece
 * con «Ajustar al ancho». Medido 16-10 en la GTF 020-001-0000771: a 1181 px la
 * guía mide 1672 px de alto, justo la proporción de una A4.
 */
export const ANCHO_PAPEL = 1180;
/** A4 = 210 × 297 mm. */
const PROPORCION_A4 = 297 / 210;
/** El margen blanco del papel en la hoja grande: `p-8` = 32 px ≈ 8 mm a 96 ppp; en el celular, `p-3` (con 32 se comía el 20 % del ancho). */
const MARGEN_HOJA = 32;

const ICONO = "h-5 w-5";
/** Los botones de la barra: los del panel (48 px, ADR-489); a 400 px sólo el ícono. */
const BOTON_MODO = cn(
  button({ variant: "secondary" }),
  "max-sm:w-12 max-sm:px-0",
  "aria-pressed:border-[var(--accent)] aria-pressed:bg-[var(--accent-soft)]",
);

/** La barra de la lupa. `extra` va a la derecha (el «Ver en hoja grande» del modal). */
function BarraLupa({ lupa, extra }: { lupa: LupaPapel; extra?: ReactNode }) {
  const icono = cn(button({ variant: "ghost", size: "icon" }), "text-[var(--text-primary)]");
  return (
    <div className="flex shrink-0 flex-wrap items-center gap-2">
      <div className="flex items-center rounded-full border border-[var(--rule-base)] bg-[var(--surface-raised)]">
        <button type="button" onClick={lupa.alejar} disabled={!lupa.puedeAlejar} aria-label="Alejar la hoja" title="Alejar (Ctrl + −)" className={icono}>
          <ZoomOut className={ICONO} aria-hidden />
        </button>
        <button
          type="button"
          onClick={lupa.normal}
          aria-label={`${lupa.pct} %: volver a 100 %`}
          title="Tamaño normal (Ctrl + 0)"
          className="h-12 w-16 rounded-full text-center text-sm font-semibold tabular-nums text-[var(--text-primary)] hover:bg-[var(--surface-sunken)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        >
          {lupa.pct} %
        </button>
        <button type="button" onClick={lupa.acercar} disabled={!lupa.puedeAcercar} aria-label="Acercar la hoja" title="Acercar (Ctrl + +)" className={icono}>
          <ZoomIn className={ICONO} aria-hidden />
        </button>
      </div>
      <span className="sr-only" aria-live="polite">
        Lupa al {lupa.pct} %
      </span>
      <button
        type="button"
        onClick={lupa.ajustarAncho}
        aria-pressed={lupa.modo === "ancho"}
        aria-label="Ajustar al ancho"
        title="La hoja al ancho de la ventana"
        className={BOTON_MODO}
      >
        <ArrowLeftRight className={ICONO} aria-hidden />
        <span className="max-sm:hidden">Ajustar al ancho</span>
      </button>
      <button
        type="button"
        onClick={lupa.hojaCompleta}
        aria-pressed={lupa.modo === "completa"}
        aria-label="Hoja completa"
        title="La hoja entera en el alto visible, de un vistazo"
        className={BOTON_MODO}
      >
        <Scan className={ICONO} aria-hidden />
        <span className="max-sm:hidden">Hoja completa</span>
      </button>
      {extra && <div className="ml-auto flex">{extra}</div>}
    </div>
  );
}

/**
 * La barra y el visor con la hoja adentro. `clave` = dónde se recuerda el % (una
 * por pestaña); `hoja` = papel A4 con margen y sombra (la hoja grande).
 */
export default function GtfDatosLupa({
  clave,
  etiqueta,
  hoja = false,
  inicial,
  extra,
  children,
}: {
  clave: string;
  /** Qué hoja es («GTF 020-001-0000771»): nombra el visor para el lector de pantalla. */
  etiqueta: string;
  hoja?: boolean;
  inicial?: ModoLupa;
  extra?: ReactNode;
  children: ReactNode;
}) {
  const margen = hoja ? MARGEN_HOJA : 0;
  const lupa = useLupaPapel({ clave, anchoMax: ANCHO_PAPEL + 2 * margen, inicial });
  const { escala, anchoHoja, altoHoja } = lupa;
  /* Antes de la primera medida la hoja va a su ancho natural: no hay salto, se mide antes de pintar. */
  const medida = anchoHoja != null && altoHoja > 0;
  return (
    <div role="group" aria-label={`Lupa de la hoja ${etiqueta}`} onKeyDown={lupa.onKeyDown} className="flex min-h-0 flex-1 flex-col gap-2">
      <BarraLupa lupa={lupa} extra={extra} />
      {/* El carril de la barra de scroll queda reservado (`scrollbar-gutter`): el ancho útil no cambia al aparecer el scroll. */}
      <div
        ref={lupa.visorRef}
        role="region"
        aria-label={`Hoja ${etiqueta}`}
        tabIndex={0}
        className={cn(
          "relative min-h-[16rem] flex-1 overflow-auto rounded-xl border border-[var(--rule-base)] [scrollbar-gutter:stable_both-edges]",
          "bg-[var(--rule-base)] dark:bg-[var(--surface-canvas)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
          hoja ? "p-3 sm:p-6" : "p-2 sm:p-3",
        )}
      >
        <div
          ref={lupa.medidorRef}
          className={cn("mx-auto overflow-hidden", hoja && "bg-[var(--gtf-papel)] shadow-[var(--shadow-lg)]")}
          style={medida ? { width: anchoHoja * escala, height: altoHoja * escala } : undefined}
        >
          <div
            ref={lupa.hojaRef}
            className={cn("origin-top-left space-y-3", hoja && "p-3 sm:p-8")}
            style={{
              width: anchoHoja ?? undefined,
              minHeight: hoja && anchoHoja ? Math.round(anchoHoja * PROPORCION_A4) : undefined,
              transform: escala === 1 ? undefined : `scale(${escala})`,
            }}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

/** La hoja a pantalla completa, sobre el modal de «Datos»: el papel A4 sobre la mesa gris, con la misma lupa. */
export function GtfHojaGrande({ titulo, clave, onClose, children }: { titulo: string; clave: string; onClose: () => void; children: ReactNode }) {
  return (
    <AdminModal open onClose={onClose} aboveModals variant="fullscreen" icon={Fullscreen} title={titulo}>
      <div className="flex h-full flex-col px-3 py-3 sm:px-6 sm:py-4">
        <GtfDatosLupa clave={clave} etiqueta={titulo} hoja>
          {children}
        </GtfDatosLupa>
      </div>
    </AdminModal>
  );
}
