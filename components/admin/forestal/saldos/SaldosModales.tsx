"use client";

/**
 * Los cinco modales de Saldos y su estado, en un solo lugar: declarar
 * apertura, la ficha de una corrida, el detalle de una fuente, llevar al
 * cubicador y el kardex de una especie.
 *
 * Al cerrar la ficha o la apertura se vuelven a pedir las corridas: lo que se
 * ató cambia el diagnóstico, y adivinar qué cambió es peor que pedir la foto.
 */

import { useState } from "react";
import type { CtpPeriod } from "@/lib/forestal/ctp-period";
import { bloquesDesdeCapacidad } from "@/lib/forestal/capacidad-a-bloques";
import {
  hayFiltro,
  type EntradaCapacidad,
  type FiltrosCapacidad,
  type FuenteDeCapacidad,
} from "@/lib/forestal/capacidad-de-planta";
import CtpKardexModal from "../CtpKardexModal";
import CtpNodeDetailLoader, { type DetailTarget } from "../CtpNodeDetailLoader";
import DeclararAperturaModal from "./DeclararAperturaModal";
import DetalleDeFuente, { textoDeRecortes } from "./DetalleDeFuente";
import LlevarAlCubicadorModal from "./LlevarAlCubicadorModal";

interface Apertura {
  id: string;
  lote: string | null;
  deshacer: boolean;
}

export interface ModalesDeSaldos {
  aperturaDe: Apertura | null;
  setAperturaDe: (a: Apertura | null) => void;
  corridaAbierta: DetailTarget | null;
  setCorridaAbierta: (t: DetailTarget | null) => void;
  detalleFuente: FuenteDeCapacidad | null;
  setDetalleFuente: (f: FuenteDeCapacidad | null) => void;
  llevando: boolean;
  setLlevando: (v: boolean) => void;
  kardexEspecie: string | null;
  setKardexEspecie: (e: string | null) => void;
}

export function useModalesDeSaldos(): ModalesDeSaldos {
  const [aperturaDe, setAperturaDe] = useState<Apertura | null>(null);
  const [corridaAbierta, setCorridaAbierta] = useState<DetailTarget | null>(null);
  const [detalleFuente, setDetalleFuente] = useState<FuenteDeCapacidad | null>(null);
  const [llevando, setLlevando] = useState(false);
  const [kardexEspecie, setKardexEspecie] = useState<string | null>(null);
  return {
    aperturaDe,
    setAperturaDe,
    corridaAbierta,
    setCorridaAbierta,
    detalleFuente,
    setDetalleFuente,
    llevando,
    setLlevando,
    kardexEspecie,
    setKardexEspecie,
  };
}

export default function SaldosModales({
  m,
  entrada,
  filtros,
  period,
  onCorridasCambiaron,
}: {
  m: ModalesDeSaldos;
  entrada: EntradaCapacidad;
  filtros: FiltrosCapacidad;
  period: CtpPeriod;
  onCorridasCambiaron: () => void;
}) {
  return (
    <>
      {m.aperturaDe && (
        <DeclararAperturaModal
          corridaId={m.aperturaDe.id}
          lote={m.aperturaDe.lote}
          deshacer={m.aperturaDe.deshacer}
          onClose={() => m.setAperturaDe(null)}
          onListo={() => {
            m.setAperturaDe(null);
            onCorridasCambiaron();
          }}
        />
      )}

      {m.corridaAbierta && (
        <CtpNodeDetailLoader
          target={m.corridaAbierta}
          onClose={() => {
            m.setCorridaAbierta(null);
            onCorridasCambiaron();
          }}
        />
      )}

      {m.detalleFuente && (
        <DetalleDeFuente
          fuente={m.detalleFuente}
          entrada={entrada}
          filtros={filtros}
          periodoLabel={period.label}
          onClose={() => m.setDetalleFuente(null)}
        />
      )}

      {/* La misma madera que muestra la tarjeta, lista para repartir: los
          candidatos salen de las MISMAS funciones que arman el balance. */}
      {m.llevando && (
        <LlevarAlCubicadorModal
          candidatos={bloquesDesdeCapacidad(entrada, filtros)}
          recorte={hayFiltro(filtros) ? textoDeRecortes(filtros) : ""}
          onCerrar={() => m.setLlevando(false)}
        />
      )}

      {m.kardexEspecie && (
        <CtpKardexModal
          especie={m.kardexEspecie}
          period={period}
          onClose={() => m.setKardexEspecie(null)}
        />
      )}
    </>
  );
}
