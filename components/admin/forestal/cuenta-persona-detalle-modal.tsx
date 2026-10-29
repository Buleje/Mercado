"use client";

/**
 * «Ver toda su cuenta» (Brandon 28-10): la cuenta de UNA persona —Adelantos y
 * cuenta forestal unidas— sin salir de la ventana donde se elige a quién va la
 * madera. Es la MISMA fila de «Cuenta por persona» (`FilaCuentaPersona`, con
 * sus chips, su estado de cuenta y sus movimientos), no otra cuenta hecha acá.
 *
 * Liquidar y unir libretas abren sus propias ventanas, que no se apilan encima
 * de ésta: se hacen en Adelantos (en otra pestaña, para no perder lo que se
 * estaba anotando), con el enlace que ya abre Liquidar de esa persona.
 */
import { ExternalLink, Loader2, Wallet } from "@buleje/design-system/icons";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import FilaCuentaPersona from "@/components/admin/adelantos/cuentas/FilaCuentaPersona";
import { ACCION_LIQUIDAR, PARAM_ACCION, PARAM_PERSONA } from "@/components/admin/adelantos/cuentas/liquidar-por-url";
import { button } from "@/components/ui-system/button-variants";
import { useCuentasPersonas } from "@/hooks/use-cuentas-personas";
import { useMiRol } from "@/hooks/use-mi-rol";
import { BOTON_SECUNDARIO } from "./ctp-lotes-modal-marco";

const sinVincular = async () => false;

/** Adelantos (dentro de Mi Plata) en otra pestaña del navegador. */
function abrirAdelantos(params: Record<string, string>) {
  const q = new URLSearchParams({ tab: "plata", vista: "adelantos", ...params });
  window.open(`/admin?${q.toString()}`, "_blank", "noopener");
}

export default function CuentaPersonaDetalleModal({ clave, nombre, onClose }: {
  /** `benef:<id>` o `parte:<id>`: la misma clave de la cuenta unificada. */
  clave: string;
  nombre: string;
  onClose: () => void;
}) {
  const { forestal, personas, loading, error, reload } = useCuentasPersonas();
  const persona = personas.find((p) => p.clave === clave) ?? null;
  /* ADR-413: liquidar es de admin y dueño (Adelantos tampoco le muestra el botón a otro rol). */
  const rol = useMiRol();
  const puedeLiquidar = rol === "admin" || rol === "owner";

  return (
    <AdminModal
      open
      onClose={onClose}
      aboveModals
      size="lg"
      icon={Wallet}
      title={`Cuenta de ${nombre}`}
      description="Adelantos y cuenta forestal, juntos"
      claveVentana="cuenta-persona-detalle"
      footer={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {puedeLiquidar && persona && (
            <button type="button" className={button({ variant: "secondary", className: "mr-auto gap-2" })}
              onClick={() => abrirAdelantos({ [PARAM_ACCION]: ACCION_LIQUIDAR, [PARAM_PERSONA]: clave })} data-accion="liquidar-en-adelantos">
              <ExternalLink className="h-4 w-4" aria-hidden /> Liquidar en Adelantos
            </button>
          )}
          <button type="button" className={BOTON_SECUNDARIO} onClick={onClose}>Cerrar</button>
        </div>
      }
    >
      <div className={MODAL_BODY} data-vista="cuenta-persona-detalle">
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-8 text-sm text-[var(--text-tertiary)]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Cargando su cuenta…
          </p>
        ) : error ? (
          <p role="alert" className="py-6 text-center text-sm font-semibold text-[var(--data-error-700)] dark:text-[var(--data-error-500)]">{error}</p>
        ) : !persona ? (
          <p className="py-6 text-center text-sm text-[var(--text-tertiary)]">{nombre} todavía no tiene movimientos en Adelantos ni en la cuenta forestal.</p>
        ) : (
          <ul>
            <FilaCuentaPersona
              persona={persona}
              forestal={forestal}
              candidatos={[]}
              onVincular={sinVincular}
              onGoTab={(tab) => abrirAdelantos({ sub: tab })}
              puedeLiquidar={false}
              onCambio={reload}
              movimientosAbiertos
            />
          </ul>
        )}
      </div>
    </AdminModal>
  );
}
