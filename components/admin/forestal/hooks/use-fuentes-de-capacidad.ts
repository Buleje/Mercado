"use client";

/**
 * useFuentesDeCapacidad — las cuatro lecturas que arman «Qué puede salir».
 *
 * Lotes, patio, ingresos pendientes sin piezas y corridas con saldo en el
 * depósito. Vivían en línea dentro de `CtpSaldosView` (≈150 líneas) con un
 * efecto que corría UNA vez: el «Recargar» de la cabecera no las volvía a pedir
 * y la capacidad quedaba vieja al lado de un saldo recién traído.
 *
 * ── «Solo este permiso» (ADR-421/431) ─────────────────────────────────────
 * Con el interruptor prendido, patio, pendientes y corridas se piden YA
 * acotados al servidor (`?contratoId=`); `/lotes-aserrio` no lo lee, así que los
 * lotes se acotan acá por el código del permiso (`lotesDelContrato`) y los que
 * mezclan dos permisos se cuentan aparte, para decirlo. `contratoFiltro` entra
 * en las dependencias: prender o apagar el interruptor vuelve a pedir todo, y
 * sólo la respuesta del ÚLTIMO pedido escribe — la del patio entero, grande y
 * lenta, no puede llegar tarde y pisar la acotada.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ctpGet, invalidarCtp } from "@/lib/forestal/ctp-fetch";
import { conContratoId } from "@/lib/forestal/contrato-filtro";
import { applyCtpPeriodParams, type CtpPeriod } from "@/lib/forestal/ctp-period";
import type { CorridaDisponible, EstadoFuente } from "@/lib/forestal/capacidad-de-planta";
import type { TrozaConsumible } from "@/lib/forestal/consumo-trozas";
import type { LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { lotesDelContrato } from "@/lib/forestal/saldos-reporte";
import { logger } from "@/lib/logger";

export type ClaveFuenteLeida = "patio" | "lotes" | "corridas" | "pendientes";

export interface FuentesDeCapacidad {
  patio: TrozaConsumible[];
  /** Ya acotados al permiso activo si «Solo este permiso» está prendido. */
  lotes: LoteAserrio[];
  /** Lotes que mezclan el permiso activo con otro: quedan afuera y se dicen. */
  lotesMezclados: number;
  /** `null` = todavía no llegaron. */
  corridas: CorridaDisponible[] | null;
  pendienteSinPiezasM3: number;
  estado: Record<ClaveFuenteLeida, EstadoFuente>;
  /** El endpoint del patio recorta a 5.000 piezas: si recortó, el techo es parcial. */
  patioTruncado: { devueltas: number; total: number } | null;
  /** Vuelve a pedir las cuatro, sin caché. */
  recargar: () => void;
  /** Sólo las corridas: después de atar un origen o declarar apertura. */
  recargarCorridas: () => void;
}

const CARGANDO: Record<ClaveFuenteLeida, EstadoFuente> = {
  patio: "cargando",
  lotes: "cargando",
  corridas: "cargando",
  pendientes: "cargando",
};

interface RespuestaPatio {
  trozas?: TrozaConsumible[];
  truncado?: boolean;
  devueltas?: number;
  total?: number;
}

export function useFuentesDeCapacidad({
  period,
  contratoFiltro,
  codigoContrato,
}: {
  period: CtpPeriod;
  /** El id del contrato si «Solo este permiso» está prendido; si no, `null`. */
  contratoFiltro: string | null;
  /** Su código, para acotar los lotes (la ruta de lotes no lee el id). */
  codigoContrato: string | null;
}): FuentesDeCapacidad {
  const [patio, setPatio] = useState<TrozaConsumible[]>([]);
  const [lotesCrudos, setLotesCrudos] = useState<LoteAserrio[]>([]);
  const [corridas, setCorridas] = useState<CorridaDisponible[] | null>(null);
  const [pendienteSinPiezasM3, setPendiente] = useState(0);
  const [estado, setEstado] = useState(CARGANDO);
  const [patioTruncado, setPatioTruncado] = useState<FuentesDeCapacidad["patioTruncado"]>(null);

  const marcar = useCallback(
    (k: ClaveFuenteLeida, v: EstadoFuente) => setEstado((e) => (e[k] === v ? e : { ...e, [k]: v })),
    [],
  );

  /* El período sólo acompaña a las corridas (lo disponible es una FOTO del
     depósito, ADR-349): va en la URL pero no dispara otro pedido. */
  const periodRef = useRef(period);
  useEffect(() => {
    periodRef.current = period;
  }, [period]);

  /* Un contador por tanda: la respuesta que no es de la última tanda se tira. */
  const tanda = useRef(0);
  const tandaCorridas = useRef(0);

  const cargarCorridas = useCallback(() => {
    const n = ++tandaCorridas.current;
    const q = conContratoId(
      applyCtpPeriodParams(new URLSearchParams({ disponibles: "1" }), periodRef.current),
      contratoFiltro,
    );
    ctpGet<{ corridas?: CorridaDisponible[] }>(`/api/admin/forestal/ctp?${q}`)
      .then((j) => {
        if (n !== tandaCorridas.current) return;
        /* Un fallo NO es un depósito vacío: se marca y el balance lo dice. */
        setCorridas(Array.isArray(j?.corridas) ? j.corridas : []);
        marcar("corridas", Array.isArray(j?.corridas) ? "ok" : "error");
      })
      .catch((err) => {
        if (n !== tandaCorridas.current) return;
        logger.warn("[ctp-saldos] disponibles no cargaron", { error: String(err) });
        setCorridas([]);
        marcar("corridas", "error");
      });
  }, [contratoFiltro, marcar]);

  const cargar = useCallback(() => {
    const n = ++tanda.current;
    const vigente = () => n === tanda.current;
    setEstado(CARGANDO);

    ctpGet<{ lotes?: LoteAserrio[] }>("/api/admin/forestal/lotes-aserrio")
      .then((j) => {
        if (!vigente()) return;
        if (Array.isArray(j?.lotes)) {
          setLotesCrudos(j.lotes);
          marcar("lotes", "ok");
        } else marcar("lotes", "error");
      })
      .catch((err) => {
        logger.warn("[ctp-saldos] lotes no cargaron", { error: String(err) });
        if (vigente()) marcar("lotes", "error");
      });

    const qPatio = conContratoId(new URLSearchParams(), contratoFiltro).toString();
    ctpGet<RespuestaPatio>(`/api/admin/forestal/trozas/patio${qPatio ? `?${qPatio}` : ""}`)
      .then((j) => {
        if (!vigente()) return;
        if (!Array.isArray(j?.trozas)) return marcar("patio", "error");
        setPatio(j.trozas);
        setPatioTruncado(
          j.truncado
            ? { devueltas: Number(j.devueltas ?? j.trozas.length), total: Number(j.total ?? 0) }
            : null,
        );
        marcar("patio", "ok");
      })
      .catch((err) => {
        logger.warn("[ctp-saldos] patio no cargó", { error: String(err) });
        if (vigente()) marcar("patio", "error");
      });

    /* Los ingresos sin validar y SIN piezas: los que tienen piezas ya entran
       troza por troza en «por recepcionar». Sumar el total del libro además
       contaba la misma madera dos veces. */
    const qPend = conContratoId(
      new URLSearchParams({ status: "pendiente", limit: "500" }),
      contratoFiltro,
    );
    ctpGet<{ entries?: unknown; items?: unknown }>(`/api/admin/forestal/wood-entries?${qPend}`)
      .then((j) => {
        if (!vigente()) return;
        const filas = (j?.entries ?? j?.items) as
          | { volumeM3?: unknown; trozasCount?: unknown }[]
          | undefined;
        if (!Array.isArray(filas)) return marcar("pendientes", "error");
        setPendiente(
          filas
            .filter((e) => Number(e.trozasCount ?? 0) === 0)
            .reduce((a, e) => a + Number(e.volumeM3 ?? 0), 0),
        );
        marcar("pendientes", "ok");
      })
      .catch((err) => {
        logger.warn("[ctp-saldos] pendientes no cargaron", { error: String(err) });
        if (vigente()) marcar("pendientes", "error");
      });

    cargarCorridas();
  }, [contratoFiltro, cargarCorridas, marcar]);

  useEffect(() => {
    cargar();
    return () => {
      /* Al desmontar (o cambiar de permiso) nada de lo que venga en vuelo escribe. */
      tanda.current += 1;
      tandaCorridas.current += 1;
    };
  }, [cargar]);

  const recargar = useCallback(() => {
    /* «Recargar» es pedirlo de nuevo de verdad: el caché de 8 s de `ctpGet`
       devolvería lo mismo que ya está en pantalla. */
    for (const f of ["/lotes-aserrio", "/trozas/patio", "status=pendiente", "disponibles=1"])
      invalidarCtp(f);
    cargar();
  }, [cargar]);

  const recargarCorridas = useCallback(() => {
    invalidarCtp("disponibles=1");
    cargarCorridas();
  }, [cargarCorridas]);

  const { dentro, mezclados } = useMemo(
    () => lotesDelContrato(lotesCrudos, contratoFiltro ? codigoContrato : null),
    [lotesCrudos, contratoFiltro, codigoContrato],
  );

  return {
    patio,
    lotes: dentro,
    lotesMezclados: mezclados.length,
    corridas,
    pendienteSinPiezasM3,
    estado,
    patioTruncado,
    recargar,
    recargarCorridas,
  };
}
