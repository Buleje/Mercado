"use client";

/**
 * Piezas de la tabla «General por especie» que se agregan al lado de
 * Participación (Brandon, 2026-10-02): el m³ (R) y la marca de «ya la revisé».
 *
 * Aparte de `resumen-tabla.tsx` porque ese archivo ya pasa las 300 líneas.
 */

import { useCallback, useEffect, useState } from "react";
import { RENDIMIENTO_META } from "@/lib/forestal/loctp-catalogos";
import { slugKey } from "@/lib/forestal/sembrar-reparto";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";

/** Rolliza que pide un volumen aserrado: m³ ÷ rendimiento meta (56 %). */
export const m3Rolliza = (m3: number): number => m3 / RENDIMIENTO_META;

/** Clase con la que se pinta TODA la fila marcada (la misma de «Reg.» del cubicador). */
export const FILA_MARCADA = "bg-[var(--data-success-50)] dark:bg-[var(--data-success-500)]/12";

/** Cabecera de «m³ (R)» con su ⓘ: dice que es un cálculo, no un dato medido. */
export function InfoM3R() {
  return (
    <InfoTip
      icono="info"
      title="m³ (R)"
      what={`Rolliza que pide: el m³ aserrado ÷ ${Math.round(RENDIMIENTO_META * 100)} % (rendimiento meta). Es un cálculo, no un dato medido.`}
      example="10,000 m³ aserrados → 17,857 m³ (R) de rolliza."
      side="bottom"
    />
  );
}

export interface MarcasEspecie {
  marcadas: ReadonlySet<string>;
  alternar: (clave: string) => void;
  todas: (claves: string[], marcar: boolean) => void;
}

/**
 * Las especies tildadas, recordadas en el almacenamiento del lote (misma clave
 * por negocio que el resto del cubicador). Sin storage sigue funcionando en
 * memoria: sólo no se recuerda.
 */
export function useMarcasEspecie(sufijo: string): MarcasEspecie {
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(slugKey(sufijo));
      const lista: unknown = raw ? JSON.parse(raw) : [];
      if (Array.isArray(lista)) setMarcadas(new Set(lista.filter((x): x is string => typeof x === "string")));
    } catch { /* sin storage o JSON roto: arranca vacío */ }
  }, [sufijo]);

  const guardar = useCallback((s: Set<string>) => {
    setMarcadas(s);
    try { localStorage.setItem(slugKey(sufijo), JSON.stringify([...s])); } catch { /* sin storage / cuota */ }
  }, [sufijo]);

  const alternar = useCallback((clave: string) => {
    const s = new Set(marcadas);
    if (!s.delete(clave)) s.add(clave);
    guardar(s);
  }, [marcadas, guardar]);

  const todas = useCallback((claves: string[], marcar: boolean) => {
    const s = new Set(marcadas);
    for (const k of claves) { if (marcar) s.add(k); else s.delete(k); }
    guardar(s);
  }, [marcadas, guardar]);

  return { marcadas, alternar, todas };
}

/** Un clic en la fila la tilda, salvo que haya caído sobre un control. */
export function clicEnFila(e: React.MouseEvent, alternar: () => void): void {
  if ((e.target as HTMLElement).closest("input, button, a, select, textarea, label, [role='button']")) return;
  alternar();
}
