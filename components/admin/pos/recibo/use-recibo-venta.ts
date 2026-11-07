"use client";

import { useCallback, useMemo, useState } from "react";
import { useMembrete } from "@/hooks/use-membrete";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { tenantKey, useTenantSlug } from "@/contexts/tenant-context";
import { armarRecibo, FORMATOS_RECIBO, type FormatoRecibo, type ModeloRecibo, type EntradaRecibo } from "@/lib/recibo/modelo-recibo";
import { reciboHtml } from "@/lib/recibo/recibo-html";
import { imprimirHtml } from "@/lib/imprimir-en-marco";

export interface ReciboVenta {
  modelo: ModeloRecibo;
  formato: FormatoRecibo;
  setFormato: (f: FormatoRecibo) => void;
  /** La hoja completa del formato elegido: la misma se ve y se imprime. */
  html: string;
  imprimir: () => void;
  /** El membrete todavía no llegó: la hoja saldría sin el nombre del negocio. */
  cargando: boolean;
}

const esFormato = (f: unknown): f is FormatoRecibo => FORMATOS_RECIBO.some((x) => x.id === f);

/** El formato del recibo, recordado por negocio en este equipo (80 mm por defecto). */
export function useFormatoRecibo(): [FormatoRecibo, (f: FormatoRecibo) => void] {
  const [guardado, setGuardado] = useLocalStorage<FormatoRecibo>(tenantKey(useTenantSlug(), "recibo-formato"), "ticket80");
  const formato = esFormato(guardado) ? guardado : "ticket80";
  const setFormato = useCallback((f: FormatoRecibo) => setGuardado(f), [setGuardado]);
  return [formato, setFormato];
}

/**
 * Recibo de una venta: arma el modelo con el membrete del negocio, dibuja la
 * hoja del formato elegido e imprime ESA hoja en un marco oculto. `entrada`
 * tiene que venir memorizada (cambia sólo si cambia la venta).
 */
export function useReciboVenta(entrada: Omit<EntradaRecibo, "negocio">): ReciboVenta {
  const membrete = useMembrete();
  const [formato, setFormato] = useFormatoRecibo();
  const modelo = useMemo(() => armarRecibo({ ...entrada, negocio: membrete }), [entrada, membrete]);
  const html = useMemo(() => reciboHtml(modelo, formato), [modelo, formato]);
  const imprimir = useCallback(() => imprimirHtml(html, `${modelo.nombreCorto} ${modelo.numero}`), [html, modelo]);
  return { modelo, formato, setFormato, html, imprimir, cargando: membrete === null };
}

/** La hora del cobro, fija mientras el modal está abierto (sin conexión no hay `createdAt`). */
export function useHoraDelCobro(): Date {
  const [fecha] = useState(() => new Date());
  return fecha;
}
