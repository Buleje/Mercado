"use client";

/**
 * «Por seguir» (F31): las abiertas que piden un empujón —vencen en 0-3 días o
 * llevan más de 3 días enviadas sin respuesta—, cada una con quién la hizo,
 * el celular del cliente y el último recordatorio. Plegada sigue mostrando
 * las cuentas en una línea (se recuerda por navegador).
 */
import { useMemo } from "react";
import { BellRing, ChevronDown, MessageCircle } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { DIAS_SIN_RESPUESTA, DIAS_VENCE_PRONTO, porSeguir, type Recordatorio } from "@/lib/cotizaciones/modelos";
import { textoQuedan } from "@/lib/cotizaciones/vigencia";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Cotizacion } from "./tipos";
import { haceCuanto, type Seguimiento } from "./use-seguimiento";

const VERDE = "text-[var(--data-success-ink)] dark:text-[var(--data-success-500)]";

/** «Ya le recordó Ana hace 3 h. ¿Recordar igual?» — en la fila o en el detalle. */
export function ConfirmarRecordatorio({ seguimiento, c }: { seguimiento: Seguimiento; c: Cotizacion }) {
  const { confirmar, recordar, cancelar } = seguimiento;
  if (confirmar?.c.id !== c.id) return null;
  return (
    <div role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-xl border border-[var(--data-warning-500)]/40 bg-[var(--data-warning-50)] p-2 text-sm dark:bg-[var(--data-warning-500)]/10">
      <span className="min-w-0 flex-1 text-[var(--text-primary)]">
        Ya le recordó {confirmar.ultimo.por} {haceCuanto(confirmar.ultimo.at)}. ¿Recordar igual?
      </span>
      <button type="button" onClick={cancelar} className={button({ variant: "ghost", className: "rounded-xl px-4" })}>No</button>
      <button type="button" onClick={() => recordar(c, true)} className={button({ variant: "secondary", className: "rounded-xl px-4" })}>Recordar igual</button>
    </div>
  );
}

export const textoUltimo = (r: Recordatorio | null) => (r ? `le recordó ${r.por} ${haceCuanto(r.at)}` : "sin recordatorio");

function Fila({ c, motivo, seguimiento, onAbrir }: { c: Cotizacion; motivo: string; seguimiento: Seguimiento; onAbrir: (c: Cotizacion) => void }) {
  const detalle = [motivo, c.createdBy ? `la hizo ${c.createdBy}` : null, c.customerId ? `cel.\u00a0${c.customerId}` : "sin celular", textoUltimo(seguimiento.ultimoDe(c.id))];
  return (
    <li className="flex flex-wrap items-center gap-2 py-1">
      <button type="button" onClick={() => onAbrir(c)} className="min-h-12 min-w-0 flex-1 rounded-xl px-2 text-left hover:bg-[var(--surface-sunken)]">
        <span className="flex items-baseline justify-between gap-2">
          <span className="truncate text-sm font-semibold text-[var(--text-primary)]">{c.numero} · {c.clienteNombre}</span>
          <span className="shrink-0 text-sm font-semibold tabular-nums text-[var(--text-primary)]">{formatCurrency(Number(c.total))}</span>
        </span>
        <span className="block text-sm text-[var(--text-secondary)]">{detalle.filter(Boolean).join(" · ")}</span>
      </button>
      <button type="button" onClick={() => seguimiento.recordar(c)} aria-label={`Recordar a ${c.clienteNombre} por WhatsApp`} className={button({ variant: "secondary", className: "shrink-0 gap-1.5 rounded-xl px-3" })}>
        <MessageCircle className={cn("h-4 w-4", VERDE)} aria-hidden /> <span className="max-sm:sr-only">Recordar</span>
      </button>
      <ConfirmarRecordatorio seguimiento={seguimiento} c={c} />
    </li>
  );
}

interface Props {
  cotizaciones: readonly Cotizacion[];
  seguimiento: Seguimiento;
  onAbrir: (c: Cotizacion) => void;
}

export function BandejaSeguimiento({ cotizaciones, seguimiento, onAbrir }: Props) {
  const [abierta, setAbierta] = useLocalStorage<boolean>("cot-por-seguir-abierta", true);
  const { vencenPronto, sinRespuesta } = useMemo(() => porSeguir(cotizaciones), [cotizaciones]);
  const total = vencenPronto.length + sinRespuesta.length;
  if (total === 0) return null;

  const cuentas = [
    vencenPronto.length ? `${vencenPronto.length} ${vencenPronto.length === 1 ? "vence" : "vencen"} pronto` : null,
    sinRespuesta.length ? `${sinRespuesta.length} sin respuesta` : null,
  ].filter(Boolean).join(" · ");

  return (
    <section aria-label="Cotizaciones por seguir" className="rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 py-1">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setAbierta((v) => !v)} aria-expanded={abierta} className="flex min-h-12 min-w-0 flex-1 items-center gap-2 text-left">
          <BellRing className="h-4 w-4 shrink-0 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <span className="shrink-0 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">Por seguir</span>
          <span className="truncate text-sm text-[var(--text-secondary)]">{cuentas}</span>
          <ChevronDown className={cn("ml-auto h-4 w-4 shrink-0 text-[var(--text-secondary)] transition-transform", abierta && "rotate-180")} aria-hidden />
        </button>
        <InfoTip
          title="Por seguir"
          what={`Enviadas o aceptadas que vencen en ${DIAS_VENCE_PRONTO} días o menos, y enviadas que llevan más de ${DIAS_SIN_RESPUESTA} días sin respuesta.`}
          affects="«Recordar» abre tu WhatsApp con el mensaje listo y anota quién y cuándo, para que nadie del equipo le escriba dos veces el mismo día. Las ya vencidas están en el aviso de arriba: renovarlas crea una cotización nueva."
          example="COT-0012 al colegio vence el jueves: Ana le recuerda hoy y la fila dice «le recordó Ana hace un rato»."
        />
      </div>
      {abierta && seguimiento.aviso && (
        <p role="status" className="mb-1 text-sm text-[var(--data-warning-ink)] dark:text-[var(--data-warning-500)]">{seguimiento.aviso}</p>
      )}
      {abierta && (
        <ul className="divide-y divide-[var(--rule-soft)] border-t border-[var(--rule-soft)] pb-1">
          {vencenPronto.map(({ c }) => (
            <Fila key={c.id} c={c} motivo={textoQuedan(c.validoHasta)} seguimiento={seguimiento} onAbrir={onAbrir} />
          ))}
          {sinRespuesta.map(({ c, dias }) => (
            <Fila key={c.id} c={c} motivo={`sin respuesta hace ${dias} días`} seguimiento={seguimiento} onAbrir={onAbrir} />
          ))}
        </ul>
      )}
    </section>
  );
}
