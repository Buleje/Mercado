"use client";

/**
 * Las campañas, una por fila: qué dice, a quién, por dónde, cuándo y cómo le
 * fue. Cancelar y Eliminar van en el «⋯» de la fila (antes: un botón de texto
 * y un ícono de 24 px sueltos). En el celular sale en tarjetas
 * (useMobileTableCards del shell lee las cabeceras). Los envíos «Uno por
 * uno» quedan acá con canal «Tu WhatsApp, uno por uno».
 */
import { DataTable } from "@buleje/design-system";
import { Ban, Loader2, MoreHorizontal, Trash2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { rotuloDeGrupo } from "@/lib/admin/grupos-mensaje";
import { formatNumber } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import { BarraFiltrosTabla, SinCoincidenciasFila, useFiltrosTabla, type ColumnaFiltro } from "@/components/admin/forestal/filtros-tabla-forestal";
import { ThColumna } from "@/components/admin/shared/th-columna";
import { useOrdenColumna, type AccesorOrden } from "@/components/admin/shared/use-orden-columna";
import { CHANNEL_META, STATUS_META, cuandoCorto, sePuedeCancelar, type Campaign } from "./tipos";

function Resultado({ c }: { c: Campaign }) {
  if (!c.sentAt) return <span className="text-[var(--text-tertiary)]">—</span>;
  /* Uno por uno: el panel sólo sabe a cuántos les abriste el chat; si le diste enviar, lo sabe tu WhatsApp. */
  if (c.channel === "manual") {
    return (
      <span className="tabular-nums">
        {formatNumber(c.delivered || 0)} de {formatNumber(c.totalAudience || 0)} chats abiertos
      </span>
    );
  }
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

const cuando = (c: Campaign) => c.sentAt ?? c.scheduledAt;

/** La lista llega entera de /api/campaigns: los filtros son de cliente. */
const COLUMNAS: readonly ColumnaFiltro<Campaign>[] = [
  { id: "campana", label: "Campaña", tipo: "texto", valor: (c) => [c.name, c.message] },
  { id: "para", label: "Para quién", tipo: "multi", valor: (c) => rotuloDeGrupo(c.segment), soloConVarios: true },
  { id: "canal", label: "Canal", tipo: "multi", valor: (c) => (CHANNEL_META[c.channel] ?? CHANNEL_META.whatsapp).label, soloConVarios: true },
  { id: "estado", label: "Estado", tipo: "multi", valor: (c) => (STATUS_META[c.status] ?? STATUS_META.borrador).label, soloConVarios: true },
  { id: "envio", label: "Envío", tipo: "fecha", numero: (c) => (cuando(c) ? limaDateKey(cuando(c) as string) : null) },
];
const ORDEN: Record<string, AccesorOrden<Campaign>> = {
  campana: { valor: (c) => c.name, texto: true },
  para: { valor: (c) => rotuloDeGrupo(c.segment), texto: true },
  canal: { valor: (c) => (CHANNEL_META[c.channel] ?? CHANNEL_META.whatsapp).label, texto: true },
  estado: { valor: (c) => (STATUS_META[c.status] ?? STATUS_META.borrador).label, texto: true },
  envio: { valor: (c) => cuando(c) },
  resultado: { valor: (c) => (c.sentAt ? c.delivered || 0 : null) },
};

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
  const f = useFiltrosTabla(campaigns, COLUMNAS);
  const ord = useOrdenColumna(ORDEN);
  const filas = ord.ordenar(f.filtradas);
  return (
    <>
    <BarraFiltrosTabla excel="Campañas" vistas="campanas" f={f} className="px-3 pt-3" />
    <DataTable>
      <thead>
        <tr>
          <ThColumna label="Campaña" ids={["campana"]} f={f} orden={ord} ordenId="campana" />
          <ThColumna label="Para quién" ids={["para"]} f={f} orden={ord} ordenId="para" />
          <ThColumna label="Canal" ids={["canal"]} f={f} orden={ord} ordenId="canal" />
          <ThColumna label="Estado" ids={["estado"]} f={f} orden={ord} ordenId="estado" />
          <ThColumna label="Envío" ids={["envio"]} f={f} orden={ord} ordenId="envio" />
          <ThColumna label="Resultado" orden={ord} ordenId="resultado" />
          <th className="w-14" data-label="Acciones"><span className="sr-only">Acciones</span></th>
        </tr>
      </thead>
      <tbody>
        {filas.length === 0 && <SinCoincidenciasFila colSpan={7} />}
        {filas.map((c) => {
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
                {rotuloDeGrupo(c.segment)} · <span className="tabular-nums">{c.totalAudience}</span>
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
    </>
  );
}
