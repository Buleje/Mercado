"use client";

/**
 * El mapa de los bloques arriba de las tarjetas (Brandon 26-10): una tira con un
 * tramo por bloque, ancho según sus m³ autorizados y en su tono, con la insignia
 * y una marca si se pasa (triángulo) o tiene preliminar (reloj). Tocar un tramo baja a su tarjeta.
 * Con 1 bloque no se pinta: no hay nada que comparar.
 */

import { AlertTriangle, Clock } from "@buleje/design-system/icons";
import { button } from "@/components/ui-system/button-variants";
import { fmtM3 } from "@/lib/forestal/cubicacion-formato";
import { InsigniaDelBloque, varDeTono } from "./LothPlanBloqueBarra";
import { ESTADO_DEL_BLOQUE, idDeBloque, insigniaDelBloque, type EstadoDelBloque } from "./loth-plan-bloque-visual";

export interface BloqueDelMapa {
  nombre: string;
  tono: string;
  m3: number;
  estado?: EstadoDelBloque;
}

/* Forma distinta, no sólo color: en oscuro el coral de «preliminar» y el rojo de «se pasa» casi no se distinguen. */
const MARCA: Partial<Record<EstadoDelBloque, { Icono: typeof AlertTriangle; clase: string }>> = {
  se_pasa: { Icono: AlertTriangle, clase: "text-[var(--data-error-ink)]" },
  preliminar: { Icono: Clock, clase: "text-[var(--data-warning-ink)]" },
};

/* Dos cuadros: si la sección estaba plegada, primero se despliega y recién ahí hay tarjeta a la que bajar. */
function irA(nombre: string) {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      const el = document.getElementById(idDeBloque(nombre));
      if (!el) return;
      const quieto = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      el.scrollIntoView({ behavior: quieto ? "auto" : "smooth", block: "start" });
    }),
  );
}

export default function LothPlanBloquesMapa({ bloques, onAntesDeIr }: {
  bloques: readonly BloqueDelMapa[];
  /** La sección plegada se abre antes de bajar a la tarjeta. */
  onAntesDeIr?: () => void;
}) {
  if (bloques.length < 2) return null;
  return (
    <nav aria-label="Bloques del plan" className="flex gap-1.5">
      {bloques.map((b) => {
        const estado = b.estado ? ESTADO_DEL_BLOQUE[b.estado].texto : null;
        const marca = b.estado ? MARCA[b.estado] : undefined;
        return (
          <button
            key={b.nombre}
            type="button"
            onClick={() => {
              onAntesDeIr?.();
              irA(b.nombre);
            }}
            title={`${b.nombre} · ${fmtM3(b.m3)} m³${estado ? ` · ${estado}` : ""}`}
            aria-label={`Ir a ${b.nombre}: ${fmtM3(b.m3)} m³${estado ? `, ${estado.toLowerCase()}` : ""}`}
            style={{ ...varDeTono(b.tono), flex: `${Math.max(b.m3, 0.001)} 1 0%`, background: "color-mix(in oklab, var(--bloque) 14%, var(--surface-canvas))" }}
            className={button({
              variant: "ghost",
              className: "@container min-w-12 justify-start overflow-hidden rounded-lg border-b-4 border-[var(--bloque)] px-2 text-left font-normal hover:brightness-95 dark:hover:brightness-110",
            })}
          >
            {/* La marca va en la esquina de la insignia: entra igual con 6 bloques a 400 px. */}
            <span className={`relative shrink-0 ${marca ? "mr-2" : ""}`}>
              <InsigniaDelBloque texto={insigniaDelBloque(b.nombre)} tono={b.tono} />
              {marca && (
                <span aria-hidden="true" className="absolute -right-2 -top-1.5 inline-flex rounded-full bg-[var(--surface-canvas)] p-px">
                  <marca.Icono className={`h-4 w-4 ${marca.clase}`} />
                </span>
              )}
            </span>
            {/* Nombre y m³ sólo si el tramo tiene ancho: a 400 px con 6 bloques queda la insignia sola. */}
            <span className="hidden min-w-0 flex-col leading-tight @[8.5rem]:flex">
              <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{b.nombre}</span>
              <span className="truncate font-mono text-xs tabular-nums text-[var(--text-secondary)]">{fmtM3(b.m3)} m³</span>
            </span>
          </button>
        );
      })}
    </nav>
  );
}
