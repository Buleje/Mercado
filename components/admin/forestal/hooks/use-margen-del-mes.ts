"use client";

/**
 * Los datos del «Margen del mes» (Cubicador › Guardadas, 24-10): DOS lecturas
 * para todos los meses, no una por camión —las cubicaciones comerciales del
 * negocio (`?material=todas`, venta y compra; el servidor da las 200 más
 * nuevas) y los beneficiarios de Adelantos con la ficha a la que están atados
 * (`forestPartyId`, para juntar las compras de una comunidad como lo hace el
 * servidor con `?parte=&conBeneficiario=1`)—. La cuenta la hace `margenDelMes`
 * (pura) con las guías que Guardadas ya leyó. Sólo lectura.
 */
import { useEffect, useMemo, useState } from "react";
import type { ComercialParaMargen } from "@/lib/forestal/cubicacion-margen";
import { margenDelMes, mesesParaElegir } from "@/lib/forestal/cubicacion-margen-mes";
import type { CubicacionRegistro } from "@/lib/forestal/cubicacion-registro";
import type { PorFicha } from "@/lib/forestal/cubicacion-por-ficha";
import type { VolumenDeGuia } from "@/lib/forestal/cubicacion-rendimiento-guia";
import { limaDateKey } from "@/lib/utils";
import { pedir, RUTA_CUBICACIONES_TROZAS } from "./use-cubicaciones-trozas";

/** Lo que devuelve el servidor como máximo (`ForestCubicacionTrozasDB.list`, take 200). */
export const TOPE_COMERCIALES = 200;

const leerComerciales = (j: unknown): ComercialParaMargen[] => {
  const arr = ((j ?? {}) as { cubicaciones?: unknown }).cubicaciones;
  return Array.isArray(arr) ? (arr as ComercialParaMargen[]) : [];
};

/** forestPartyId → ids de sus beneficiarios (la lista viene pelada). */
const leerBeneficiarios = (j: unknown): Map<string, string[]> => {
  const m = new Map<string, string[]>();
  for (const b of Array.isArray(j) ? (j as { id?: unknown; forestPartyId?: unknown }[]) : []) {
    if (typeof b.id !== "string" || typeof b.forestPartyId !== "string" || !b.forestPartyId) continue;
    m.set(b.forestPartyId, [...(m.get(b.forestPartyId) ?? []), b.id]);
  }
  return m;
};

type Lectura =
  | { estado: "cargando" }
  | { estado: "error"; mensaje: string }
  | { estado: "lista"; comerciales: ComercialParaMargen[]; beneficiarios: Map<string, string[]>; sinBeneficiarios: boolean };

function useLecturaDelMes(token: number): Lectura {
  const [res, setRes] = useState<{ de: number; v: Lectura } | null>(null);
  useEffect(() => {
    let vigente = true;
    void Promise.all([
      pedir(`${RUTA_CUBICACIONES_TROZAS}?material=todas`, { cache: "no-store" }, leerComerciales),
      pedir("/api/adelantos/beneficiarios", { cache: "no-store" }, leerBeneficiarios),
    ]).then(([com, ben]) => {
      if (!vigente) return;
      const v: Lectura = !com.ok
        ? { estado: "error", mensaje: com.status === 403 ? "Tu rol no ve las cuentas de madera." : com.mensaje }
        /* Sin los beneficiarios las compras atadas por Adelantos no se juntan: se avisa, no se esconde el resto. */
        : { estado: "lista", comerciales: com.data, beneficiarios: ben.ok ? ben.data : new Map(), sinBeneficiarios: !ben.ok };
      setRes({ de: token, v });
    });
    return () => { vigente = false; };
  }, [token]);
  return res && res.de === token ? res.v : { estado: "cargando" };
}

export function useMargenDelMes(lista: readonly CubicacionRegistro[], guias: ReadonlyMap<string, VolumenDeGuia>, cargandoGuias: boolean) {
  const [token, setToken] = useState(0);
  const lectura = useLecturaDelMes(token);
  const mesActual = limaDateKey().slice(0, 7);
  const [mes, setMes] = useState(mesActual);
  const [por, setPor] = useState<PorFicha>("comunidad");
  const meses = useMemo(() => mesesParaElegir(lista, mesActual), [lista, mesActual]);

  const resultado = useMemo(() => {
    if (lectura.estado !== "lista") return null;
    return margenDelMes({ lista, mes, por, comerciales: lectura.comerciales, beneficiariosDeLaParte: lectura.beneficiarios, guias, cargandoGuias });
  }, [lectura, lista, mes, por, guias, cargandoGuias]);

  return {
    lectura,
    resultado,
    /* 200 justas = puede haber más viejas que no llegaron: su margen podría faltar. */
    tope: lectura.estado === "lista" && lectura.comerciales.length >= TOPE_COMERCIALES,
    mes, setMes, meses, por, setPor,
    recargar: () => setToken((t) => t + 1),
  };
}
