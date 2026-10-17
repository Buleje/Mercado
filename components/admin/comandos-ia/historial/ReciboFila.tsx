"use client";

import {
  BellRing,
  CheckCircle2,
  FileText,
  HandCoins,
  MessageCircle,
  ShoppingCart,
  Sparkles,
  Tags,
  Undo2,
  type LucideIcon,
} from "@buleje/design-system/icons";
import { horaLima, usd, type ReciboIA } from "./use-recibos";

/** Ícono y cómo se cuentan las filas de cada tipo de recibo. */
const TIPOS: Record<string, { icono: LucideIcon; unidad: [string, string] }> = {
  compra: { icono: ShoppingCart, unidad: ["ítem", "ítems"] },
  cobro: { icono: HandCoins, unidad: ["cobro", "cobros"] },
  documento: { icono: FileText, unidad: ["documento", "documentos"] },
  mensajes: { icono: MessageCircle, unidad: ["mensaje", "mensajes"] },
  recordatorio: { icono: BellRing, unidad: ["recordatorio", "recordatorios"] },
  precios: { icono: Tags, unidad: ["precio", "precios"] },
  "precios-deshecho": { icono: Undo2, unidad: ["precio", "precios"] },
};
const OTRO = { icono: Sparkles, unidad: ["fila", "filas"] as [string, string] };

interface Props {
  recibo: ReciboIA;
  /** El rol puede deshacer precios (admin/dueño/encargado). */
  puedeDeshacer: boolean;
  onDeshacer: (recibo: ReciboIA) => void;
}

export default function ReciboFila({ recibo, puedeDeshacer, onDeshacer }: Props) {
  const t = TIPOS[recibo.tipo] ?? OTRO;
  const Icono = t.icono;
  const deshacible = recibo.tipo === "precios" && !recibo.deshecho;
  const meta = [
    horaLima(recibo.createdAt),
    recibo.filas != null && recibo.filas > 0
      ? `${recibo.filas} ${t.unidad[recibo.filas === 1 ? 0 : 1]}`
      : null,
    recibo.user,
    recibo.costoIaUsd != null && recibo.costoIaUsd > 0 ? `IA ${usd(recibo.costoIaUsd)}` : "sin IA",
  ].filter(Boolean);

  // Desde `sm` el recibo va en UNA línea (qué · cuándo/quién/costo): con 17
  // recibos la lista bajó de dos renglones por fila a uno (10-10). Todo ≥14 px.
  return (
    <li className="flex items-center gap-3 py-2">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          recibo.tipo === "precios-deshecho"
            ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
            : "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
        }`}
        aria-hidden
      >
        <Icono className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-3">
        <p
          title={recibo.resumen}
          className={`break-words text-sm font-medium sm:min-w-0 sm:flex-1 sm:truncate ${
            recibo.deshecho
              ? "text-[var(--text-tertiary)] line-through"
              : "text-[var(--text-primary)]"
          }`}
        >
          {recibo.resumen}
        </p>
        {/* Cada dato entero en su renglón (a 400 px «IA $0.001» quedaba partido). */}
        <p className="text-sm text-[var(--text-tertiary)] sm:shrink-0">
          {meta.map((m, i) => (
            <span key={i} className="whitespace-nowrap">
              {i > 0 && " · "}
              {m}
            </span>
          ))}
        </p>
      </div>
      {deshacible && puedeDeshacer && (
        // En celular sólo el ícono: el texto del recibo no se aprieta a 3 renglones.
        <button
          type="button"
          onClick={() => onDeshacer(recibo)}
          aria-label={`Deshacer: ${recibo.resumen}`}
          title="Deshacer"
          className="inline-flex h-12 w-12 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-[var(--rule-base)] text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] sm:w-auto sm:px-3"
        >
          <Undo2 className="h-4 w-4" aria-hidden />
          <span className="hidden sm:inline">Deshacer</span>
        </button>
      )}
      {recibo.deshecho && (
        <span
          title="Deshecho"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-2 py-0.5 text-sm text-[var(--text-secondary)]"
        >
          <CheckCircle2 className="h-4 w-4" aria-hidden />
          <span className="sr-only">Deshecho</span>
          <span className="hidden sm:inline" aria-hidden>
            Deshecho
          </span>
        </span>
      )}
    </li>
  );
}
