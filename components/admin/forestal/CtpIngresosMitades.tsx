"use client";

/**
 * Libro CTP › Ingresos — la bandeja y el archivo en UNA vista (plan «panel
 * unificado», F31, ola 2 — 2026-10-10).
 *
 * «Ingresos» y «GTF ingresadas» eran el mismo `CtpIngresosView` montado dos
 * veces con otro `recepcion` (ADR-339). Ahora el filtro «Por recepcionar /
 * Recepcionadas / Todas» vive pegado a la tabla y elige la mitad del libro;
 * la mitad viaja en `?sub=` (`por-recepcionar` | `recepcionadas`), así que un
 * enlace a «las ya recibidas» sigue abriendo eso.
 *
 * Cada mitad conserva su instancia (`key`): sus cifras (la bandeja con lo que
 * falta recibir; el archivo con cuánta madera bajó, ADR-357), sus filtros
 * recordados y su orden — igual que cuando eran dos pestañas.
 */

import { useCallback, useState } from "react";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import CtpIngresosView from "./CtpIngresosView";
import type { CtpFiltroRapido } from "./ctp-shared";
import { usePestanaInterna } from "./hooks/use-pestana-interna";
import {
  SUBS_INGRESOS,
  subPedidoPorVistaVieja,
  type FiltroRecepcion,
  type SubIngresos,
} from "./ctp-vistas-fusionadas";

export default function CtpIngresosMitades({
  instancia,
  period,
  openGtf,
  onOpenConsumed,
  filtroRapido,
  pedido,
}: {
  /** Sube cuando el libro se vacía o se importa: remonta la lista. */
  instancia: number;
  period: CtpPeriod;
  openGtf: string | null;
  onOpenConsumed: () => void;
  filtroRapido: CtpFiltroRapido | null;
  pedido: { sub: string; n: number } | null;
}) {
  const [forzada] = useState(() => subPedidoPorVistaVieja("ingresos"));
  const { sub, irA } = usePestanaInterna<SubIngresos>({
    moduleId: "ctp-ingresos",
    validas: SUBS_INGRESOS,
    porDefecto: "por-recepcionar",
    forzada,
    pedido,
  });
  /* «Todas» elegido desde el archivo abre la bandeja ya abierta a todo el período. */
  const [todasAlAbrir, setTodasAlAbrir] = useState(false);

  const elegir = useCallback(
    (f: FiltroRecepcion) => {
      setTodasAlAbrir(f === "");
      irA(f === "cerrada" ? "recepcionadas" : "por-recepcionar");
    },
    [irA],
  );

  if (sub === "recepcionadas") {
    return (
      <CtpIngresosView
        key={`gtf-ing-${instancia}`}
        period={period}
        recepcion="cerrada"
        onRecepcion={elegir}
      />
    );
  }
  return (
    <CtpIngresosView
      key={`ing-${instancia}`}
      period={period}
      openGtf={openGtf}
      onOpenConsumed={onOpenConsumed}
      filtroRapido={filtroRapido}
      recepcion="pendiente"
      recepcionInicial={todasAlAbrir ? "" : undefined}
      onRecepcion={elegir}
    />
  );
}
