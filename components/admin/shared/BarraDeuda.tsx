"use client";

/**
 * Lo que falta hacer, en una línea de pastillas.
 *
 * **La regla:** si un número PIDE QUE HAGAS ALGO, no es un indicador. No
 * describe el período —lo describe una cifra como «142 m³ produjo» o «S/ 4.520
 * vendiste»—, sino trabajo pendiente. Mezclado en la grilla de KPIs pasan
 * siempre las dos mismas cosas:
 *
 *  1. **Se duplica solo.** Una tarjeta no se puede tocar, así que alguien
 *     agrega después el cartel que lista el detalle, y el chip que filtra. En el
 *     Libro CTP «Sin materia prima» existía como tarjeta Y como cartel ámbar;
 *     «Sin anexo 04» como tarjeta, chip de filtro Y cartel — tres lugares para
 *     un solo concepto.
 *  2. **Un cero ocupa lo mismo que el número que manda.** «Sin declarar 0»
 *     pedía la misma superficie que los m³ que entraron a la sierra.
 *
 * Por eso la deuda sale de la grilla y vive acá: pastillas accionables, fuera
 * del panel plegable, **sólo las que son > 0**, y el cartel de detalle pasa a
 * desplegarse desde su propia pastilla.
 *
 * Regla que la mantiene honesta: cero no se muestra como pastilla de alarma.
 * Sin deuda, la barra dice que no hay deuda y ocupa una línea.
 *
 * Nació en el Libro CTP (Producción y Despacho) y vive en `shared` porque el
 * mismo vicio estaba en los dashboards de Inicio: Compras repetía «N cuentas
 * vencidas por S/ X» en un cartel debajo de las dos tarjetas que ya lo decían,
 * e Inventario hacía lo mismo con agotados y stock crítico — carteles que ni
 * siquiera llevaban a resolverlo.
 */

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { AlertCircle, ChevronDown, PackageCheck } from "@buleje/design-system/icons";

export interface DeudaItem {
  key: string;
  /** Qué falta hacer, en palabras del aserradero. */
  label: string;
  /** El número que duele. */
  valor: number | string;
  /** La cola de contexto: m³ colgando, plazo, etc. */
  hint?: string;
  tono: "warning" | "error";
  /** Acción directa (abrir el menú que lo resuelve). Excluyente con `contenido`. */
  onClick?: () => void;
  /**
   * A dónde se va a resolver esto, cuando la pantalla que lo arregla es otra.
   * Se dibuja como enlace de verdad —no un `onClick` con `location.href`— para
   * que abrir en pestaña nueva y el menú del botón derecho funcionen.
   */
  href?: string;
  /** Detalle que se despliega debajo de la barra al tocar la pastilla. */
  contenido?: ReactNode;
  title?: string;
}

const TONOS = {
  warning: {
    chip: "border-[var(--data-warning-500)]/45 bg-[var(--data-warning-500)]/10 text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]",
    activo: "border-[var(--data-warning-500)] bg-[var(--data-warning-500)]/18",
  },
  error: {
    chip: "border-[var(--data-error-500)]/45 bg-[var(--data-error-500)]/10 text-[var(--data-error-700)] dark:text-[var(--data-error-500)]",
    activo: "border-[var(--data-error-500)] bg-[var(--data-error-500)]/18",
  },
} as const;

export default function BarraDeuda({
  items,
  /** Qué decir cuando no hay nada pendiente. */
  vacio = "El libro está al día: nada pendiente de declarar ni de atribuir.",
}: {
  items: DeudaItem[];
  vacio?: string;
}) {
  const [abierto, setAbierto] = useState<string | null>(null);

  /* Si la pastilla abierta desaparece —se resolvió esa deuda— el panel de abajo
     no puede quedar mostrando el detalle de algo que ya no existe. */
  useEffect(() => {
    if (abierto && !items.some((i) => i.key === abierto)) setAbierto(null);
  }, [items, abierto]);

  if (items.length === 0) {
    return (
      <p className="flex items-center gap-1.5 px-0.5 text-[length:var(--ts-2xs)] text-[var(--text-tertiary)]">
        <PackageCheck className="h-3.5 w-3.5 shrink-0 text-[var(--data-success-500)]" aria-hidden />
        {vacio}
      </p>
    );
  }

  const abiertoItem = items.find((i) => i.key === abierto);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex shrink-0 items-center gap-1.5 text-[length:var(--ts-2xs)] font-bold tracking-wide text-[var(--text-tertiary)] uppercase">
          <AlertCircle className="h-3.5 w-3.5" aria-hidden />
          Pendiente
        </span>
        {items.map((i) => {
          const t = TONOS[i.tono];
          const expandible = Boolean(i.contenido);
          const activo = abierto === i.key;
          const clase = `inline-flex h-9 items-center gap-1.5 rounded-lg border-[1.5px] px-2.5 text-sm font-bold transition ${t.chip} ${
            activo ? t.activo : ""
          } ${expandible || i.onClick || i.href ? "hover:brightness-95" : "cursor-default"}`;
          const dentro = (
            <>
              <span className="tabular-nums">{i.valor}</span>
              <span className="font-semibold">{i.label}</span>
              {i.hint && <span className="hidden font-normal opacity-75 sm:inline">· {i.hint}</span>}
              {expandible && <ChevronDown className={`h-3.5 w-3.5 transition-transform ${activo ? "rotate-180" : ""}`} aria-hidden />}
            </>
          );
          /* Un destino es un enlace, no un botón que navega: el que quiere
             abrirlo en otra pestaña tiene que poder. */
          if (i.href && !expandible) {
            return (
              <a key={i.key} href={i.href} title={i.title} className={clase}>
                {dentro}
              </a>
            );
          }
          return (
            <button
              key={i.key}
              type="button"
              title={i.title}
              aria-expanded={expandible ? activo : undefined}
              onClick={() => {
                if (expandible) setAbierto((v) => (v === i.key ? null : i.key));
                else i.onClick?.();
              }}
              className={clase}
            >
              {dentro}
            </button>
          );
        })}
      </div>
      {abiertoItem?.contenido && (
        <div className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-sunken)] p-3">{abiertoItem.contenido}</div>
      )}
    </div>
  );
}
