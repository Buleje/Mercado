"use client";

/**
 * Un bloque que llegó a Mi Plata desde otra pestaña (plan «panel unificado»,
 * ola 3): plegable y recordado, con su origen escrito en el título, y visible
 * sólo para quien lo veía en su lugar de antes (`PermisoDe`, regla R2).
 *
 *   <BloqueMudado origen="compras" deDonde="Compras" clave="plata:gastos:historial"
 *     titulo="Historial de gastos y compras">…</BloqueMudado>
 *
 * Plegado no monta lo de adentro (`Plegable`): un bloque pesado que nadie abrió
 * no pide sus datos.
 */

import type { ReactNode } from "react";
import type { Tab } from "@/app/admin/_lib/tabs.types";
import Plegable from "@/components/admin/shared/Plegable";
import PermisoDe from "@/components/admin/shared/PermisoDe";

interface Props {
  /** La pestaña (o pestañas) donde vivía: decide quién lo ve. */
  origen: Tab | readonly Tab[];
  /** Cómo se llama ese lugar para quien lo usa («Compras › Comprar»). */
  deDonde: string;
  clave: string;
  titulo: ReactNode;
  resumen?: ReactNode;
  abiertoAlInicio?: boolean;
  /** `franja` cuando lo de adentro ya es una tarjeta (sin caja dentro de caja). */
  variante?: "tarjeta" | "franja";
  id?: string;
  children: ReactNode;
}

export default function BloqueMudado({
  origen, deDonde, clave, titulo, resumen, abiertoAlInicio, variante = "tarjeta", id, children,
}: Props) {
  return (
    <PermisoDe origen={origen}>
      <div id={id} className="scroll-mt-24">
        <Plegable
          clave={clave}
          variante={variante}
          abiertoAlInicio={abiertoAlInicio}
          resumen={resumen}
          titulo={
            <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              {titulo}
              <span className="rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-xs font-semibold text-[var(--text-secondary)]">
                de {deDonde}
              </span>
            </span>
          }
        >
          {children}
        </Plegable>
      </div>
    </PermisoDe>
  );
}
