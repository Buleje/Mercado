"use client";

/**
 * Una fila de secciones para pasar de una a otra dentro de una vista, con el
 * mismo aspecto que la barra de Caja (`caja/CajaSecciones.tsx`), pero sin los
 * grupos: una lista plana. Brandon (10-10): «organizar tipo en pestaña, hacer
 * sección para pasar de una a otra para organizarme mejor».
 *
 * Teclado: ← → recorren las secciones (patrón ARIA de tabs), Inicio/Fin van a
 * la primera y a la última. A 400 px el carril se desplaza y la elegida queda a
 * la vista (con `scrollLeft` del carril, no `scrollIntoView`: no mueve la página).
 * Quién la usa decide dónde se recuerda la última (normalmente `?sub=`).
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/utils";

export interface SeccionDeBarra<T extends string> {
  clave: T;
  rotulo: string;
  /** Una cifra chica al lado del rótulo (cuántos hay que mirar ahí). */
  cuenta?: number;
}

interface Props<T extends string> {
  secciones: readonly SeccionDeBarra<T>[];
  activa: T;
  onCambiar: (clave: T) => void;
  /** Para el lector de pantalla: «Secciones de Me deben». */
  etiqueta: string;
  /** El `id` del panel que cambia (el `tabpanel`); cada pestaña lo controla. */
  idPanel: string;
  /**
   * «alerta» (por defecto): la cifra en rojo, sólo si hay algo que mirar.
   * «neutro»: cuántas hay en cada sección (la libreta), en gris y también el 0.
   */
  tonoCuenta?: "alerta" | "neutro";
}

export const idPestanaDeSeccion = (idPanel: string, clave: string) => `${idPanel}-pestana-${clave}`;

/* Sólo un clic o una flecha mueven el foco a la elegida; al cargar la página no. */
let enfocarActiva = false;

export function BarraDeSecciones<T extends string>({ secciones, activa, onCambiar, etiqueta, idPanel, tonoCuenta = "alerta" }: Props<T>) {
  const carril = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const c = carril.current;
    if (!c) return;
    const centrar = () => {
      const elegida = c.querySelector<HTMLElement>('[aria-selected="true"]');
      if (!elegida || c.scrollWidth <= c.clientWidth) return;
      const rc = c.getBoundingClientRect();
      const ra = elegida.getBoundingClientRect();
      c.scrollLeft += ra.left + ra.width / 2 - (rc.left + rc.width / 2);
    };
    centrar();
    if (enfocarActiva) {
      enfocarActiva = false;
      c.querySelector<HTMLElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    }
    const obs = new ResizeObserver(centrar);
    obs.observe(c);
    return () => obs.disconnect();
  }, [activa]);

  const ir = (clave: T) => {
    if (clave === activa) return;
    enfocarActiva = true;
    onCambiar(clave);
  };

  const alTeclear = (e: KeyboardEvent<HTMLDivElement>) => {
    const i = secciones.findIndex((s) => s.clave === activa);
    const ultima = secciones.length - 1;
    const destino =
      e.key === "ArrowRight" ? i + 1 : e.key === "ArrowLeft" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? ultima : null;
    if (destino == null || destino < 0 || destino > ultima || destino === i) return;
    e.preventDefault();
    ir(secciones[destino].clave);
  };

  return (
    <div ref={carril} className="min-w-0 max-w-full overflow-x-auto scrollbar-none">
      <div className="flex w-max items-center gap-1 rounded-xl bg-[var(--surface-sunken)]" role="tablist" aria-label={etiqueta} onKeyDown={alTeclear}>
        {secciones.map((s) => {
          const elegida = s.clave === activa;
          return (
            <button
              key={s.clave}
              type="button"
              role="tab"
              id={idPestanaDeSeccion(idPanel, s.clave)}
              aria-controls={idPanel}
              aria-selected={elegida}
              tabIndex={elegida ? 0 : -1}
              onClick={() => ir(s.clave)}
              className={cn(
                "inline-flex min-h-12 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-sm font-semibold transition-colors",
                elegida
                  ? "bg-[var(--surface-raised)] text-[var(--text-primary)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--rule-base)]"
                  : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {s.rotulo}
              {tonoCuenta === "neutro" && s.cuenta !== undefined ? (
                <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-sm font-bold tabular-nums text-[var(--text-tertiary)] ring-1 ring-[var(--rule-soft)]">
                  {s.cuenta}
                </span>
              ) : s.cuenta ? (
                <span className="rounded-full bg-[var(--data-error-500)]/15 px-1.5 text-sm font-bold tabular-nums text-[var(--data-error-ink)]">{s.cuenta}</span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
