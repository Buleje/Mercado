"use client";

/**
 * Las campañas, una por fila: qué dice, a quién, por dónde, cuándo y cómo le
 * fue. Cancelar y Eliminar van en el «⋯» de la fila (antes: un botón de texto
 * y un ícono de 24 px sueltos). En el celular sale en tarjetas
 * (useMobileTableCards del shell lee las cabeceras).
 */
import { DataTable } from "@buleje/design-system";
import { Ban, Loader2, MoreHorizontal, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import { CHANNEL_META, SEGMENT_LABELS, STATUS_META, cuandoCorto, sePuedeCancelar, type Campaign } from "./tipos";

function Resultado({ c }: { c: Campaign }) {
  if (!c.sentAt) return <span className="text-[var(--text-tertiary)]">—</span>;
  const entregados = c.delivered || 0;
  const abiertos = c.opened || 0;
  const pct = entregados > 0 ? ` (${Math.round((abiertos / entregados) * 100)} %)` : "";
  return (
    <span className="tabular-nums">
      {formatNumber(entregados)} entregados · {formatNumber(abiertos)} abiertos{pct}
      {(c.conversions || 0) > 0 && <span className="text-[var(--data-success-ink)]"> · {c.conversions} compraron</span>}
    </span>
  );
}

export function TablaCampanas({
  campaigns,
  busyId,
  onCancelar,
  onEliminar,
}: {
  campaigns: Campaign[];
  busyId: string | null;
  onCancelar: (id: string) => void;
  onEliminar: (id: string) => void;
}) {
  return (
    <DataTable>
      <thead>
        <tr>
          <th>Campaña</th>
          <th>Para quién</th>
          <th>Canal</th>
          <th>Estado</th>
          <th>Envío</th>
          <th>Resultado</th>
          <th className="w-14"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {campaigns.map((c) => {
          const estado = STATUS_META[c.status] ?? STATUS_META.borrador;
          const canal = CHANNEL_META[c.channel] ?? CHANNEL_META.whatsapp;
          const ocupada = busyId === c.id;
          const acciones: MenuAccion[] = [
            ...(sePuedeCancelar(c.status)
              ? [{ id: "cancelar", label: "Cancelar el envío", hint: "No sale; queda en la lista como cancelada", icon: Ban, onSelect: () => onCancelar(c.id), disabled: ocupada }]
              : []),
            { id: "eliminar", label: "Eliminar", hint: "La saca de la lista", icon: Trash2, tone: "danger", onSelect: () => onEliminar(c.id), disabled: ocupada },
          ];
          return (
            <tr key={c.id}>
              <td className="max-w-[22rem]">
                <p className="truncate font-semibold text-[var(--text-primary)]">{c.name}</p>
                <p className="truncate text-sm text-[var(--text-secondary)]" title={c.message}>{c.message}</p>
              </td>
              <td className="whitespace-nowrap text-[var(--text-secondary)]">
                {SEGMENT_LABELS[c.segment] ?? c.segment} · <span className="tabular-nums">{c.totalAudience}</span>
              </td>
              <td className="whitespace-nowrap text-[var(--text-secondary)]">{canal.label}</td>
              <td>
                <span className={cn("inline-flex whitespace-nowrap rounded-full px-2.5 py-0.5 text-sm font-semibold", estado.clase)}>{estado.label}</span>
              </td>
              <td className="whitespace-nowrap text-[var(--text-secondary)]">{cuandoCorto(c.sentAt ?? c.scheduledAt)}</td>
              <td className="text-[var(--text-secondary)]"><Resultado c={c} /></td>
              <td className="text-right">
                {ocupada ? (
                  <Loader2 className="ml-auto h-5 w-5 animate-spin text-[var(--text-tertiary)]" aria-label="Guardando…" />
                ) : (
                  <ActionMenu label={`Acciones de ${c.name}`} icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12" />
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
