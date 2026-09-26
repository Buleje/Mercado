"use client";

/**
 * El «3/6 docs» de cada guía en la tabla y en la tarjeta del celular (ADR-438),
 * sin pasar el conteo fila por fila: la vista de Ingresos lo pide UNA vez para
 * las guías en pantalla y lo deja en este contexto. Fuera del proveedor el chip
 * no dibuja nada y el menú no ofrece «Documentos».
 */

import { createContext, useContext, type ReactNode } from "react";
import { FolderOpen } from "@buleje/design-system/icons";
import { TOTAL_CASILLEROS } from "@/lib/forestal/documentos-guia";
import type { GuiaIngreso } from "@/lib/forestal/ingresos-por-guia";
import type { WoodEntry } from "./ctp-shared";

type Guia = GuiaIngreso<WoodEntry>;

export interface DocumentosGuiaCtx {
  /** Casilleros llenos por N° de guía; una guía sin medir no está. */
  llenos: Record<string, number>;
  abrir: (g: Guia) => void;
}

const Ctx = createContext<DocumentosGuiaCtx | null>(null);

export function DocumentosGuiaProvider({
  value,
  children,
}: {
  value: DocumentosGuiaCtx;
  children: ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useDocumentosGuiaCtx(): DocumentosGuiaCtx | null {
  return useContext(Ctx);
}

const TONO = {
  vacio: "bg-[var(--surface-sunken)] text-[var(--text-tertiary)]",
  parcial:
    "bg-[var(--data-info-500)]/12 text-[var(--data-info-700)] dark:text-[var(--data-info-500)]",
  completo:
    "bg-[var(--data-success-500)]/15 text-[var(--data-success-700)] dark:text-[var(--data-success-500)]",
} as const;

/** Chip-botón «3/6 docs»: abre los casilleros de la guía. */
export function ChipDocumentosGuia({ guia, className = "" }: { guia: Guia; className?: string }) {
  const ctx = useDocumentosGuiaCtx();
  const n = ctx?.llenos[guia.gtfNumber];
  if (!ctx || n == null) return null;
  const tono = n === 0 ? TONO.vacio : n >= TOTAL_CASILLEROS ? TONO.completo : TONO.parcial;
  return (
    <button
      type="button"
      onClick={() => ctx.abrir(guia)}
      title={`${n} de ${TOTAL_CASILLEROS} casilleros con archivo: factura, guías de remisión, lista de trozas, GTF y otros`}
      aria-label={`Documentos de la guía ${guia.gtfNumber}: ${n} de ${TOTAL_CASILLEROS}`}
      className={`inline-flex min-h-6 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums transition hover:opacity-80 ${tono} ${className}`}
    >
      <FolderOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
      {n}/{TOTAL_CASILLEROS} docs
    </button>
  );
}
