"use client";

/**
 * Una cuenta de tesorería: cómo se llama, qué es, cuánto tiene hoy y con
 * cuánto empezó. Tocarla filtra los movimientos de abajo a esa cuenta (otra vez
 * la suelta): es un interruptor, por eso `aria-pressed`.
 */

import { BadgeStatus } from "@buleje/design-system";
import { cn } from "@/lib/utils";
import { formatDateShort } from "@/lib/format";
import { montoEnMoneda } from "@/lib/adelantos/cuenta-unificada";
import type { CuentaTesoreria } from "@/hooks/use-tesoreria";
import { tipoDeCuenta } from "./estilo";

interface Props {
  cuenta: CuentaTesoreria;
  elegida: boolean;
  onElegir: (id: string) => void;
}

export default function TarjetaCuenta({ cuenta: c, elegida, onElegir }: Props) {
  const tipo = tipoDeCuenta(c.tipo);
  const Icon = tipo.icon;
  const negativo = c.saldo < 0;
  return (
    <button
      type="button"
      onClick={() => onElegir(c.id)}
      aria-pressed={elegida}
      aria-label={`${c.nombre}: ${montoEnMoneda(c.saldo, c.moneda)}. ${elegida ? "Viendo sus movimientos; toca para ver todas" : "Toca para ver sus movimientos"}`}
      className={cn(
        "group flex min-w-0 flex-col gap-1 rounded-xl border bg-[var(--surface-raised)] p-4 text-left transition-all",
        "hover:-translate-y-0.5 hover:shadow-[var(--shadow-md)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
        elegida ? "border-[var(--accent)] ring-2 ring-[var(--accent-muted)]" : "border-[var(--rule-base)]",
        !c.activa && "opacity-90",
      )}
    >
      <span className="flex min-w-0 items-center gap-2">
        <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-sunken)] text-[var(--accent-ink)] dark:text-[var(--accent)]">
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold text-[var(--text-primary)]">{c.nombre}</span>
          <span className="block truncate text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">
            {tipo.label}{c.banco ? ` · ${c.banco}` : ""}{c.moneda !== "PEN" ? ` · ${c.moneda}` : ""}
          </span>
        </span>
        {!c.activa && <BadgeStatus variant="neutral" size="sm" label="Dada de baja" />}
      </span>

      <span
        className={cn(
          "mt-1 text-2xl font-extrabold tabular-nums",
          negativo ? "text-[var(--data-error-700)] dark:text-[var(--data-error-500)]" : "text-[var(--text-primary)]",
        )}
      >
        {montoEnMoneda(c.saldo, c.moneda)}
      </span>
      <span className="text-[length:var(--ts-xs)] text-[var(--text-secondary)]">
        Empezó con {montoEnMoneda(c.saldoInicial, c.moneda)} el {formatDateShort(c.createdAt)}
      </span>

      {(c.numeroCuenta || c.cci) && (
        <span className="text-[length:var(--ts-xs)] tabular-nums text-[var(--text-tertiary)]">
          {c.numeroCuenta && <>N.º {c.numeroCuenta}</>}
          {c.numeroCuenta && c.cci && " · "}
          {c.cci && <>CCI {c.cci}</>}
        </span>
      )}
      {c.notas && <span className="line-clamp-2 text-[length:var(--ts-xs)] text-[var(--text-tertiary)]">{c.notas}</span>}
    </button>
  );
}
