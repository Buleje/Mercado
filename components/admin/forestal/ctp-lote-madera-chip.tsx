/**
 * La etiqueta «¿este lote tiene madera?» de la tarjeta (Brandon, 2026-10-02).
 *
 * La tarjeta decía cuánto entró a la sierra y cuánto rindió, pero no si esa
 * madera SIGUE en el patio: para eso había que abrir «Productos». Esta línea lo
 * dice de una pasada — con madera, parte salió, salió con guía, salió sin guía
 * (uso interno) o aún sin aserrar — y las reglas son las de
 * `ctp-lotes-seleccion.ts`, las mismas que usa el filtro rápido y la barra.
 *
 * Texto primario sobre el tinte del tono (el texto de color sobre su propio
 * tinte no llega a AA en oscuro); el color lo lleva el punto y el borde. Lo que
 * salió sin guía NUNCA se rotula «Despachado» ni lleva camión: no hubo guía.
 */

import { formatNumber } from "@/lib/format";
import { AYUDA_MADERA, type LoteAserrio } from "@/lib/forestal/lotes-aserrio";
import { diaCorto, maderaDe, type EstadoMaderaLote, type MaderaDelLote } from "./ctp-lotes-seleccion";

type Tono = "ok" | "aviso" | "neutro";

const CAJA: Record<Tono, string> = {
  ok: "border-[var(--data-success-500)]/50 bg-[var(--data-success-500)]/12",
  aviso: "border-[var(--data-warning-500)]/50 bg-[var(--data-warning-500)]/12",
  neutro: "border-[var(--rule-base)] bg-[var(--surface-sunken)]",
};
const PUNTO: Record<Tono, string> = {
  ok: "bg-[var(--data-success-500)]",
  aviso: "bg-[var(--data-warning-500)]",
  neutro: "bg-[var(--text-tertiary)]",
};
const TONO: Record<EstadoMaderaLote, Tono> = {
  con_madera: "ok",
  parcial: "aviso",
  despachada: "neutro",
  usada: "neutro",
  sin_saldo: "neutro",
  sin_produccion: "neutro",
};

const m3 = (v: number) => `${formatNumber(v, 2)} m³`;

/** «019-000123» y, si salió en varias, «+2». */
function guiasEnTexto(guias: readonly string[]): string {
  if (guias.length === 0) return "";
  return guias.length === 1 ? ` ${guias[0]}` : ` ${guias[0]} +${guias.length - 1}`;
}

/** La frase de la etiqueta, armada sólo con lo que vino. */
export function textoMadera(m: MaderaDelLote): string {
  const el = (iso: string | null) => {
    const d = diaCorto(iso);
    return d ? ` el ${d}` : "";
  };
  switch (m.estado) {
    case "con_madera": {
      const desde = diaCorto(m.aserradaEl);
      return `Con madera aserrada · ${m3(m.m3Disponible)}${desde ? ` · desde ${desde}` : ""}`;
    }
    case "parcial":
      return `Parte salió · quedan ${m3(m.m3Disponible)}`;
    case "despachada":
      return `Sin madera · salió con guía${guiasEnTexto(m.guias)}${el(m.salioEl)}`;
    case "usada":
      return `Sin madera · salió sin guía (uso interno)${el(m.salioEl)}`;
    case "sin_saldo":
      return "Sin madera en patio";
    case "sin_produccion":
      return "Aún sin aserrar";
  }
}

export function LoteMaderaChip({ lote }: { lote: LoteAserrio }) {
  const m = maderaDe(lote);
  if (!m) return null;
  const tono = TONO[m.estado];
  const texto = textoMadera(m);
  return (
    <p
      data-madera={m.estado}
      title={m.guias.length > 1 ? `${AYUDA_MADERA[m.estado]} Guías: ${m.guias.join(", ")}.` : AYUDA_MADERA[m.estado]}
      className={`flex items-center gap-2 self-start rounded-lg border px-2 py-1 text-sm font-semibold text-[var(--text-primary)] ${CAJA[tono]}`}
    >
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${PUNTO[tono]}`} />
      <span className="min-w-0">{texto}</span>
    </p>
  );
}
