/**
 * Cabecera de UNA fila: ícono + título + ⓘ + chip del conteo, a su lado las
 * pestañas del módulo y al final las acciones (Brandon 18-10, superadmin:
 * «compactes mejor, llevando el título y las pestañas a su lado»).
 *
 * Antes eran dos bandas: la fila de pestañas arriba y debajo la tarjeta del
 * título con el rótulo en mayúsculas (≈160 px antes del contenido). El rótulo
 * no se borra: pasa al título del ⓘ («Plataforma · Finanzas · Billing»).
 *
 * Sin "use client": la usan páginas de servidor (el ícono se dibuja acá, no
 * viaja como prop a un componente de cliente) y `AdminTabShell` en modo
 * compacto. Es la misma banda del Libro TH (`BANDA_MODULO` + `TituloModulo`).
 *
 * A 400 px el título queda en su renglón (cortado con «…» si no entra) y las
 * pestañas bajan al siguiente con su propio scroll horizontal: la base de
 * 24rem decide cuándo ya no entran al lado.
 */
import type { ComponentType, ReactNode } from "react";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { BANDA_MODULO, FILA_TITULO_MODULO, TituloModulo } from "./titulo-modulo";

export interface AyudaCabecera {
  title?: string;
  what?: ReactNode;
  body?: ReactNode;
  affects?: ReactNode;
  example?: ReactNode;
}

export interface CabeceraConPestanasProps {
  icon?: ComponentType<{ className?: string }>;
  /** En vez del ícono, un cuadro propio (la letra con el color de la marca). */
  iconoPropio?: ReactNode;
  title: string;
  /** El viejo rótulo de arriba («Plataforma · Finanzas»): no se dibuja, va al ⓘ. */
  kicker?: string;
  /** Qué hace / a dónde afecta / ejemplo: va en el ⓘ pegado al título. */
  info?: AyudaCabecera;
  /** Dato corto pegado al título (el conteo: «15 tiendas»). */
  chip?: ReactNode;
  /** `<SuperAdminModuleTabs enLinea … />` o cualquier fila de pestañas. */
  pestanas?: ReactNode;
  /** Botones o stats al final de la fila. */
  acciones?: ReactNode;
  className?: string;
}

export function CabeceraConPestanas({
  icon,
  iconoPropio,
  title,
  kicker,
  info,
  chip,
  pestanas,
  acciones,
  className,
}: CabeceraConPestanasProps) {
  const tituloAyuda = [kicker, info?.title ?? title].filter(Boolean).join(" · ");
  const ayuda = info ? { ...info, title: tituloAyuda } : kicker ? { title, body: kicker } : null;

  return (
    <header className={cn(BANDA_MODULO, className)}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-3 py-2.5 sm:px-4">
        <div className={cn(FILA_TITULO_MODULO, "max-w-full flex-[0_1_auto]")}>
          {iconoPropio}
          <TituloModulo
            icon={iconoPropio ? undefined : icon}
            title={title}
            truncar
            className="flex-nowrap"
            ayuda={
              ayuda || chip ? (
                <>
                  {ayuda && <InfoTip side="bottom" {...ayuda} />}
                  {chip ? <span className="shrink-0 whitespace-nowrap">{chip}</span> : null}
                </>
              ) : undefined
            }
          />
        </div>
        {pestanas ? <div className="min-w-0 flex-[1_1_24rem]">{pestanas}</div> : null}
        {acciones ? (
          <div className="flex w-full max-w-full flex-wrap items-stretch gap-2 overflow-x-auto sm:ml-auto sm:w-auto sm:shrink-0">
            {acciones}
          </div>
        ) : null}
      </div>
    </header>
  );
}
