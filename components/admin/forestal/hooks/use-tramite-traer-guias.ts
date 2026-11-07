"use client";

/**
 * «Traer de los libros» de la Relación de guías (extraído de
 * `TramiteRelacionGuias`): trae EN PARALELO los despachos con GTF del Libro CTP
 * y las GTF de trozas del Libro TH del período.
 *
 * El permiso manda (Brandon 08-10): con un permiso elegido, trae SÓLO las guías
 * de ese permiso (por código normalizado) y dice cuántas quedaron fuera. El
 * listado del CTP no trae el permiso ni el N° de lista de trozas: se leen de la
 * guía entera (`?ids=`, de a 200).
 */

import { useState } from "react";
import { avisoDeTraerGuias, clavePermisoOficio, repartirPorPermiso } from "@/lib/forestal/tramites-permiso";
import { filaDesdeGtfLoth, filaDesdeGuiaEmitida, type FilaGuiaInforme, type GtfLothLike } from "@/lib/forestal/tramites-relacion-guias";
import type { GuiaParaFormato } from "@/lib/forestal/tramites-desde-guias";
import type { GuiaEmitida } from "@/lib/forestal/guias-emitidas";

let contador = 0;
/** Uid client-only para la key de React — no viaja a ningún lado. */
export const uidNueva = () => `fila-${Date.now()}-${(contador += 1)}`;

/** `sinLeer` = guías del CTP cuyo detalle (permiso, N° de lista) no se pudo leer: no se traen ni cuentan como «fuera». */
type DeUnLibro = { filas: FilaGuiaInforme[]; aviso: string | null; fuera: number; sinLeer: number };

const OPCIONES: RequestInit = { credentials: "include", cache: "no-store" };

/** Sin permiso elegido, todas; con uno, sólo las que dicen ese (una sin permiso no es «de ese»). */
const esDelPermiso = (codigo: string | null | undefined, elegido: string | null): boolean => !elegido || clavePermisoOficio(codigo) === elegido;

/**
 * El detalle de las guías, de a 200. Una tanda que falla (status, red, JSON)
 * no corta las demás: sus guías quedan sin detalle y `repartirPorPermiso` las
 * cuenta como «sin leer», nunca como «de otro permiso».
 */
async function detalleCtp(ids: string[]): Promise<Map<string, GuiaParaFormato>> {
  const mapa = new Map<string, GuiaParaFormato>();
  for (let i = 0; i < ids.length; i += 200) {
    const qs = new URLSearchParams({ ids: ids.slice(i, i + 200).join(",") });
    try {
      const r = await fetch(`/api/admin/forestal/ctp/guias-emitidas?${qs}`, OPCIONES);
      if (!r.ok) continue;
      const j = (await r.json()) as { guias?: GuiaParaFormato[] };
      for (const g of j.guias ?? []) mapa.set(g.id, g);
    } catch {
      /* Tanda perdida: sus guías salen en el aviso «No se pudo leer el permiso de N». */
    }
  }
  return mapa;
}

async function traerDeCtp(desde: string, hasta: string, elegido: string | null): Promise<DeUnLibro> {
  const res = await fetch(`/api/admin/forestal/ctp/guias-emitidas?${new URLSearchParams({ desde, hasta })}`, OPCIONES);
  if (!res.ok) return { filas: [], fuera: 0, sinLeer: 0, aviso: res.status === 403 ? "Libro CTP no habilitado" : `Libro CTP: error ${res.status}` };
  const { guias } = (await res.json()) as { guias?: GuiaEmitida[] };
  const lista = guias ?? [];
  const detalle = lista.length ? await detalleCtp(lista.map((g) => g.despachoId)) : new Map<string, GuiaParaFormato>();
  const { delPermiso, fuera, sinLeer } = repartirPorPermiso(lista, detalle, (g) => g.despachoId, elegido);
  const filas = delPermiso.map(({ guia: g, detalle: d }) => ({ ...filaDesdeGuiaEmitida(uidNueva(), g), permiso: d.tituloHabilitante ?? "", listaTrozasNro: d.listaTrozasNro ?? "" }));
  return { filas, fuera, sinLeer, aviso: null };
}

async function traerDeLoth(desde: string, hasta: string, elegido: string | null): Promise<DeUnLibro> {
  const res = await fetch("/api/admin/forestal/gtf", OPCIONES);
  if (!res.ok) return { filas: [], fuera: 0, sinLeer: 0, aviso: res.status === 403 ? "Libro TH no habilitado" : `Libro TH: error ${res.status}` };
  const { gtfs } = (await res.json()) as { gtfs?: GtfLothLike[] };
  const enPeriodo = (gtfs ?? []).filter((g) => {
    if (!g.gtfDate) return false;
    const f = new Date(g.gtfDate).toISOString().slice(0, 10);
    return f >= desde && f <= hasta;
  });
  const delPermiso = enPeriodo.filter((g) => esDelPermiso(g.tituloHabilitante, elegido));
  return { filas: delPermiso.map((g) => filaDesdeGtfLoth(uidNueva(), g)), fuera: enPeriodo.length - delPermiso.length, sinLeer: 0, aviso: null };
}

export interface TraerGuias {
  trayendo: boolean;
  aviso: string | null;
  /** Las filas nuevas del período (y del permiso, si hay uno), sin las que ya están en la tabla. */
  traer: (o: { desde?: string; hasta?: string; permisoCodigo?: string; yaTraidas: ReadonlySet<string> }) => Promise<FilaGuiaInforme[]>;
}

export function useTramiteTraerGuias(): TraerGuias {
  const [trayendo, setTrayendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function traer(o: { desde?: string; hasta?: string; permisoCodigo?: string; yaTraidas: ReadonlySet<string> }): Promise<FilaGuiaInforme[]> {
    if (!o.desde || !o.hasta) {
      setAviso("Elige el período (desde / hasta) antes de traer las guías de los libros.");
      return [];
    }
    const elegido = clavePermisoOficio(o.permisoCodigo);
    setTrayendo(true);
    setAviso(null);
    try {
      const [ctp, loth] = await Promise.all([traerDeCtp(o.desde, o.hasta, elegido), traerDeLoth(o.desde, o.hasta, elegido)]);
      const traidas = [...ctp.filas, ...loth.filas].filter((f) => !o.yaTraidas.has(f.numero));
      const avisos = [ctp.aviso, loth.aviso].filter((a): a is string => a !== null);
      setAviso(avisoDeTraerGuias({ traidas: traidas.length, avisos, fuera: ctp.fuera + loth.fuera, sinLeer: ctp.sinLeer, permisoCodigo: o.permisoCodigo }));
      return traidas;
    } catch (err) {
      setAviso(err instanceof Error ? err.message : String(err));
      return [];
    } finally {
      setTrayendo(false);
    }
  }

  return { trayendo, aviso, traer };
}
