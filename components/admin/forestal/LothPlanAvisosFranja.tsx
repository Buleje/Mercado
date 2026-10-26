"use client";

/**
 * Los avisos del plan en UNA franja (Brandon 26-10: «más compacto y mejor de
 * navegar»).
 *
 * Arriba del plan se apilaban hasta ocho avisos —plazos del libro, vigencia,
 * semáforo, unir con el permiso, bloques que se pasan, preliminares
 * pendientes, lo que no tiene plan— y empujaban las pestañas media pantalla
 * hacia abajo. Ahora:
 *
 *   · lo ROJO queda siempre a la vista (lo que ya te expone a una multa);
 *   · el resto (coral, azul y el «todo en regla») se pliega en una línea:
 *     «3 avisos más · Vence en 30 días · Saldo casi usado» — plegar no es
 *     esconder: el resumen dice de qué se trata cada uno;
 *   · abierto o plegado se recuerda en el navegador (`useLocalStorage`).
 *
 * Cada aviso sigue siendo el MISMO componente con su propia lectura: la franja
 * sólo los cuenta por su `data-aviso-nivel` («rojo» | «ambar» | «info» | «ok»)
 * y lee su `data-aviso-resumen`. Esconder es CSS sobre esos atributos, así que
 * ningún aviso se desmonta (sus ventanas van en portal y siguen abriendo).
 *
 * Con un solo aviso que no es rojo no se pliega nada: una línea que dice
 * «1 aviso más» ocupa lo mismo que el aviso.
 */

import { useCallback, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, ChevronDown, ChevronUp } from "@buleje/design-system/icons";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { button } from "@/components/ui-system/button-variants";

export const CLAVE_AVISOS_ABIERTOS = "loth:plan:avisos-abiertos";

/** Niveles que se pliegan: todo lo que no es rojo. */
const PLEGABLES = new Set(["ambar", "info", "ok"]);

interface Conteo {
  /** Avisos a la vista sí o sí. */
  rojos: number;
  /** Los que se pliegan (sin contar el «todo en regla»). */
  avisos: number;
  /** Su resumen, en el orden en que se pintan. */
  resumenes: string[];
  /** Hay algo que plegar, aunque sea sólo el «todo en regla». */
  plegables: number;
}

const igual = (a: Conteo | null, b: Conteo) =>
  a != null && a.rojos === b.rojos && a.avisos === b.avisos && a.plegables === b.plegables
  && a.resumenes.join("|") === b.resumenes.join("|");

export default function LothPlanAvisosFranja({ children }: { children: ReactNode }) {
  const caja = useRef<HTMLDivElement>(null);
  const [abierta, setAbierta] = useLocalStorage<boolean>(CLAVE_AVISOS_ABIERTOS, false);
  const [conteo, setConteo] = useState<Conteo | null>(null);

  /* Contar y decidir en el MISMO microtask de la mutación: el atributo
     `data-plegada` va directo al DOM (React no lo maneja), así el aviso que
     llega de un fetch no se ve un cuadro entero antes de plegarse. */
  const medir = useCallback(() => {
    const el = caja.current;
    if (!el) return;
    let rojos = 0;
    let avisos = 0;
    let plegables = 0;
    const resumenes: string[] = [];
    el.querySelectorAll<HTMLElement>("[data-aviso-nivel]").forEach((a) => {
      const nivel = a.dataset.avisoNivel ?? "";
      if (nivel === "rojo") rojos += 1;
      else if (PLEGABLES.has(nivel)) {
        plegables += 1;
        if (nivel !== "ok") {
          avisos += 1;
          const r = a.dataset.avisoResumen?.trim();
          if (r) resumenes.push(r);
        }
      }
    });
    const plegar = !abierta && avisos >= 2;
    if (plegar) el.setAttribute("data-plegada", "");
    else el.removeAttribute("data-plegada");
    const nuevo = { rojos, avisos, resumenes, plegables };
    setConteo((prev) => (igual(prev, nuevo) ? prev : nuevo));
  }, [abierta]);

  useLayoutEffect(() => {
    const el = caja.current;
    if (!el) return;
    medir();
    const mo = new MutationObserver(medir);
    mo.observe(el, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["data-aviso-nivel", "data-aviso-resumen"],
    });
    return () => mo.disconnect();
  }, [medir]);

  const plegable = (conteo?.avisos ?? 0) >= 2;
  const plegada = plegable && !abierta;
  const resumen = conteo?.resumenes.join(" · ") ?? "";

  return (
    /* Sin ningún aviso la franja no ocupa lugar (ni el hueco del espaciado). */
    <div data-avisos-franja className="flex flex-col gap-2 [&:not(:has([data-aviso-nivel]))]:hidden">
      <div
        ref={caja}
        className="flex flex-col gap-2 [&[data-plegada]:not(:has([data-aviso-nivel=rojo]))]:hidden [&[data-plegada]_[data-aviso-nivel=ambar]]:hidden [&[data-plegada]_[data-aviso-nivel=info]]:hidden [&[data-plegada]_[data-aviso-nivel=ok]]:hidden"
      >
        {children}
      </div>
      {plegable && (
        <button
          type="button"
          data-avisos-plegar={plegada ? "plegada" : "abierta"}
          aria-expanded={!plegada}
          onClick={() => setAbierta(!abierta)}
          className={button({
            variant: "ghost",
            fullWidth: true,
            className: `justify-start rounded-xl border-2 px-3 text-left font-normal ${
              plegada
                ? "border-[var(--data-warning-500)]/60 bg-[var(--data-warning-100)] text-[var(--data-warning-ink)] hover:bg-[var(--data-warning-500)]/20 dark:bg-[var(--data-warning-500)]/15"
                : "border-[var(--rule-base)] bg-[var(--surface-raised)] text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
            }`,
          })}
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {plegada ? (
            <span className="min-w-0 flex-1 truncate">
              <span className="font-bold">
                {(conteo?.rojos ?? 0) > 0 ? `${conteo?.avisos} avisos más` : `${conteo?.avisos} avisos`}
              </span>
              {resumen && <span className="font-medium"> · {resumen}</span>}
            </span>
          ) : (
            <span className="min-w-0 flex-1 font-semibold">Plegar los {conteo?.avisos} avisos</span>
          )}
          {plegada ? (
            <ChevronDown className="h-5 w-5 shrink-0" aria-hidden="true" />
          ) : (
            <ChevronUp className="h-5 w-5 shrink-0" aria-hidden="true" />
          )}
        </button>
      )}
    </div>
  );
}
