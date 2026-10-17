"use client";

/**
 * La lista de interesados. Por fila, UNA acción a la vista —pasarlo al paso
 * que sigue— y el resto en el «⋯» (marcar perdido, volver a Nuevo). Antes no
 * había forma de marcar a nadie como Perdido aunque el estado existía.
 * Lo que contó en el formulario (cuánto vende, qué le preocupa, cuándo quiere
 * la demo) va en el ⓘ del nombre: antes se guardaba y no se veía.
 */
import { ArrowRight, Loader2, MoreHorizontal, RotateCcw, XCircle } from "@buleje/design-system/icons";
import { DataTable } from "@buleje/design-system";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { cn } from "@/lib/utils";
import { ESTADOS, SIGUIENTE, estadoDe, llegoEl, rotuloCanal, rotuloTipo, type EstadoLead, type LeadRow } from "./tipos";

interface Props {
  filas: LeadRow[];
  moviendo: string | null;
  onEstado: (entityId: string, estado: EstadoLead) => void;
}

function LoQueConto({ l }: { l: LeadRow }) {
  if (!l.monthlyRevenue && !l.painPoint && !l.preferredDemoTime) return null;
  return (
    <InfoTip
      title="Lo que contó en el formulario"
      what={
        <span className="block space-y-1">
          {l.monthlyRevenue && <span className="block">Vende al mes: {l.monthlyRevenue}</span>}
          {l.painPoint && <span className="block">Le preocupa: {l.painPoint}</span>}
          {l.preferredDemoTime && <span className="block">Demo: {l.preferredDemoTime}</span>}
        </span>
      }
    />
  );
}

function Acciones({ l, moviendo, onEstado }: { l: LeadRow; moviendo: string | null; onEstado: Props["onEstado"] }) {
  const estado = estadoDe(l.status);
  const siguiente = SIGUIENTE[estado];
  const ocupado = moviendo === l.entityId;
  const otras: MenuAccion[] = [
    ...(estado !== "lost" && estado !== "won"
      ? [{ id: "perdido", label: "Marcar como perdido", hint: "Ya no le interesa o no contesta", icon: XCircle, tone: "danger" as const, onSelect: () => onEstado(l.entityId, "lost") }]
      : []),
    ...(estado !== "new"
      ? [{ id: "nuevo", label: "Volver a Nuevo", hint: "Si lo cambiaste por error o hay que empezar de nuevo", icon: RotateCcw, onSelect: () => onEstado(l.entityId, "new") }]
      : []),
  ];

  return (
    <div className="flex flex-nowrap! items-center justify-end gap-1">
      {siguiente ? (
        <button
          type="button"
          disabled={ocupado}
          onClick={() => onEstado(l.entityId, siguiente)}
          title={`Pasar a ${ESTADOS[siguiente].rotulo}`}
          className="inline-flex h-12 shrink-0 items-center gap-1.5 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm font-bold text-[var(--text-primary)] transition-colors hover:border-primary hover:text-[var(--accent-ink)] disabled:opacity-60 dark:hover:text-[var(--accent)]"
        >
          {ocupado ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <ArrowRight className="h-4 w-4" aria-hidden />}
          {ESTADOS[siguiente].rotulo}
        </button>
      ) : (
        <span className="px-3 text-sm text-[var(--text-secondary)]">Cerrado</span>
      )}
      {otras.length > 0 && (
        <ActionMenu
          label={`Más acciones de ${l.name}`}
          title="Marcar como perdido o volver a Nuevo"
          icon={MoreHorizontal}
          actions={otras}
          soloIcono
          size="md"
          className="w-12 shrink-0 border-transparent! bg-transparent! hover:bg-[var(--surface-sunken)]!"
        />
      )}
    </div>
  );
}

export function TablaLeads({ filas, moviendo, onEstado }: Props) {
  return (
    /* Encabezados a 14 px y sin versalitas: el DataTable los trae a 12. */
    <DataTable>
      <thead>
        <tr>
          <th>Interesado</th>
          <th>Negocio</th>
          <th>Canal</th>
          <th>Estado</th>
          <th>Llegó</th>
          <th className="text-right">
            <span className="sr-only">Acciones</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {filas.map((l) => {
          const e = ESTADOS[estadoDe(l.status)];
          return (
            <tr key={l.entityId}>
              <td>
                <div className="min-w-0">
                  <p className="flex items-center gap-1 font-medium text-[var(--text-primary)]">
                    <span className="truncate">{l.name}</span>
                    <LoQueConto l={l} />
                  </p>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {l.whatsappLast4 ? `WhatsApp ···${l.whatsappLast4}` : "Sin WhatsApp"}
                  </p>
                </div>
              </td>
              <td>
                <div className="min-w-0">
                  <p className="truncate text-[var(--text-primary)]">{l.businessName || rotuloTipo(l.businessType)}</p>
                  <p className="truncate text-sm text-[var(--text-secondary)]">
                    {l.businessName ? `${rotuloTipo(l.businessType)} · ` : ""}
                    {l.city}
                  </p>
                </div>
              </td>
              <td>{rotuloCanal(l.source)}</td>
              <td>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm font-semibold text-[var(--text-primary)]">
                  <span className={cn("h-2 w-2 shrink-0 rounded-full", e.punto)} aria-hidden />
                  {e.rotulo}
                </span>
              </td>
              <td className="whitespace-nowrap text-[var(--text-secondary)]">{llegoEl(l.createdAt)}</td>
              <td>
                <Acciones l={l} moviendo={moviendo} onEstado={onEstado} />
              </td>
            </tr>
          );
        })}
      </tbody>
    </DataTable>
  );
}
