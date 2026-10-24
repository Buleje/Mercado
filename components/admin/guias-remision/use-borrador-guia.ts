"use client";

/**
 * El borrador de «Nueva guía» en este navegador (auditoría de comprobantes F18,
 * 17-10): cerrar la ventana, recargar o perder la conexión ya no borra lo
 * escrito. Se guarda solo (medio segundo después de cada cambio), se recupera
 * al abrir y se borra al crear la guía o con «Empezar de cero». Vence a los 7 días.
 */
import { useEffect } from "react";
import { logger } from "@/lib/logger";
import type { PasoGuia, PedidoVinculado } from "./guia-reglas";
import { emptyItem, FORM_VACIO, type DraftItem, type FormGuia } from "./tipos";

const CLAVE = "bsm:guia-remision:borrador:v1";
const VENCE_MS = 7 * 24 * 60 * 60 * 1000;
const PASOS: readonly PasoGuia[] = ["origen", "destino", "transporte", "carga", "revisar"];

export interface BorradorGuia {
  paso: PasoGuia;
  form: FormGuia;
  items: DraftItem[];
  pedido: PedidoVinculado | null;
  /** ISO de la última vez que se guardó. */
  guardadoEn: string;
}

export function leerBorrador(ahora: number = Date.now()): BorradorGuia | null {
  try {
    const crudo = window.localStorage.getItem(CLAVE);
    if (!crudo) return null;
    const b = JSON.parse(crudo) as Partial<BorradorGuia> & { v?: number };
    const t = Date.parse(String(b.guardadoEn ?? ""));
    if (b.v !== 1 || !Number.isFinite(t) || ahora - t > VENCE_MS || !b.form || !Array.isArray(b.items)) {
      window.localStorage.removeItem(CLAVE);
      return null;
    }
    const items = b.items.filter((i): i is DraftItem => typeof i?.descripcion === "string").map((i) => ({ ...emptyItem(), ...i }));
    return {
      paso: PASOS.includes(b.paso as PasoGuia) ? (b.paso as PasoGuia) : "origen",
      form: { ...FORM_VACIO, ...b.form },
      items: items.length > 0 ? items : [emptyItem()],
      pedido: b.pedido && typeof b.pedido.id === "string" ? b.pedido : null,
      guardadoEn: String(b.guardadoEn),
    };
  } catch (err) {
    logger.warn("[guias] borrador ilegible", { error: String(err) });
    return null;
  }
}

export function guardarBorrador(b: Omit<BorradorGuia, "guardadoEn">): void {
  try {
    window.localStorage.setItem(CLAVE, JSON.stringify({ v: 1, guardadoEn: new Date().toISOString(), ...b }));
  } catch (err) {
    logger.warn("[guias] no se pudo guardar el borrador", { error: String(err) });
  }
}

export function borrarBorrador(): void {
  try {
    window.localStorage.removeItem(CLAVE);
  } catch (err) {
    logger.warn("[guias] no se pudo borrar el borrador", { error: String(err) });
  }
}

/** Guarda medio segundo después del último cambio, sólo con la ventana abierta y algo escrito. */
export function useAutoguardado(activo: boolean, borrador: Omit<BorradorGuia, "guardadoEn">): void {
  const { paso, form, items, pedido } = borrador;
  useEffect(() => {
    if (!activo) return;
    const t = window.setTimeout(() => guardarBorrador({ paso, form, items, pedido }), 500);
    return () => window.clearTimeout(t);
  }, [activo, paso, form, items, pedido]);
}
