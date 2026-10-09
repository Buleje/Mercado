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

  return (
    <li className="flex items-start gap-3 py-2.5">
      <span
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          recibo.tipo === "precios-deshecho"
            ? "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]"
            : "bg-[var(--accent-soft)] text-[var(--accent-ink)]"
        }`}
        aria-hidden
      >
        <Icono className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p
          className={`break-words text-sm font-medium ${
            recibo.deshecho
              ? "text-[var(--text-tertiary)] line-through"
              : "text-[var(--text-primary)]"
          }`}
        >
          {recibo.resumen}
        </p>
        {/* Cada dato entero en su renglón (a 400 px «IA $0.001» quedaba partido). */}
        <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
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
          className="inline-flex h-9 w-9 shrink-0 sm:w-auto items-center justify-center gap-1.5 rounded-lg border border-[var(--rule-base)] px-2 text-xs font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)] sm:px-2.5"
        >
          <Undo2 className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Deshacer</span>
        </button>
      )}
      {recibo.deshecho && (
        <span
          title="Deshecho"
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[var(--surface-sunken)] px-1.5 py-0.5 text-xs text-[var(--text-secondary)] sm:px-2"
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
          <span className="sr-only">Deshecho</span>
          <span className="hidden sm:inline" aria-hidden>
            Deshecho
          </span>
        </span>
      )}
    </li>
  );
}
