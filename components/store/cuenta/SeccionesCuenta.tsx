"use client";

/**
 * Las secciones de «Mi cuenta» (`?sub=pedidos|puntos|datos|ayuda`): se ve una
 * cosa a la vez, en vez de seis bloques apilados. Cambiar de sección no
 * recarga (reemplaza la URL); un enlace con `?sub=` abre la que pide.
 */

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { SECCIONES_CUENTA, esSeccionCuenta, type SeccionCuenta } from "./cuenta-rutas";
import { SeccionAyuda } from "./SeccionAyuda";
import { SeccionDatos } from "./SeccionDatos";
import { SeccionPedidos } from "./SeccionPedidos";
import { SeccionPuntos } from "./SeccionPuntos";
import type { PedidosCliente } from "./use-pedidos-cliente";

const ETIQUETA: Record<SeccionCuenta, string> = {
  pedidos: "Pedidos",
  puntos: "Puntos",
  datos: "Mis datos",
  ayuda: "Ayuda",
};

export interface SeccionesCuentaProps {
  base: string;
  nombre: string | null;
  conSesion: boolean;
  pedidos: PedidosCliente;
}

export function SeccionesCuenta({ base, nombre, conSesion, pedidos }: SeccionesCuentaProps) {
  const params = useSearchParams();
  const pedida = params.get("sub");
  const [sub, setSub] = useState<SeccionCuenta>(esSeccionCuenta(pedida) ? pedida : "pedidos");
  const pestanas = useRef<Array<HTMLButtonElement | null>>([]);

  // Un enlace del menú con otro `?sub=` estando ya en «Mi cuenta».
  useEffect(() => {
    if (esSeccionCuenta(pedida)) setSub(pedida);
  }, [pedida]);

  const elegir = (s: SeccionCuenta) => {
    setSub(s);
    const url = new URL(window.location.href);
    url.searchParams.set("sub", s);
    window.history.replaceState(window.history.state, "", url);
  };

  // Flechas izquierda/derecha entre pestañas (patrón tablist).
  const alTeclear = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    const paso = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
    if (!paso) return;
    e.preventDefault();
    const j = (i + paso + SECCIONES_CUENTA.length) % SECCIONES_CUENTA.length;
    elegir(SECCIONES_CUENTA[j]);
    pestanas.current[j]?.focus();
  };

  const cuantos = conSesion && !pedidos.cargando ? pedidos.pedidos.length : 0;
  return (
    <section className="flex flex-col gap-5">
      <div
        role="tablist"
        aria-label="Secciones de tu cuenta"
        className="-mx-4 flex gap-1 overflow-x-auto border-b border-[var(--rule-soft)] px-4 [scrollbar-width:none] sm:mx-0 sm:px-0"
      >
        {SECCIONES_CUENTA.map((s, i) => {
          const activa = s === sub;
          return (
            <button
              key={s}
              ref={(el) => {
                pestanas.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`cuenta-tab-${s}`}
              aria-selected={activa}
              aria-controls={`cuenta-panel-${s}`}
              tabIndex={activa ? 0 : -1}
              onClick={() => elegir(s)}
              onKeyDown={(e) => alTeclear(e, i)}
              className={cn(
                "relative inline-flex h-12 shrink-0 items-center gap-1.5 whitespace-nowrap px-3 text-base transition-colors duration-[var(--dur-fast)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--accent)]",
                activa
                  ? "font-semibold text-[var(--text-primary)] after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-[var(--accent)]"
                  : "font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]",
              )}
            >
              {ETIQUETA[s]}
              {s === "pedidos" && cuantos > 0 && (
                <span className="rounded-full bg-[var(--surface-sunken)] px-1.5 text-sm font-semibold tabular-nums text-[var(--text-secondary)]">
                  {cuantos}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`cuenta-panel-${sub}`} aria-labelledby={`cuenta-tab-${sub}`}>
        {sub === "pedidos" && <SeccionPedidos base={base} conSesion={conSesion} pedidos={pedidos} />}
        {sub === "puntos" && <SeccionPuntos base={base} conSesion={conSesion} />}
        {sub === "datos" && <SeccionDatos base={base} />}
        {sub === "ayuda" && <SeccionAyuda base={base} nombre={nombre} />}
      </div>
    </section>
  );
}
