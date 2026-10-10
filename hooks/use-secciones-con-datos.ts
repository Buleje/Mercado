"use client";

/**
 * useSeccionesConDatos — qué secciones de un módulo tienen algo cargado.
 *
 * POR QUÉ. En Mi Plata, el tenant real de Brandon tiene CERO préstamos, CERO
 * cuentas de tesorería y CERO categorías de presupuesto (medido 2026-09-21;
 * tesorería re-medida el 2026-09-29). Esas secciones ocupaban lugar permanente
 * en la navegación de alguien que no las usa, y el tiempo de «ir buscando» se
 * paga en cada visita.
 *
 * CÓMO. El dato manda, no una lista dura: se le pregunta al MISMO endpoint que
 * alimenta la sección si tiene al menos una fila. Así, el día que se carga el
 * primer préstamo la sección aparece sola, sin que nadie toque una constante.
 *
 * Dos decisiones que importan:
 *   · Si la consulta falla (red caída, 500), la sección se MUESTRA. Esconder
 *     algo por un error de red es esconder trabajo que existe.
 *   · Mientras no se sabe, se muestra todo. La respuesta llega en un parpadeo
 *     y `fetchFinanzas` la memoriza 30 s, así que al cambiar de pestaña dentro
 *     del módulo ya está contestada.
 */

import { useEffect, useState } from "react";
import { fetchFinanzas } from "@/components/admin/finanzas/shared";
import type { ClaveDeDato } from "@/components/admin/unified/finanzas/estructura";

/** De dónde sale «hay al menos uno» para cada área. */
const SONDAS: Record<ClaveDeDato, { url: string; hay: (json: unknown) => boolean }> = {
  /* Tesorería = las cuentas de banco, caja y billetera (`TreasuryCuenta`).
     Antes miraba `/api/payables`: la sección se plegaba con cuentas cargadas
     y 0 por pagar (así estaba `main` el 2026-09-29). Sólo cuentas activas:
     con todas dadas de baja, no hay saldo que mirar. */
  tesoreria:   { url: "/api/treasury/cuentas", hay: (j) => Array.isArray(j) && j.length > 0 },
  assets:      { url: "/api/admin/assets",   hay: (j) => cuantos((j as { data?: unknown })?.data) > 0 },
  fiados:      { url: "/api/fiados",         hay: (j) => Array.isArray(j) && j.length > 0 },
  prestamos:   { url: "/api/prestamos",      hay: (j) => Array.isArray(j) && j.length > 0 },
  adelantos:   { url: "/api/adelantos?direccion=todas", hay: (j) => Array.isArray(j) && j.length > 0 },
  presupuesto: { url: "/api/presupuesto",    hay: (j) => cuantos((j as { categorias?: unknown })?.categorias) > 0 },
  /* «Lo que debo» (F10): el resumen trae `cuentas` = cuántos acreedores hay. */
  porPagar:    { url: "/api/finanzas/por-pagar?resumen=1", hay: (j) => Number((j as { cuentas?: unknown })?.cuentas) > 0 },
};

const cuantos = (v: unknown): number => (Array.isArray(v) ? v.length : 0);

/** `undefined` = todavía no se sabe (y mientras tanto se muestra). */
export type MapaDeDatos = Partial<Record<ClaveDeDato, boolean>>;

/** Lo ya averiguado, compartido entre montajes: cambiar de pestaña no reparpadea. */
const conocido: MapaDeDatos = {};

export function useSeccionesConDatos(claves: readonly ClaveDeDato[]): MapaDeDatos {
  const pedido = [...claves].sort().join(",");
  const [datos, setDatos] = useState<MapaDeDatos>(() => ({ ...conocido }));

  useEffect(() => {
    if (!pedido) return;
    let vivo = true;
    const lista = pedido.split(",") as ClaveDeDato[];
    Promise.all(
      lista.map(async (clave) => {
        const sonda = SONDAS[clave];
        /* `null` como fallback = la consulta no llegó: se interpreta como
           «mostrala» más abajo, nunca como «está vacía». */
        const json = await fetchFinanzas<unknown>(sonda.url, null);
        return [clave, json === null ? true : sonda.hay(json)] as const;
      }),
    ).then((pares) => {
      for (const [clave, hay] of pares) conocido[clave] = hay;
      if (vivo) setDatos({ ...conocido });
    });
    return () => {
      vivo = false;
    };
  }, [pedido]);

  return datos;
}
