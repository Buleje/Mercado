"use client";

import { useMemo, useState } from "react";
import { CardTitle } from "@buleje/design-system";
import { Activity, AlertTriangle, ChevronDown, Copy, ExternalLink, Loader2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { EnlacePanel } from "@/components/admin/shared/EnlacePanel";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import SegmentedControl from "@/components/ui-system/SegmentedControl";
import { CLASE_CHIP } from "@/components/admin/rrhh/rrhh-form";
import { fechaConDia } from "@/lib/admin/inicio/formato-tablero";
import { formatTime } from "@/lib/format";
import { cn, limaDateKey } from "@/lib/utils";
import {
  actorDeEvento,
  agruparFeed,
  filtrarFeed,
  type EventoFeed,
  type FiltroFeed,
  type GrupoFeed,
  type TipoActor,
} from "@/lib/delivery/feed-eventos";
import { TRACKING_STATUS_LABELS, type LiveTrackingEvent, type TrackingStatus } from "./types";
import { TRACKING_STATUS_ICON } from "./status-icons";
import { useEnlaceSeguimiento } from "./use-enlace-seguimiento";

/**
 * Movimientos del día (17-10, P18). Antes: 12 tarjetas sueltas, sin enlace al
 * pedido, con hora relativa y sin decir quién movió cada cosa (el GPS, una
 * persona o el sistema). Ahora: un renglón por pedido que abre el pedido, con
 * hora exacta, quién fue y TODOS sus movimientos al desplegar; «Por atender»
 * deja sólo los fallidos y los que llevan rato sin novedad.
 */

const POR_PAGINA = 20;

const COLOR_ACTOR: Record<TipoActor, string> = {
  gps: "bg-[var(--data-info-100)] text-[var(--data-info-700)]",
  repartidor: "bg-[var(--data-info-100)] text-[var(--data-info-700)]",
  negocio: "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]",
  cliente: "bg-[var(--data-success-100)] text-[var(--data-success-700)]",
  sistema: "bg-[var(--surface-sunken)] text-[var(--text-secondary)]",
};

function rotuloEstado(status: string): string {
  return TRACKING_STATUS_LABELS[status as TrackingStatus] ?? status;
}

function horaExacta(iso: string): string {
  const hora = formatTime(iso);
  return limaDateKey(iso) === limaDateKey() ? hora : `${fechaConDia(iso)} ${hora}`;
}

function ChipActor({ evento }: { evento: EventoFeed }) {
  const a = actorDeEvento(evento);
  return <span className={cn(CLASE_CHIP, COLOR_ACTOR[a.tipo])}>{a.rotulo}</span>;
}

interface Props {
  events: LiveTrackingEvent[];
  loading: boolean;
  error: string | null;
}

export function FeedEventosReparto({ events, loading, error }: Props) {
  const [filtro, setFiltro] = useState<FiltroFeed>("todos");
  const [abiertos, setAbiertos] = useState<Set<string>>(() => new Set());
  const [visibles, setVisibles] = useState(POR_PAGINA);
  const enlace = useEnlaceSeguimiento();

  const grupos = useMemo(() => agruparFeed(events), [events]);
  const filtrados = useMemo(() => filtrarFeed(grupos, filtro), [grupos, filtro]);
  const cuenta = useMemo(
    () => ({
      atender: grupos.filter((g) => g.porAtender).length,
      curso: grupos.filter((g) => !g.cerrado).length,
      cerrados: grupos.filter((g) => g.cerrado).length,
    }),
    [grupos],
  );

  const alternar = (orderId: string) =>
    setAbiertos((prev) => {
      const s = new Set(prev);
      if (s.has(orderId)) s.delete(orderId);
      else s.add(orderId);
      return s;
    });

  return (
    <section
      className="bg-[var(--surface-raised)] border border-[var(--rule-base)] rounded-2xl shadow-[var(--shadow-sm)] overflow-hidden"
      aria-labelledby="feed-heading"
    >
      <div className="px-4 py-3 sm:px-6 border-b border-[var(--rule-base)] flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Activity className="h-5 w-5 text-[var(--accent-ink)] dark:text-[var(--accent)]" aria-hidden />
          <CardTitle id="feed-heading">Movimientos del día</CardTitle>
          <span className="text-sm font-bold text-[var(--text-tertiary)] tabular-nums">
            {grupos.length} pedidos · {events.length} movimientos
          </span>
          <InfoTip
            title="Movimientos del día"
            what="Lo que pasó con cada pedido en las últimas 24 horas, agrupado por pedido. Al desplegar ves todos sus movimientos, con la hora exacta y quién lo movió."
            affects="«GPS del repartidor» = su celular mandó la ubicación; «Alguien del negocio» = una persona lo marcó a mano; «Cálculo del sistema» = el sistema lo estimó."
            example={`«Por atender» deja los que fallaron, se cancelaron o llevan más de 30 min en camino sin novedad.`}
          />
        </div>
        <SegmentedControl<FiltroFeed>
          value={filtro}
          onChange={(f) => {
            setFiltro(f);
            setVisibles(POR_PAGINA);
          }}
          label="Qué pedidos ver"
          size="lg"
          options={[
            { value: "atender", label: "Por atender", badge: cuenta.atender },
            { value: "curso", label: "En camino", badge: cuenta.curso },
            { value: "cerrados", label: "Cerrados", badge: cuenta.cerrados },
            { value: "todos", label: "Todos", badge: grupos.length },
          ]}
        />
      </div>

      <div className="p-3 sm:p-4">
        {loading && events.length === 0 ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm font-bold text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Trayendo los movimientos…
          </p>
        ) : error && events.length === 0 ? (
          <p className="py-8 text-center text-sm font-bold text-[var(--data-error-700)]">
            No se pudieron traer los movimientos. Se reintenta solo cada 10 segundos.
          </p>
        ) : filtrados.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-tertiary)]">
            {filtro === "atender"
              ? "Nada por atender: ningún pedido falló ni lleva rato sin novedad."
              : grupos.length === 0
                ? "Cuando un repartidor recoja un pedido, sus movimientos aparecen acá."
                : "Ningún pedido con este filtro."}
          </p>
        ) : (
          <ul className="divide-y divide-[var(--rule-soft)]" role="list">
            {filtrados.slice(0, visibles).map((g) => (
              <FilaGrupo
                key={g.orderId}
                grupo={g}
                abierto={abiertos.has(g.orderId)}
                onAlternar={() => alternar(g.orderId)}
                acciones={[
                  {
                    id: "copiar",
                    label: "Copiar enlace para el cliente",
                    hint: "Vale 24 horas y sólo muestra este pedido",
                    icon: Copy,
                    busy: enlace.generando === g.orderId,
                    onSelect: () => void enlace.copiar(g.orderId),
                  },
                  {
                    id: "ver",
                    label: "Ver lo que ve el cliente",
                    icon: ExternalLink,
                    busy: enlace.generando === g.orderId,
                    onSelect: () => void enlace.abrir(g.orderId),
                  },
                ]}
              />
            ))}
          </ul>
        )}
        {filtrados.length > visibles && (
          <button
            type="button"
            onClick={() => setVisibles((v) => v + POR_PAGINA)}
            className="mt-3 h-12 w-full rounded-xl border border-[var(--rule-base)] text-sm font-bold text-[var(--text-secondary)] hover:bg-[var(--surface-sunken)]"
          >
            Ver {Math.min(POR_PAGINA, filtrados.length - visibles)} más ({visibles} de {filtrados.length})
          </button>
        )}
      </div>
    </section>
  );
}

function FilaGrupo({
  grupo: g,
  abierto,
  onAlternar,
  acciones,
}: {
  grupo: GrupoFeed;
  abierto: boolean;
  onAlternar: () => void;
  acciones: MenuAccion[];
}) {
  const Icono = TRACKING_STATUS_ICON[g.ultimo.status as TrackingStatus] ?? Activity;
  const fallido = g.ultimo.status === "failed" || g.ultimo.status === "cancelled";
  const idPanel = `feed-${g.orderId}`;
  return (
    <li className="py-3" data-qa="feed-grupo">
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
            fallido
              ? "bg-[var(--data-error-100)] text-[var(--data-error-700)]"
              : g.cerrado
                ? "bg-[var(--data-success-100)] text-[var(--data-success-700)]"
                : "bg-[var(--data-info-100)] text-[var(--data-info-700)]",
          )}
        >
          <Icono className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <EnlacePanel cosa="pedido" id={g.orderId} className="truncate text-base font-bold">
              {g.cliente ?? "Pedido sin nombre"}
            </EnlacePanel>
            <span className="text-sm font-bold text-[var(--text-primary)]">{rotuloEstado(g.ultimo.status)}</span>
            <span className="text-sm text-[var(--text-tertiary)] tabular-nums">{horaExacta(g.ultimo.createdAt)}</span>
            <ChipActor evento={g.ultimo} />
            {g.porAtender && (
              <span className={cn(CLASE_CHIP, "bg-[var(--data-warning-100)] text-[var(--data-warning-700)]")}>
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> {g.porAtender}
              </span>
            )}
          </div>
          {g.ultimo.description && (
            <p className="mt-0.5 line-clamp-1 text-sm text-[var(--text-secondary)]">{g.ultimo.description}</p>
          )}
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={abierto}
            aria-controls={idPanel}
            className="mt-1 inline-flex h-12 items-center gap-1 text-sm font-bold text-[var(--accent-ink)] dark:text-[var(--accent)]"
          >
            <ChevronDown className={cn("h-4 w-4 transition-transform", abierto && "rotate-180")} aria-hidden />
            {g.eventos.length === 1 ? "1 movimiento" : `${g.eventos.length} movimientos`}
            {g.repetidos > 0 && <span className="font-normal text-[var(--text-tertiary)]">({g.repetidos} repetidos)</span>}
          </button>
        </div>
        <ActionMenu label="Seguimiento para el cliente" actions={acciones} soloIcono className="w-12" />
      </div>
      {abierto && (
        <ol id={idPanel} className="mt-2 ml-[52px] space-y-2 border-l-2 border-[var(--rule-base)] pl-3">
          {g.eventos.map((e) => (
            <li key={e.id} className="text-sm">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="font-bold tabular-nums text-[var(--text-primary)]">{horaExacta(e.createdAt)}</span>
                <span className="text-[var(--text-primary)]">{rotuloEstado(e.status)}</span>
                <ChipActor evento={e} />
                {e.etaMinutes != null && <span className="text-[var(--text-tertiary)]">llega en ~{e.etaMinutes} min</span>}
              </div>
              {e.description && <p className="text-[var(--text-secondary)]">{e.description}</p>}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}
