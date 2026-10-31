"use client";

/**
 * use-pila-del-mixto — lo que la pantalla muestra de UN lote mixto: las trozas
 * que el servidor ya apartó más lo que este equipo está apartando o dejó por
 * subir, menos lo que está sacando; en tarjetas por especie + permiso con la
 * MISMA cuenta del servidor (`gruposDelMixto`, ADR-441).
 */

import { useMemo } from "react";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import { gruposDelMixto, planDeReparto, resumenDelMixto, type GrupoDelMixto } from "@/lib/forestal/lote-mixto";
import { claveDeGrupo } from "@/lib/forestal/lote-por-escaneo";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import type { LoteMixto } from "./use-lotes-mixtos";
import type { ReservaDelMixto } from "./use-reserva-del-mixto";

/** Una tarjeta: el grupo con sus trozas a mano (las chapas que se ven y se sacan). */
export interface TarjetaDelMixto {
  grupo: GrupoDelMixto;
  trozas: TrozaConsumible[];
}

export function usePilaDelMixto({
  mixto,
  patio,
  lotes,
  reserva,
}: {
  mixto: LoteMixto | null;
  /** El patio leído: de ahí salen las recién escaneadas que el servidor todavía no devolvió. */
  patio: readonly TrozaConsumible[];
  lotes: readonly LoteAserrio[];
  reserva: Pick<ReservaDelMixto, "apartando" | "sacando" | "porSubir">;
}) {
  const { apartando, sacando, porSubir } = reserva;

  /* En orden de escaneo: lo del servidor (por `reservadaMixtoEn`), lo anotado
     sin señal y lo que está viajando. La tarjeta de una especie no salta de
     lugar con cada lectura. */
  const pila = useMemo(() => {
    if (!mixto) return [];
    const delServidor = new Map(mixto.trozas.map((t) => [t.id, t as TrozaConsumible]));
    const delPatio = new Map(patio.map((t) => [t.id, t]));
    const fuera = new Set([...sacando, ...porSubir.quitar]);
    const vistos = new Set<string>();
    const out: TrozaConsumible[] = [];
    const servidor = [...mixto.trozas].sort((a, b) =>
      (a.reservadaMixtoEn ?? "").localeCompare(b.reservadaMixtoEn ?? ""),
    );
    for (const id of [...servidor.map((t) => t.id), ...porSubir.agregar, ...apartando]) {
      if (vistos.has(id) || fuera.has(id)) continue;
      vistos.add(id);
      const t = delServidor.get(id) ?? delPatio.get(id);
      if (t) out.push(t);
    }
    return out;
  }, [mixto, patio, apartando, sacando, porSubir.agregar, porSubir.quitar]);

  const tarjetas = useMemo<TarjetaDelMixto[]>(() => {
    const porId = new Map(pila.map((t) => [t.id, t]));
    return gruposDelMixto(pila).map((grupo) => ({
      grupo,
      trozas: grupo.trozaIds.map((id) => porId.get(id)).filter((t): t is TrozaConsumible => t != null),
    }));
  }, [pila]);
  const resumen = useMemo(() => resumenDelMixto(pila, tarjetas.map((t) => t.grupo)), [pila, tarjetas]);
  /* Lo que saldría hoy sin elegir destinos: un lote por tarjeta. */
  const plan = useMemo(
    () => planDeReparto(pila, lotes.filter((l) => l.status === "abierto")),
    [pila, lotes],
  );
  const ultima = pila[pila.length - 1];

  return {
    pila,
    tarjetas,
    resumen,
    lotesNuevos: plan.ok ? plan.pasos.filter((p) => p.destino.tipo === "nuevo").length : tarjetas.length,
    reciente: ultima ? claveDeGrupo(ultima) : null,
    /** Algo todavía no está firme en el servidor: repartir ahora dejaría piezas afuera. */
    pendiente: apartando.size + sacando.size + porSubir.agregar.size + porSubir.quitar.size,
  };
}
