"use client";

/**
 * La barra de pasos de un formulario largo y el «Anterior / Siguiente» de abajo
 * (Brandon 24-10: «ir bloque a bloque»). Nació en el alta del plan de manejo y
 * se usa igual en la ficha del Directorio: cada paso dice cómo está —completo
 * (✓), con algo mal (!), con algo por cargar (!) u opcional (○)— y se puede
 * saltar a cualquiera: la barra ordena, no encierra. Los pasos escondidos
 * quedan montados (`hidden`), así no se pierde nada de lo escrito.
 */

import { useEffect, useRef, type MouseEvent } from "react";
import { AlertCircle, AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2, Circle } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";

export type EstadoDePaso = "completo" | "falta" | "pendiente" | "opcional";

export interface PasoDeLaBarra<Id extends string = string> {
  id: Id;
  /** El rótulo corto (entra en un botón angosto). */
  corto: string;
  estado: EstadoDePaso;
}

/* «Falta» y «pendiente» con FORMA distinta, no sólo color: en oscuro el ámbar
   del panel es coral (#ff8676) y el rojo #f87171 — dos triángulos se leían
   iguales (medido 24-10 en la ficha del Directorio). */
const ICONO: Record<EstadoDePaso, typeof Circle> = {
  completo: CheckCircle2,
  falta: AlertCircle,
  pendiente: AlertTriangle,
  opcional: Circle,
};

const TONO_ICONO: Record<EstadoDePaso, string> = {
  completo: "text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
  falta: "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
  pendiente: "text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
  opcional: "text-[var(--text-tertiary)]",
};

const LEIDO: Record<EstadoDePaso, string> = {
  completo: "completo",
  falta: "falta algo",
  pendiente: "le falta algo recomendado",
  opcional: "opcional",
};

/**
 * Los márgenes negativos que pegan la barra al borde de su contenedor: tienen
 * que ser los mismos que su padding, o la línea de abajo no llega de lado a lado.
 */
export const BORDE_DE_LA_BARRA = {
  /** Un `<form className="p-5">`, como el alta del plan. */
  formulario: "-mx-5 -mt-5 px-5",
  /** El `ModalBody` / `MODAL_BODY` de `AdminModal` (`py-5 px-5 sm:px-6`). */
  modal: "-mx-5 -mt-5 px-5 sm:-mx-6 sm:px-6",
} as const;

/** Al cambiar de paso se sube al principio: el paso nuevo se lee desde su título. */
function subirAlPrincipio(desde: HTMLElement) {
  for (let el = desde.parentElement; el; el = el.parentElement) {
    const oy = getComputedStyle(el).overflowY;
    if ((oy === "auto" || oy === "scroll") && el.scrollHeight > el.clientHeight) {
      el.scrollTop = 0;
      return;
    }
  }
}

/** Arriba del formulario, pegada al borde: queda a la vista aunque el paso sea largo. */
export function BarraDePasos<Id extends string>({
  pasos,
  actual,
  onIr,
  etiqueta,
  borde = "formulario",
}: {
  pasos: readonly PasoDeLaBarra<Id>[];
  actual: Id;
  onIr: (id: Id) => void;
  /** El nombre del `<nav>`: «Pasos del plan», «Pasos de la ficha». */
  etiqueta: string;
  borde?: keyof typeof BORDE_DE_LA_BARRA;
}) {
  /* En el celular la barra no entra (856 px en 400): el paso actual se trae a la vista. */
  const lista = useRef<HTMLOListElement>(null);
  useEffect(() => {
    const ol = lista.current;
    const b = ol?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!ol || !b || ol.scrollWidth <= ol.clientWidth) return;
    const x = b.offsetLeft - ol.offsetLeft;
    if (x < ol.scrollLeft) ol.scrollLeft = Math.max(0, x - 8);
    else if (x + b.offsetWidth > ol.scrollLeft + ol.clientWidth) ol.scrollLeft = x + b.offsetWidth - ol.clientWidth + 8;
  }, [actual]);
  const ir = (id: Id) => (e: MouseEvent<HTMLButtonElement>) => {
    if (id !== actual) subirAlPrincipio(e.currentTarget);
    onIr(id);
  };
  return (
    <nav
      aria-label={etiqueta}
      className={`sticky top-0 z-10 ${BORDE_DE_LA_BARRA[borde]} border-b border-[var(--rule-base)] bg-[var(--surface-raised)] py-2`}
    >
      <ol ref={lista} className="flex gap-1.5 overflow-x-auto pb-0.5">
        {pasos.map((p, i) => {
          const Icono = ICONO[p.estado];
          const esActual = p.id === actual;
          return (
            <li key={p.id} className="shrink-0">
              <button
                type="button"
                onClick={ir(p.id)}
                aria-current={esActual ? "step" : undefined}
                data-paso-estado={p.estado}
                className={`inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-xl border px-3 text-sm font-semibold transition-colors ${
                  esActual
                    ? "border-[var(--accent)] bg-primary/10 ring-1 ring-[var(--accent)] text-[var(--accent-ink)] dark:text-[var(--accent)]"
                    : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Icono className={`h-4 w-4 shrink-0 ${TONO_ICONO[p.estado]}`} aria-hidden="true" />
                {i + 1}. {p.corto}
                <span className="sr-only"> ({LEIDO[p.estado]})</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

const BOTON = button({ variant: "secondary", className: "rounded-xl" });

/** Al final de cada paso: volver o seguir, diciendo a dónde. «Guardar» está siempre en el pie. */
export function AnteriorSiguiente<Id extends string>({
  pasos,
  actual,
  onIr,
}: {
  pasos: readonly Pick<PasoDeLaBarra<Id>, "id" | "corto">[];
  actual: Id;
  onIr: (id: Id) => void;
}) {
  const i = pasos.findIndex((p) => p.id === actual);
  const anterior = i > 0 ? pasos[i - 1] : undefined;
  const siguiente = i >= 0 && i < pasos.length - 1 ? pasos[i + 1] : undefined;
  if (!anterior && !siguiente) return null;
  const ir = (id: Id) => (e: MouseEvent<HTMLButtonElement>) => {
    subirAlPrincipio(e.currentTarget);
    onIr(id);
  };
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-[var(--rule-soft)] pt-4">
      {anterior && (
        <button type="button" onClick={ir(anterior.id)} className={BOTON}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {anterior.corto}
        </button>
      )}
      {siguiente && (
        <button type="button" onClick={ir(siguiente.id)} className={`${BOTON} ml-auto`}>
          Siguiente: {siguiente.corto} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
