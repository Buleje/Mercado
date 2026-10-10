"use client";

/**
 * El lote mixto dentro de Consumos › Patio (ADR-441): el botón junto a
 * «Consumir en un lote…», la línea en «Qué queda en el patio» y los dos
 * modales. Un solo `useLotesMixtos` para los tres, así la línea y el modal
 * dicen lo mismo. Devuelve piezas para que cada una vaya donde la usa (el
 * mismo patrón que `useSeccion2Kpis`).
 */

import { useCallback, useEffect, useState } from "react";
import { Combine } from "@buleje/design-system/icons";
import { useMiRol } from "@/hooks/use-mi-rol";
import CtpLoteMixtoModal from "./CtpLoteMixtoModal";
import CtpLoteMixtoDesdeCamara, { type PedidoDesdeCamara } from "./CtpLoteMixtoDesdeCamara";
import CtpLoteMixtoTarjeta from "./CtpLoteMixtoTarjeta";
import CtpVincularMixtoModal, { puedeFirmarVinculo } from "./CtpVincularMixtoModal";
import { useLotesMixtos } from "./hooks/use-lotes-mixtos";
import type { EstadoPatioConsumos } from "./hooks/use-patio-consumos";
import type { LoteAProducir } from "./CtpLotesView";

/** Los parámetros de «Consumir» desde Cámaras (ADR-480): se leen una vez y se sacan de la URL. */
const PARAMS_CAMARA = ["desdeCamara", "pasada", "m"] as const;

function pedidoDeLaUrl(): PedidoDesdeCamara | null {
  const sp = new URLSearchParams(window.location.search);
  const dia = sp.get("desdeCamara");
  if (!dia || !/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null;
  const marcadores = (sp.get("m") ?? "")
    .split(",")
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 249);
  return { dia, pasada: sp.get("pasada"), marcadores };
}

function sacarDeLaUrl(): void {
  const url = new URL(window.location.href);
  for (const p of PARAMS_CAMARA) url.searchParams.delete(p);
  window.history.replaceState(window.history.state, "", url.toString());
}

export function useLoteMixtoEnConsumos({
  estado,
  onProducir,
  onAviso,
}: {
  estado: EstadoPatioConsumos;
  onProducir?: (lote: LoteAProducir) => void;
  onAviso: (mensaje: string) => void;
}) {
  const mixtos = useLotesMixtos();
  const firma = puedeFirmarVinculo(useMiRol());
  const [abierto, setAbierto] = useState(false);
  const [vinculando, setVinculando] = useState(false);
  const [desdeCamara, setDesdeCamara] = useState<PedidoDesdeCamara | null>(null);
  /* Una vez, al montar: «Consumir» de Cámaras › Trozas a la vista. */
  useEffect(() => {
    const p = pedidoDeLaUrl();
    if (!p) return;
    sacarDeLaUrl();
    setDesdeCamara(p);
  }, []);
  const { recargar: releerPatio } = estado.lotes;
  const { setLoteCarga } = estado.carga;

  /* Al cerrar, Consumos relee: las trozas apartadas o repartidas cambiaron. */
  const cerrar = useCallback(() => {
    setAbierto(false);
    void releerPatio();
  }, [releerPatio]);
  const cargar = useCallback(
    (lote: { id: string; code: string }) => {
      setAbierto(false);
      setLoteCarga(lote.id);
      void releerPatio();
    },
    [setLoteCarga, releerPatio],
  );

  const abierta = mixtos.abiertos[0] ?? null;
  const boton = (
    <button
      type="button"
      onClick={() => setAbierto(true)}
      title="Escanear la pila mezclada: se reparte en un lote por especie y permiso"
      /* 44 px en el celular (se toca con el dedo); 40 en escritorio, alineado con «Consumir en un lote…». */
      className="inline-flex h-11 items-center gap-2 whitespace-nowrap rounded-xl border sm:h-10 border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:border-[var(--accent)]"
    >
      <Combine className="h-4 w-4" aria-hidden />
      {abierta ? `Lote mixto · ${abierta.resumen.piezas}` : "Lote mixto"}
    </button>
  );

  const tarjeta = (
    <CtpLoteMixtoTarjeta
      mixtos={mixtos}
      onAbrir={() => setAbierto(true)}
      onVincular={firma ? () => setVinculando(true) : undefined}
      onVerLote={cargar}
    />
  );

  const modales = (
    <>
      {abierto && (
        <CtpLoteMixtoModal
          mixtos={mixtos}
          onClose={cerrar}
          puedeAnular={firma}
          onCargar={cargar}
          onProducir={
            onProducir
              ? (lote) => {
                  setAbierto(false);
                  onProducir(lote);
                }
              : undefined
          }
        />
      )}
      {desdeCamara && (
        <CtpLoteMixtoDesdeCamara
          pedido={desdeCamara}
          mixtos={mixtos}
          onClose={() => setDesdeCamara(null)}
          onApartadas={(msg) => {
            setDesdeCamara(null);
            onAviso(msg);
            void releerPatio();
            setAbierto(true);
          }}
        />
      )}
      {vinculando && (
        <CtpVincularMixtoModal
          diaEditable
          onClose={() => {
            setVinculando(false);
            void mixtos.recargar(true);
            void releerPatio();
          }}
          onVinculado={onAviso}
        />
      )}
    </>
  );

  return { boton, tarjeta, modales };
}
