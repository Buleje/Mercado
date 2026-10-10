"use client";

/**
 * Los indicadores de cada sección de Pedidos y reparto › Reparto, con el patrón
 * del panel (`useKpisPlegables`, alto "md"): el botón «Indicadores» va en la
 * fila de la cabecera —al lado de las secciones y del «Más»— y su panel, arriba
 * de la sección. Plegado, el botón lleva el titular adentro (plegar no es
 * esconder el dato).
 *
 * Cada sección tiene sus propias cifras (las de En vivo no son las del
 * Ranking), pero la cabecera es una sola: la sección pone su botón en el hueco
 * que la cabecera publica por contexto (`HuecoIndicadores`) con un portal.
 * Fuera de la cabecera (sin proveedor) el botón queda donde la sección lo
 * dibuje.
 *
 * 10-10 (Brandon: «compactar para que la información central esté bien
 * vista»): reemplaza a las tarjetas grandes de cada sección (cuatro por
 * sección, en MAYÚSCULAS y de 3xl) y a la franja «Hoy en el reparto».
 */
import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { LucideIcon } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";

/**
 * `undefined` = no hay cabecera (el botón va en su lugar); `null` = la cabecera
 * todavía no montó su hueco (no se dibuja, para que no salte de lugar).
 */
export const HuecoIndicadores = createContext<HTMLElement | null | undefined>(undefined);

export interface Indicador {
  icono: LucideIcon;
  rotulo: string;
  valor: string;
  /** Una línea debajo de la cifra («de 3 registrados»). */
  extra?: string;
  /** Lo que explica la cifra, en el ⓘ. */
  ayuda?: string;
  /** Pinta la cifra con el color de su estado. */
  tono?: "ok" | "alerta" | "error";
}

const TONO: Record<NonNullable<Indicador["tono"]>, string> = {
  ok: "text-[var(--data-success-ink)]",
  alerta: "text-[var(--data-warning-ink)]",
  error: "text-[var(--data-error-ink)]",
};

function TarjetaIndicador({ icono: Icono, rotulo, valor, extra, ayuda, tono }: Indicador) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-3">
      <div className="mb-1 flex items-center gap-2">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
          <Icono className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 truncate text-sm font-semibold text-[var(--text-secondary)]">{rotulo}</span>
        {ayuda && <InfoTip title={rotulo} what={ayuda} />}
      </div>
      <p className={cn("truncate text-lg font-extrabold tabular-nums text-[var(--text-primary)]", tono && TONO[tono])}>{valor}</p>
      {extra && <p className="truncate text-sm tabular-nums text-[var(--text-secondary)]">{extra}</p>}
    </div>
  );
}

export function useIndicadoresReparto({
  clave,
  resumen,
  indicadores,
  cargando = false,
}: {
  /** Se recuerda abierto/cerrado por sección (`ctp-kpis-v2:reparto:<clave>`). */
  clave: string;
  /** El titular plegado: dos cifras, ~24 caracteres (el botón mide 24rem). */
  resumen?: string;
  indicadores: Indicador[];
  /** Sin respuesta todavía: el panel muestra esqueletos, no ceros de mentira. */
  cargando?: boolean;
}): { boton: ReactNode; panel: ReactNode } {
  const hueco = useContext(HuecoIndicadores);
  const { boton, panel } = useKpisPlegables({
    claveMemoria: `reparto:${clave}`,
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: cargando,
    resumen: cargando ? undefined : resumen,
    tarjetas: indicadores.map((i) => <TarjetaIndicador key={i.rotulo} {...i} />),
  });
  const enCabecera = hueco === undefined ? boton : hueco && boton ? createPortal(boton, hueco) : null;
  return { boton: enCabecera, panel };
}
