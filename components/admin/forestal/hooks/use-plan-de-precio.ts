"use client";

/**
 * usePlanDePrecio — la vista previa de «Poner precio» en tanda.
 *
 * De lo tipeado (precio por proveedor y, si se ajustó, por especie) a lo que
 * se va a guardar: qué pedidos, qué guías mostró la pantalla (`vistos`, lo único
 * que el servidor acepta escribir), el plan con la MISMA regla pura que corre
 * el servidor, y los avisos de dedazo por renglón.
 */

import { useMemo } from "react";
import {
  avisosDePrecio,
  claveGrupo,
  planDePrecio,
  precioAplicable,
  rangoDePrecio,
  type PrecioPedido,
} from "@/lib/forestal/precio-en-tanda";
import type { DatosPrecio } from "./use-precio-en-tanda";

/** Un precio tipeado: vacío, 0 o basura = no hay precio (sin factura es null, nunca 0). */
export const precioDe = (v: string | undefined): number | null =>
  v == null || v.trim() === "" ? null : precioAplicable(Number(v));

export function usePlanDePrecio(
  datos: DatosPrecio | null,
  precioProv: Record<string, string>,
  precioEsp: Record<string, string>,
  tambienConPrecio: boolean,
) {
  /** El precio de cada especie: el suyo si lo tiene, si no el del proveedor. */
  const pedidos = useMemo<PrecioPedido[]>(() => {
    if (!datos) return [];
    return datos.grupos.flatMap((p) =>
      p.especies.flatMap((e) => {
        const precio = precioDe(precioEsp[e.clave]) ?? precioDe(precioProv[p.clave]);
        return precio == null ? [] : [{ proveedor: e.proveedor, especie: e.especie, precioM3: precio }];
      }),
    );
  }, [datos, precioEsp, precioProv]);

  /** Lo que la pantalla muestra: sólo esas guías se escriben, y sólo si siguen igual. */
  const vistos = useMemo(() => {
    const claves = new Set(pedidos.map((p) => claveGrupo(p.proveedor, p.especie)));
    return (datos?.filas ?? [])
      .filter((f) => claves.has(claveGrupo(f.providerName, f.speciesCommonName)))
      .map((f) => ({ id: f.id, antes: f.costoTotal }));
  }, [datos, pedidos]);

  const plan = useMemo(
    () => (datos ? planDePrecio(datos.filas, pedidos, { tambienConPrecio, vistos }) : null),
    [datos, pedidos, tambienConPrecio, vistos],
  );

  /** Avisos de dedazo, por especie y resumidos por proveedor (sin repetir el texto). */
  const avisos = useMemo(() => {
    const avisosProv: Record<string, string[]> = {};
    const avisosEsp: Record<string, string[]> = {};
    let hayAvisos = false;
    for (const p of datos?.grupos ?? []) {
      const delProv = new Set<string>();
      for (const e of p.especies) {
        const propio = precioDe(precioEsp[e.clave]);
        const precio = propio ?? precioDe(precioProv[p.clave]);
        if (precio == null || !datos) continue;
        const a = avisosDePrecio(precio, rangoDePrecio(e.especie, datos.referencias));
        if (a.length === 0) continue;
        hayAvisos = true;
        /* La especie con precio propio avisa en su renglón; la que hereda el
           del proveedor, en el del proveedor (sin repetir el mismo texto). */
        if (propio != null && p.especies.length > 1) avisosEsp[e.clave] = a;
        else a.forEach((t) => delProv.add(t));
      }
      if (delProv.size) avisosProv[p.clave] = [...delProv];
    }
    return { avisosProv, avisosEsp, hayAvisos };
  }, [datos, precioEsp, precioProv]);

  return { pedidos, vistos, plan, ...avisos };
}
