"use client";

/**
 * use-vincular-mixto — la producción de un día contra un lote mixto (ADR-441,
 * paso 7): qué corridas hay, qué trozas propone `planDelMixto` para cada una y
 * la firma.
 *
 * Firmar va de a una corrida y en orden, como la tanda (ADR-408): cada una
 * toma el lock de sus trozas; en paralelo sería pedir un abrazo mortal. Si una
 * falla se para ahí y se dice cuántas quedaron. Con el mixto todavía ABIERTO
 * (decisión 3 del dueño) primero se reparte —una transacción— y los lotes «por
 * repartir» del plan se cambian por los que salieron.
 */

import { useCallback, useMemo, useState } from "react";
import { csrfHeaders } from "@/lib/csrf-client";
import { invalidarCtp } from "@/lib/forestal/ctp-fetch";
import {
  corridaAlMixto,
  lotesParaVincular,
  pedidoConLotesReales,
} from "@/lib/forestal/lote-mixto-vista";
import {
  planDelMixto,
  type ModoDelMixto,
  type PlanDelMixto,
  type VincularCorridaPedido,
} from "@/lib/forestal/vincular-desde-mixto";
import { useJornadasConPaquetes } from "./use-jornadas-con-paquetes";
import { useLotesAserrio } from "./use-lotes-aserrio";
import { useLotesMixtos, type LoteMixto } from "./use-lotes-mixtos";

/** Lo que respondió el servidor por una corrida vinculada. */
export interface CorridaVinculada {
  corridaId: string;
  lineNo: number | null;
  especie: string | null;
  piezas: number;
  volumenM3: number;
  rendimientoPct: number | null;
  sobreElTope: boolean;
}

export interface ResultadoFirma {
  hechas: CorridaVinculada[];
  /** La corrida que falló y por qué (las siguientes no se intentaron). */
  error: { lineNo: number | null; especie: string | null; mensaje: string } | null;
  /** Lotes que salieron al repartir el mixto antes de vincular. */
  repartidos: string[];
}

async function vincularUna(pedido: VincularCorridaPedido): Promise<Omit<CorridaVinculada, "lineNo" | "especie">> {
  const r = await fetch("/api/admin/forestal/lotes-aserrio", {
    method: "PATCH",
    headers: csrfHeaders({ "Content-Type": "application/json" }),
    credentials: "include",
    body: JSON.stringify({ accion: "vincular-corrida", ...pedido }),
  });
  const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
  if (!r.ok) {
    const msg = typeof j.message === "string" ? j.message : typeof j.error === "string" ? j.error : null;
    throw new Error(msg ?? `El servidor respondió ${r.status}`);
  }
  return {
    corridaId: pedido.corridaId,
    piezas: Number(j.piezas) || 0,
    volumenM3: Number(j.volumenM3) || 0,
    rendimientoPct: j.rendimientoPct == null ? null : Number(j.rendimientoPct),
    sobreElTope: Boolean(j.sobreElTope),
  };
}

export function useVincularMixto({
  dia,
  soloCorridas,
  mixtoInicial,
}: {
  dia: string;
  /** Sólo estas corridas del día (las recién declaradas). Sin esto, todas. */
  soloCorridas?: readonly string[];
  mixtoInicial?: string | null;
}) {
  const mixtos = useLotesMixtos();
  const patio = useLotesAserrio();
  const jornadas = useJornadasConPaquetes([dia]);
  const [mixtoId, setMixtoId] = useState<string | null>(mixtoInicial ?? null);
  const [modo, setModo] = useState<ModoDelMixto>("todo");
  /** Trozas destildadas: no entraron a la sierra, quedan como saldo en su lote. */
  const [excluidas, setExcluidas] = useState<ReadonlySet<string>>(new Set());
  const [firmando, setFirmando] = useState(false);

  /* Los abiertos primero (lo que está en la sierra hoy), después los repartidos. */
  const candidatos = useMemo<LoteMixto[]>(
    /* Un repartido sin lotes vivos (se deshicieron) no tiene madera que ofrecer. */
    () => [...mixtos.abiertos, ...mixtos.repartidos.filter((m) => m.lotes.length > 0).slice(0, 20)],
    [mixtos.abiertos, mixtos.repartidos],
  );
  const corridasDelDia = useMemo(
    () => (jornadas.datos?.detalle ?? []).filter((c) => !soloCorridas || soloCorridas.includes(c.id)),
    [jornadas.datos, soloCorridas],
  );
  /* Sin uno elegido, el que más corridas del día puede firmar: el abierto más
     nuevo puede no tener nada de esas especies (medido en QA: otra tablet abrió
     uno vacío y la propuesta decía «no hay trozas» con el bueno repartido). */
  const mejor = useMemo(() => {
    if (mixtoId || corridasDelDia.length === 0) return null;
    const corridas = corridasDelDia.map(corridaAlMixto);
    let elegido: LoteMixto | null = null;
    let max = 0;
    for (const m of candidatos) {
      const n = planDelMixto({ corridas, lotes: lotesParaVincular(m, patio.trozas) }).vinculables;
      if (n > max) {
        elegido = m;
        max = n;
      }
    }
    return elegido;
  }, [mixtoId, corridasDelDia, candidatos, patio.trozas]);
  const mixto = candidatos.find((m) => m.id === mixtoId) ?? mejor ?? candidatos[0] ?? null;

  const lotes = useMemo(() => lotesParaVincular(mixto, patio.trozas), [mixto, patio.trozas]);
  const plan: PlanDelMixto = useMemo(
    () => planDelMixto({ corridas: corridasDelDia.map(corridaAlMixto), lotes }, { modo, excluidas: [...excluidas] }),
    [corridasDelDia, lotes, modo, excluidas],
  );
  /** Todas las trozas del mixto por id: las chapas de cada parte y las destildadas. */
  const trozaPorId = useMemo(() => new Map(lotes.flatMap((l) => l.trozas.map((t) => [t.id, t] as const))), [lotes]);

  const alternar = useCallback((trozaId: string) => {
    setExcluidas((prev) => {
      const n = new Set(prev);
      if (n.has(trozaId)) n.delete(trozaId);
      else n.add(trozaId);
      return n;
    });
  }, []);

  const firmar = useCallback(async (): Promise<ResultadoFirma> => {
    const hechas: CorridaVinculada[] = [];
    const repartidos: string[] = [];
    const aFirmar = plan.propuestas.filter((p) => p.pedido);
    if (!mixto || aFirmar.length === 0) return { hechas, error: null, repartidos };
    setFirmando(true);
    try {
      let lotePorClave = new Map<string, string>();
      let fuera = new Set<string>();
      if (mixto.status === "abierto") {
        try {
          const r = await mixtos.repartir(mixto.id, {});
          lotePorClave = new Map(r.lotes.map((l) => [l.clave, l.loteId]));
          fuera = new Set(r.excluidas.map((x) => x.id));
          repartidos.push(...r.lotes.map((l) => l.code));
        } catch (e) {
          return {
            hechas,
            repartidos,
            error: { lineNo: null, especie: null, mensaje: `No se pudo repartir ${mixto.code}: ${e instanceof Error ? e.message : String(e)}` },
          };
        }
      }
      for (const p of aFirmar) {
        const pedido = pedidoConLotesReales(p.pedido!, lotePorClave, fuera);
        if (!pedido) continue;
        try {
          const r = await vincularUna(pedido);
          hechas.push({ ...r, lineNo: p.corrida.lineNo ?? null, especie: p.corrida.especie });
        } catch (e) {
          return {
            hechas,
            repartidos,
            error: { lineNo: p.corrida.lineNo ?? null, especie: p.corrida.especie, mensaje: e instanceof Error ? e.message : String(e) },
          };
        }
      }
      return { hechas, error: null, repartidos };
    } finally {
      invalidarCtp("/forestal/");
      await Promise.all([mixtos.recargar(true), patio.recargar(), jornadas.recargar()]);
      setFirmando(false);
    }
  }, [plan, mixto, mixtos, patio, jornadas]);

  return {
    mixtos,
    candidatos,
    mixto,
    elegirMixto: (id: string) => {
      setMixtoId(id);
      setExcluidas(new Set());
    },
    corridasDelDia,
    jornadas,
    cargando: mixtos.cargando || patio.cargando || !jornadas.datos,
    error: mixtos.error ?? patio.error ?? jornadas.error,
    plan,
    trozaPorId,
    modo,
    setModo,
    excluidas,
    alternar,
    firmar,
    firmando,
  };
}

export type EstadoVincularMixto = ReturnType<typeof useVincularMixto>;
