"use client";

/**
 * «Quién te debe» — lo primero del Resumen de «Me deben»: cada cliente con lo
 * que debe, desde cuándo y cuánto de su límite ya usó, con «Cobrar» y
 * WhatsApp a un toque. Antes el Resumen abría con cifras sueltas y para saber
 * A QUIÉN cobrar había que ir a otra pestaña.
 *
 * Agrupa por cliente con la misma regla que Cobranza (`deudoresDeCobranza`) y
 * los ordena por urgencia. Los saldos vienen del servidor; acá sólo se suman
 * por cliente para mostrarlos.
 */
import { useMemo } from "react";
import { CardTitle } from "@buleje/design-system";
import { ChevronRight, DollarSign, MessageCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { formatCurrency } from "@/lib/format";
import { deudoresDeCobranza, explicarAtraso, ordenarPorUrgencia } from "@/lib/fiados/urgencia-cobranza";
import { FiadoAvatar } from "./FiadoBadges";
import { recordarPorWhatsApp } from "./recordar";
import { estaAbierto, type Fiado } from "./tipos";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const TOPE_FILAS = 5;

/** «jueves 10/09» en hora de Lima (UTC−5 fijo, sin horario de verano). */
function diaYFecha(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  return `${DIAS[d.getUTCDay()]} ${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

export type DeudorACobrar = { telefono: string; nombre: string; saldo: number };

type Props = {
  fiados: Fiado[];
  onCobrar: (d: DeudorACobrar) => void;
  onVerTodos: () => void;
  onRecordado?: () => void;
};

export default function QuienTeDebe({ fiados, onCobrar, onVerTodos, onRecordado }: Props) {
  const filas = useMemo(() => {
    const abiertos = fiados.filter((f) => estaAbierto(f) && f.saldo > 0);
    const desde = new Map<string, string>();
    const limite = new Map<string, number>();
    const cuantos = new Map<string, number>();
    for (const f of abiertos) {
      const prev = desde.get(f.customerId);
      if (!prev || f.createdAt < prev) desde.set(f.customerId, f.createdAt);
      if (f.customerCreditLimit) limite.set(f.customerId, f.customerCreditLimit);
      cuantos.set(f.customerId, (cuantos.get(f.customerId) ?? 0) + 1);
    }
    return ordenarPorUrgencia(deudoresDeCobranza(abiertos)).map((d) => ({
      ...d,
      desde: desde.get(d.id) ?? null,
      limite: limite.get(d.id) ?? 0,
      fiados: cuantos.get(d.id) ?? 0,
    }));
  }, [fiados]);

  if (filas.length === 0) return null;
  const visibles = filas.slice(0, TOPE_FILAS);

  return (
    <section aria-labelledby="quien-te-debe" className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)]">
      <div className="flex items-center gap-2 border-b border-[var(--rule-soft)] px-4 py-3">
        <CardTitle id="quien-te-debe" className="text-sm font-bold text-[var(--text-primary)]">
          Quién te debe <span className="font-semibold text-[var(--text-tertiary)]">· {filas.length}</span>
        </CardTitle>
        <InfoTip
          title="Quién te debe"
          what="Cada cliente con lo que te debe sumando todos sus fiados abiertos, primero los más atrasados."
          affects="«Cobrar» reparte el pago del fiado más viejo al más nuevo. WhatsApp usa tus plantillas de Cobranza y lo anota en la bitácora."
          example="Rosa · S/ 85.00 · desde jueves 10/09 · 29 días · usó 85 % de su límite de S/ 100."
        />
        {filas.length > TOPE_FILAS && (
          <button type="button" onClick={onVerTodos} className="ml-auto inline-flex items-center gap-0.5 text-xs font-bold text-[var(--accent-ink)] hover:underline dark:text-[var(--accent)]">
            Ver los {filas.length} <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        )}
      </div>
      <ul className="divide-y divide-[var(--rule-soft)]">
        {visibles.map((d) => {
          const uso = d.limite > 0 ? Math.round((d.saldo / d.limite) * 100) : null;
          const atrasado = d.base === "vencimiento" && d.dias > 0;
          return (
            <li key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2.5">
              <FiadoAvatar nombre={d.nombre} />
              <div className="min-w-0 flex-1 basis-40">
                <p className="truncate text-sm font-semibold text-[var(--text-primary)]">
                  {d.nombre}
                  {d.fiados > 1 && <span className="font-normal text-[var(--text-tertiary)]"> · {d.fiados} fiados</span>}
                </p>
                <p className="text-xs text-[var(--text-secondary)]" title={explicarAtraso(d)}>
                  {d.desde ? `desde ${diaYFecha(d.desde)}` : "sin fecha"}
                  {" · "}
                  <span className={cn(atrasado && "font-bold text-[var(--data-error-500)]")}>
                    {atrasado ? `${d.dias} d vencido` : `${d.dias} d`}
                  </span>
                </p>
              </div>
              {uso !== null && (
                <div className="w-28 shrink-0" title={`Usa ${formatCurrency(d.saldo)} de su límite de ${formatCurrency(d.limite)}`}>
                  <div className="h-1.5 overflow-hidden rounded-full bg-[var(--surface-sunken)]">
                    <div className={cn("h-full rounded-full", uso >= 100 ? "bg-[var(--data-error-500)]" : uso >= 80 ? "bg-[var(--data-warning-500)]" : "bg-[var(--accent)]")} style={{ width: `${Math.min(100, uso)}%` }} />
                  </div>
                  <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">{uso} % de {formatCurrency(d.limite)}</p>
                </div>
              )}
              <p className="w-24 shrink-0 text-right font-mono text-sm font-bold tabular-nums text-[var(--data-error-500)]">{formatCurrency(d.saldo)}</p>
              <div className="flex shrink-0 items-center gap-1.5">
                <button type="button" aria-label={`Recordar a ${d.nombre} por WhatsApp`} title="Recordar por WhatsApp"
                  onClick={() => recordarPorWhatsApp({ telefono: d.telefono, nombre: d.nombre, saldo: d.saldo, dias: d.dias }, onRecordado)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/12 text-[var(--accent-ink)] transition-colors hover:bg-primary/20 dark:text-[var(--accent)]">
                  <MessageCircle className="h-4 w-4" aria-hidden />
                </button>
                <button type="button" onClick={() => onCobrar({ telefono: d.telefono, nombre: d.nombre, saldo: d.saldo })}
                  className="inline-flex h-9 items-center gap-1 rounded-xl bg-primary px-3 text-sm font-semibold text-white transition-colors hover:bg-primary-dark">
                  <DollarSign className="h-4 w-4" aria-hidden /> Cobrar
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
