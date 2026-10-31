/**
 * «Crear plan de manejo para este titular» (ADR-518): la ficha del Directorio
 * pide el alta del plan con su titular ya puesto, y el Libro TH la abre.
 *
 * Mismo patrón que `loth-plan-paso-pedido`: la ficha deja el pedido acá y
 * navega; la vista del plan abre «Nuevo plan de manejo» si encuentra un pedido
 * (`altaPedida`, sin efectos: StrictMode llama dos veces a los inicializadores)
 * y el formulario lo suelta al montarse (`soltarAltaPedida`). Si el libro ya
 * estaba montado, el evento `ALTA_PEDIDA_EVENTO` le avisa.
 *
 * Vence a los 2 minutos: un pedido que nadie atendió (la vista no llegó a
 * abrir) no tiene que aparecer en el próximo «Nuevo plan» de la tarde.
 *
 * Liviano a propósito: lo importa la ficha, que no debe cargar el libro.
 */

import type { Contrato } from "@/lib/forestal/contratos";
import type { Parte } from "@/lib/forestal/directorio";
import { claveDelPermiso } from "./use-loth-libro-permiso";
import { LOTH_TAB_ID } from "../loth-mapa-tala-url";

export interface AltaDePlanPedida {
  titular: Parte;
  /** El permiso del titular del que sale el plan, si se pidió desde uno. */
  permiso: Contrato | null;
  /** Desde la ficha vieja: pasar lo anotado (título, resolución, vigencia) al plan. */
  conLoAnotado: boolean;
}

export const ALTA_PEDIDA_EVENTO = "loth:alta-plan-pedida";
/** La vista Plan del Libro TH. */
export const URL_PLAN_DEL_LIBRO = `/admin?tab=${LOTH_TAB_ID}&vista=plan`;
const VENCE_MS = 2 * 60_000;

let pedido: (AltaDePlanPedida & { at: number }) | null = null;

export function pedirAltaDePlan(p: AltaDePlanPedida): void {
  pedido = { ...p, at: Date.now() };
  window.dispatchEvent(new CustomEvent(ALTA_PEDIDA_EVENTO));
}

/** Lo leen los inicializadores de la vista y del formulario: sin efectos. */
export function altaPedida(): AltaDePlanPedida | null {
  if (!pedido) return null;
  if (Date.now() - pedido.at > VENCE_MS) return null;
  return pedido;
}

/** El formulario ya lo tomó: el próximo «Nuevo plan» arranca vacío. */
export function soltarAltaPedida(): void {
  pedido = null;
}

/**
 * Deja elegido un plan en el chip del libro (con el formato de `useLocalStorage`
 * y su evento, por si el libro ya está montado). Si el navegador no deja
 * escribir, se navega igual y el libro abre en el plan que tenía.
 */
export function dejarElegidoElPlan(slug: string, planId: string): void {
  const clave = claveDelPermiso(slug);
  try {
    window.localStorage.setItem(clave, JSON.stringify(planId));
    window.dispatchEvent(new CustomEvent("local-storage", { detail: { key: clave, value: planId } }));
  } catch (err) {
    console.warn("[directorio] no se pudo dejar elegido el plan", err);
  }
}
