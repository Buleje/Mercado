/**
 * «Abrir Liquidar» como link: `?accion=liquidar&persona=<id>`.
 *
 * Lo pide la Caja de Mi Plata (ADR-451): en «Lo que viene», «Ya te
 * adelantaron: para cruzar» llevaba a Adelantos y ahí había que buscar a la
 * persona y su botón. `accion=liquidar` no lo leía nadie.
 *
 * `persona` acepta cualquiera de los tres ids de una fila de la cuenta
 * unificada: su `clave` (`benef:<id>` / `parte:<id>`), el de Adelantos o el de
 * la parte forestal — el enlace lo arma el servidor con el que tenga. Sin
 * `persona`, se abre sólo si hay UNA persona con algo para cruzar (lo que te
 * adelantó contra lo que te debe en la cuenta forestal): con dos, adivinar
 * sería abrir la cuenta equivocada.
 *
 * `liquidacion=<código>` (el Resultado del negocio): esa liquidación queda
 * resaltada en el historial de Liquidar.
 *
 * Los parámetros se borran al atenderse (`replaceState`): si no, volver a
 * la pestaña reabría el modal cada vez. Los que no se atienden (un
 * `?liquidacion=` suelto, sin `accion`) se van al salir de Adelantos
 * (`useLimpiarAlSalirDeAdelantos`).
 */

import type { CuentaPersona } from "@/lib/adelantos/cuenta-unificada";
import { PARAM_LIQUIDACION } from "@/lib/adelantos/enlace-adelanto";

export const PARAM_ACCION = "accion";
export const PARAM_PERSONA = "persona";
export const ACCION_LIQUIDAR = "liquidar";

export interface PedidoLiquidar {
  /** `null` = el link no dijo quién. */
  persona: string | null;
  /** Código de la liquidación a resaltar en el historial, o `null`. */
  liquidacion: string | null;
}

/** Lo que pide la URL, o `null` si no pide liquidar. */
export function leerPedidoLiquidar(): PedidoLiquidar | null {
  if (typeof window === "undefined") return null;
  const q = new URLSearchParams(window.location.search);
  if (q.get(PARAM_ACCION) !== ACCION_LIQUIDAR) return null;
  return { persona: q.get(PARAM_PERSONA)?.trim() || null, liquidacion: q.get(PARAM_LIQUIDACION)?.trim() || null };
}

/** Atendido: fuera de la URL, sin agregar una entrada al historial. */
export function borrarPedidoLiquidar(): void {
  try {
    const u = new URL(window.location.href);
    if (!u.searchParams.has(PARAM_ACCION) && !u.searchParams.has(PARAM_PERSONA) && !u.searchParams.has(PARAM_LIQUIDACION)) return;
    u.searchParams.delete(PARAM_ACCION);
    u.searchParams.delete(PARAM_PERSONA);
    u.searchParams.delete(PARAM_LIQUIDACION);
    window.history.replaceState(null, "", u.toString());
  } catch {
    // Sin history: el modal ya se abrió; sólo queda el parámetro en la barra.
  }
}

const esLaPersona = (p: CuentaPersona, id: string) => p.clave === id || p.beneficiarioId === id || p.parteId === id;

/** Te adelantó plata Y te debe en la cuenta forestal: hay algo para cruzar al liquidar (ADR-449). */
const tieneAlgoParaCruzar = (p: CuentaPersona) =>
  (p.adelantos?.recibidoPendiente ?? 0) > 0.005 && (p.madera?.saldo ?? 0) > 0.005;

/** A quién abrirle Liquidar, o `null` si el pedido no alcanza para saberlo. */
export function personaDelPedido(pedido: PedidoLiquidar, personas: readonly CuentaPersona[]): CuentaPersona | null {
  if (pedido.persona) return personas.find((p) => esLaPersona(p, pedido.persona as string)) ?? null;
  const cruzables = personas.filter(tieneAlgoParaCruzar);
  return cruzables.length === 1 ? (cruzables[0] ?? null) : null;
}
