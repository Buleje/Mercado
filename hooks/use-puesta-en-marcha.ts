"use client";

/**
 * use-puesta-en-marcha — junta lo que hace falta para saber qué del libro está
 * construido y sin estrenar.
 *
 * SIN período a propósito, y es la decisión que define el panel: la pregunta no
 * es «¿cargaste los costos de julio?» sino «¿alguna vez usaste esta parte del
 * libro?». Con el filtro del período puesto, un mes tranquilo haría parecer que
 * nada se usó nunca — que es justo la conclusión equivocada.
 *
 * Todo lo que falle cae en su valor neutro: el panel se dibuja igual. Un panel
 * de diagnóstico que no se muestra porque un endpoint tosió no diagnostica nada.
 */
import { useCallback, useEffect, useState } from "react";
import { ctpGet } from "@/lib/forestal/ctp-fetch";
import { normalizeCtpFicha, requisitosFaltantes } from "@/lib/forestal/ctp-ficha-types";
import { logger } from "@/lib/logger";
import {
  capacidadesDelLibro,
  resumirPuestaEnMarcha,
  type Capacidad,
  type DatosPuestaEnMarcha,
  type ResumenPuestaEnMarcha,
} from "@/lib/forestal/ctp-puesta-en-marcha";

const pedir = <T,>(url: string): Promise<T | null> =>
  ctpGet<T>(url).catch((err) => {
    logger.warn("[puesta-en-marcha] no cargó", { url, error: String(err) });
    return null;
  });

export interface EstadoPuestaEnMarcha {
  capacidades: Capacidad[];
  resumen: ResumenPuestaEnMarcha | null;
  cargando: boolean;
  recargar: () => Promise<void>;
}

export function usePuestaEnMarcha(): EstadoPuestaEnMarcha {
  const [capacidades, setCapacidades] = useState<Capacidad[]>([]);
  const [resumen, setResumen] = useState<ResumenPuestaEnMarcha | null>(null);
  const [cargando, setCargando] = useState(true);

  const recargar = useCallback(async () => {
    setCargando(true);
    const [we, prod, desp, anexos, cierres, saldos, ficha] = await Promise.all([
      pedir<{ stats?: { totalCount?: number; sinCostoCount?: number; sinConstanciaCount?: number; conPiezasCount?: number } }>(
        "/api/admin/forestal/wood-entries?stats=1&limit=1",
      ),
      pedir<{ entries?: { status?: string; quantity?: string | null }[] }>("/api/admin/forestal/ctp?section=produccion&take=500"),
      pedir<{ entries?: { id: string; status?: string; gtfNumber?: string | null; valorVenta?: string | null }[] }>(
        "/api/admin/forestal/ctp?section=despacho&take=500",
      ),
      pedir<{ anexos?: { ctpEntryId?: string }[] }>("/api/admin/forestal/anexos"),
      pedir<{ cierres?: { reabierto?: unknown }[] }>("/api/admin/forestal/ctp/cierre"),
      pedir<{ saldos?: { productos?: { stock?: number }[] } }>("/api/admin/forestal/ctp?saldos=1"),
      pedir<{ ficha?: unknown }>("/api/admin/forestal/ctp-ficha"),
    ]);

    const st = we?.stats ?? {};
    const total = st.totalCount ?? 0;
    const corridas = (prod?.entries ?? []).filter((e) => e.status === "registrado");
    const despachos = (desp?.entries ?? []).filter((e) => e.status === "registrado");
    const conAnexo = new Set((anexos?.anexos ?? []).map((a) => a.ctpEntryId).filter(Boolean));
    /* La ficha entera, no tres campos sueltos: `requisitosFaltantes` necesita
       todos para decir qué papel queda roto y por cuál. */
    const f = normalizeCtpFicha(ficha?.ficha);

    const datos: DatosPuestaEnMarcha = {
      ingresos: {
        total,
        sinCosto: st.sinCostoCount ?? 0,
        sinConstancia: st.sinConstanciaCount ?? 0,
        conPiezas: st.conPiezasCount ?? 0,
      },
      produccion: {
        corridas: corridas.length,
        /* Corrida abierta (ADR-364): consumió y todavía no dijo qué salió. */
        sinDeclarar: corridas.filter((c) => c.quantity == null).length,
        conPaquetes: corridas.filter((c) => c.quantity != null).length,
      },
      despachos: {
        total: despachos.length,
        sinGtf: despachos.filter((d) => !d.gtfNumber?.trim()).length,
        conVenta: despachos.filter((d) => d.valorVenta != null).length,
        conAnexo: despachos.filter((d) => conAnexo.has(d.id)).length,
      },
      /* Los reabiertos no cuentan: un cierre reabierto dejó de congelar nada. */
      cierres: (cierres?.cierres ?? []).filter((c) => !c.reabierto).length,
      stockDisponibleM3: (saldos?.saldos?.productos ?? []).reduce((a, p) => a + Math.max(0, Number(p.stock ?? 0)), 0),
      ficha: {
        tieneIdentidad: Boolean(f.razonSocial.trim() || f.codigoCtp.trim()),
        tieneSerieGtf: Boolean(f.gtfSerie.trim()),
        papelesIncompletos: requisitosFaltantes(f).map((r) => ({
          documento: r.documento.nombre,
          faltan: r.faltan,
        })),
      },
    };

    const caps = capacidadesDelLibro(datos);
    setCapacidades(caps);
    setResumen(resumirPuestaEnMarcha(caps));
    setCargando(false);
  }, []);

  useEffect(() => {
    void recargar();
  }, [recargar]);

  return { capacidades, resumen, cargando, recargar };
}
