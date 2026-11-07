"use client";

/**
 * Cuánto dura la «vista de tienda» al entrar como una tienda desde el superadmin
 * (18-10, Brandon: «que se pueda personalizar de 5 hasta 1 hora»). Es una
 * preferencia de ESTE navegador (`sa-vista-tienda-minutos`); la usan todas las
 * entradas (`suplantarTienda` y «Entrar como esta tienda») y el servidor vuelve
 * a validar el rango. Dos formas de elegirla, el mismo valor:
 *  - `TiempoVistaTienda`: selector «por 10 min ▾» con su ⓘ (pestaña Credenciales).
 *  - `accionesTiempoVistaTienda`: opciones con tilde para un `ActionMenu` («⋯» de la lista).
 */

import { useSyncExternalStore } from "react";
import { ChevronDown, Timer } from "@buleje/design-system/icons";
import type { MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { MINUTOS_SUPLANTACION_DEFECTO, OPCIONES_MINUTOS_SUPLANTACION } from "@/lib/auth/suplantacion";
import {
  CLAVE_MINUTOS_VISTA,
  EVENTO_MINUTOS_VISTA,
  guardarMinutosVistaTienda,
  leerMinutosVistaTienda,
} from "@/lib/auth/suplantacion-vista";

/** Avisa al cambiar en esta pestaña (evento propio) o en otra (`storage`). */
function suscribir(avisar: () => void): () => void {
  const alGuardarEnOtra = (e: StorageEvent) => {
    if (e.key === null || e.key === CLAVE_MINUTOS_VISTA) avisar();
  };
  window.addEventListener("storage", alGuardarEnOtra);
  window.addEventListener(EVENTO_MINUTOS_VISTA, avisar);
  return () => {
    window.removeEventListener("storage", alGuardarEnOtra);
    window.removeEventListener(EVENTO_MINUTOS_VISTA, avisar);
  };
}

const enElServidor = () => MINUTOS_SUPLANTACION_DEFECTO;

/** Los minutos elegidos (10 si nada) y cómo cambiarlos; todos los selectores se enteran. */
export function useMinutosVistaTienda(): [number, (minutos: number) => void] {
  const minutos = useSyncExternalStore(suscribir, leerMinutosVistaTienda, enElServidor);
  return [minutos, guardarMinutosVistaTienda];
}

export const etiquetaMinutosVista = (m: number): string => (m === 60 ? "1 hora" : `${m} min`);

/** Opciones con tilde para el «⋯» de una barra: una sección con el valor actual en su título. */
export function accionesTiempoVistaTienda(minutos: number, elegir: (m: number) => void): MenuAccion[] {
  return OPCIONES_MINUTOS_SUPLANTACION.map((m) => ({
    id: `tiempo-vista-${m}`,
    seccion: `Tiempo al entrar como tienda: ${etiquetaMinutosVista(minutos)}`,
    label: etiquetaMinutosVista(m),
    ...(m === MINUTOS_SUPLANTACION_DEFECTO ? { hint: "Por defecto" } : {}),
    icon: Timer,
    activo: m === minutos,
    onSelect: () => elegir(m),
  }));
}

/** Selector compacto «por 10 min ▾» + ⓘ, para ir al lado de un botón «Entrar como esta tienda». */
export function TiempoVistaTienda({ className = "" }: { className?: string }) {
  const [minutos, elegir] = useMinutosVistaTienda();
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 ${className}`}>
      <label className="relative inline-flex items-center">
        <span className="sr-only">Tiempo de la vista de tienda</span>
        <Timer className="pointer-events-none absolute left-2 h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
        <select
          value={minutos}
          onChange={(e) => elegir(Number(e.target.value))}
          className="h-9 cursor-pointer appearance-none rounded-lg border border-[var(--rule-base)] bg-[var(--surface-canvas)] pl-7 pr-7 text-xs font-semibold text-[var(--text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/40"
        >
          {OPCIONES_MINUTOS_SUPLANTACION.map((m) => (
            <option key={m} value={m}>
              por {etiquetaMinutosVista(m)}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-[var(--text-tertiary)]" aria-hidden="true" />
      </label>
      <InfoTip
        title="Tiempo de la vista de tienda"
        what="Cuánto dura el panel de la tienda cuando entras como ella: de 5 min a 1 hora. Al acabarse se cierra solo y vuelves a la lista de tiendas."
        affects="Todas las entradas como tienda desde este navegador (lista, ficha, rescate, plantas…). Cada entrada queda en la auditoría con su tiempo."
        example="Con 30 min la vista de Musa se cierra sola a los 30 min; para seguir, vuelves a entrar."
        side="bottom"
      />
    </span>
  );
}
