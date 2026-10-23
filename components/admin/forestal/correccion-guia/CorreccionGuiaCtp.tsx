"use client";

/**
 * El final de una fila de «Guías emitidas» del CTP (ADR-512): el chip del
 * pedido de corrección (si lo hay) y el menú ⋯ con «Pedir corrección». El
 * pedido se ata a la línea de despacho de la fila, pero el chip mira TODAS las
 * líneas de la misma guía: un pedido sobre la guía se ve en cada una.
 */

import { FileWarning } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import type { GuiaEmitida } from "@/lib/forestal/guias-emitidas";
import type { SolicitudCorreccionDTO } from "@/lib/soporte/correccion-guia";
import { useCorreccionesCtx } from "./contexto";
import CorreccionChip from "./CorreccionChip";
import { opcionesGuiaCtp } from "./opciones-de-la-guia";
import PedirCorreccionModal from "./PedirCorreccionModal";
import { useCorreccionDeLaFila } from "./use-correccion-de-la-fila";

const masReciente = (a: SolicitudCorreccionDTO | null, b: SolicitudCorreccionDTO | null) =>
  !a ? b : !b ? a : a.createdAt >= b.createdAt ? a : b;

export default function CorreccionGuiaCtp({
  g,
  lineas,
}: {
  g: GuiaEmitida;
  /** Todas las líneas de despacho de esta guía (la vista previa ofrece cada una). */
  lineas: readonly GuiaEmitida[];
}) {
  const ctx = useCorreccionesCtx();
  const corr = useCorreccionDeLaFila(g.despachoId, g.estado !== "anulada");
  const solicitud = lineas.reduce<SolicitudCorreccionDTO | null>((s, l) => masReciente(s, ctx?.de(l.despachoId) ?? null), corr.solicitud);
  const abierta = solicitud?.estado === "open" || solicitud?.estado === "in_review";
  if (!ctx) return null;
  return (
    <span className="ml-auto flex shrink-0 items-center gap-2">
      {solicitud && <CorreccionChip s={solicitud} />}
      {corr.puede && (
        <ActionMenu
          label={`Acciones de la GTF ${g.gtfNumber}`}
          title="Más acciones"
          soloIcono
          actions={[
            {
              id: "correccion",
              label: "Pedir corrección",
              hint: abierta
                ? "Ya tiene un pedido abierto: espera la respuesta de la plataforma"
                : "La guía emitida no se edita: la plataforma revisa tu pedido y, si corresponde, la anula y la emite de nuevo",
              icon: FileWarning,
              disabled: abierta,
              onSelect: () => corr.abrir("fila"),
            },
          ]}
        />
      )}
      {corr.desde && (
        <PedirCorreccionModal
          guia={{ entityType: "ctp_despacho", entityId: g.despachoId, gtfNumber: g.gtfNumber }}
          opciones={opcionesGuiaCtp(lineas.length ? lineas : [g])}
          onClose={corr.cerrar}
          onEnviada={(s) => {
            ctx.agregar(s);
            corr.cerrar();
          }}
        />
      )}
    </span>
  );
}
