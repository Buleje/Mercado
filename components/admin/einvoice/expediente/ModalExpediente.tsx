"use client";

/**
 * Expediente de la operación (N03): un pedido o una venta con TODOS sus papeles
 * en una ventana — comprobante, notas, guías, cotización de origen, cobro y la
 * línea de tiempo. Se abre con `?expediente=<id>` desde cualquier pantalla y se
 * cierra borrando el parámetro. Sólo lectura: no emite ni guarda nada.
 */
import { FolderOpen, RefreshCw } from "@buleje/design-system/icons";
import { LoadingState } from "@buleje/design-system";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import type { AccionFaltante, Expediente } from "@/lib/comprobantes/expediente";
import { ExpedienteCuerpo } from "./ExpedienteCuerpo";
import { useExpediente } from "./use-expediente";
import { useExpedienteDeLaUrl } from "./expediente-url";

/** A dónde lleva cada faltante (siempre dentro de Comprobantes; la pantalla destino decide, no el expediente). */
function paramsDeAccion(accion: NonNullable<AccionFaltante>, exp: Expediente): Record<string, string> {
  const op = exp.operacion;
  switch (accion) {
    case "emitir":
      return op?.clase === "pedido" ? { vista: "facturas", emitir: op.id } : { vista: "facturas" };
    case "guia":
      return op ? { vista: "guias", guia: op.id } : { vista: "guias" };
    case "notas":
      return { vista: "notas" };
    default:
      return op ? { vista: "facturas", buscar: `#${op.id.slice(-6)}` } : { vista: "facturas" };
  }
}

export default function ModalExpediente() {
  const { ref, cerrar } = useExpedienteDeLaUrl();
  const { carga, recargar } = useExpediente(ref);
  const listo = carga.fase === "listo" ? carga.expediente : null;

  const ir = (accion: NonNullable<AccionFaltante>) => {
    if (!listo) return;
    /* Primero se borra `?expediente=`: `irAEnlace` copia el destino sobre la URL actual y la ventana volvería a abrirse. */
    cerrar();
    irAEnlace(hrefDeDestino({ tab: "facturacion", params: paramsDeAccion(accion, listo) }));
  };

  const titulo = listo?.operacion?.codigo ?? (listo?.documentos[0] ? `Documento ${listo.documentos[0].numero}` : "Expediente de la operación");

  return (
    <AdminModal
      open={ref != null}
      onClose={cerrar}
      title={titulo}
      size="xl"
      icon={FolderOpen}
      claveVentana="comprobantes-expediente"
      ayuda={
        <InfoTip
          what="Todo lo de una venta o un pedido en un solo lugar: sus comprobantes, notas, guías, la cotización de la que salió, cómo se cobró y qué pasó en cada momento."
          affects="Sólo lectura: los botones te llevan a la pantalla que resuelve cada pendiente; aquí no se emite ni se guarda nada."
          example="Pedido #a1b2c3 entregado sin boleta → «Falta su boleta o factura» → Emitir comprobante."
        />
      }
      footer={
        <ModalFooter nota="Sólo lectura: el expediente no emite ni guarda nada.">
          <button type="button" onClick={recargar} disabled={carga.fase === "cargando"} className={button({ variant: "secondary", className: "rounded-xl" })}>
            <RefreshCw className="h-4 w-4" aria-hidden /> Actualizar
          </button>
          <button type="button" onClick={cerrar} className={button({ variant: "primary", className: "rounded-xl" })}>
            Cerrar
          </button>
        </ModalFooter>
      }
    >
      <div className={MODAL_BODY} data-qa="expediente-cuerpo">
        {carga.fase === "cargando" ? (
          <LoadingState message="Armando el expediente…" />
        ) : carga.fase === "error" ? (
          <p role="alert" className="text-sm font-semibold text-[var(--data-error-ink)] dark:text-[var(--data-error-500)]">
            {carga.mensaje}
          </p>
        ) : (
          <ExpedienteCuerpo expediente={carga.expediente} onIr={ir} />
        )}
      </div>
    </AdminModal>
  );
}
