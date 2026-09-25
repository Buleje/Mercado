"use client";

/**
 * «Qué puede salir»: el techo de producción, lo que de ese techo no se puede
 * certificar y de qué lotes sale una parte.
 *
 * La pestaña entera habla del MISMO recorte (permiso → especie → guía). La guía
 * no acota lotes —juntan varias— y se dice, en vez de esconder la tabla.
 */

import type { CapacidadDeSaldos } from "../hooks/use-capacidad-de-saldos";
import type { FiltrosCapacidad } from "@/lib/forestal/capacidad-de-planta";
import { recortePuesto } from "@/lib/forestal/capacidad-de-planta";
import type { ModalesDeSaldos } from "./SaldosModales";
import BalanceDeCapacidad from "./BalanceDeCapacidad";
import { textoDeRecortes } from "./DetalleDeFuente";
import LotesConSaldo from "./LotesConSaldo";
import OrigenIncompleto from "./OrigenIncompleto";

export default function SeccionCapacidad({
  capacidad,
  filtros,
  hayLotes,
  lotesMezclados,
  lotesElegidos,
  onLotesElegidos,
  modales: m,
}: {
  capacidad: CapacidadDeSaldos;
  filtros: FiltrosCapacidad;
  /** Hay lotes en la planta (antes de filtrar): para decir por qué no se ven. */
  hayLotes: boolean;
  /** Con «Solo este permiso»: lotes que mezclan ese permiso con otro. */
  lotesMezclados: number;
  lotesElegidos: Set<string>;
  onLotesElegidos: (ids: Set<string>) => void;
  /** Detalle de fuente, cubicador, ficha de corrida y apertura se abren acá. */
  modales: ModalesDeSaldos;
}) {
  return (
    <>
      {/* El techo: cuánto producto puede salir de las cuatro fuentes. */}
      <BalanceDeCapacidad
        balance={capacidad.balance}
        filtros={filtros}
        opciones={capacidad.opciones}
        onFiltros={capacidad.aplicarFiltros}
        onDetalle={m.setDetalleFuente}
        onLlevar={() => m.setLlevando(true)}
      />

      {/* Lo que de ese techo NO puede salir con papeles: «cuánto de eso se
          puede certificar», pegado al «cuánto». */}
      <OrigenIncompleto
        resumen={capacidad.origen}
        onAbrirCorrida={(c) => m.setCorridaAbierta({ kind: "corrida", id: c.id, fecha: c.fecha })}
        onDeclararApertura={(c, deshacer) => m.setAperturaDe({ id: c.id, lote: c.lote, deshacer })}
      />

      <LotesConSaldo
        lotes={capacidad.lotesFiltrados}
        seleccion={lotesElegidos}
        onSeleccion={onLotesElegidos}
        mezcladosFuera={lotesMezclados}
        vacioMotivo={
          !hayLotes
            ? undefined
            : recortePuesto(filtros.guia)
              ? "Un lote junta piezas de varias guías: no se puede acotar a una sola. Quita el filtro de guía para verlos."
              : `Ningún lote de ${textoDeRecortes(filtros)}.`
        }
      />
    </>
  );
}
