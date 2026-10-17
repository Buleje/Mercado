"use client";

import { ErrorAlert } from "@buleje/design-system";
import { FileText, Pencil, ShoppingCart, Truck } from "@buleje/design-system/icons";
import type { DbSupplier } from "@/lib/jsondb";
import AdminModal, { MODAL_BODY } from "@/components/admin/shared/AdminModal";
import { BarraDeSecciones, idPestanaDeSeccion, type SeccionDeBarra } from "@/components/admin/shared/BarraDeSecciones";
import { ModalFooter } from "@/components/admin/shared/ModalFooter";
import SupplierScorecard from "@/components/admin/compras/SupplierScorecard";
import { button } from "@/components/ui-system/button-variants";
import { tipoDeDocumento } from "@/lib/compras/proveedor-identidad";
import FichaResumen from "./FichaResumen";
import FichaHistorial from "./FichaHistorial";
import { useFichaDeProveedor } from "./use-ficha-de-proveedor";

export const SECCIONES_FICHA = ["resumen", "entrega", "ordenes", "recepciones", "devoluciones", "cuentas"] as const;
export type SeccionFicha = (typeof SECCIONES_FICHA)[number];

const ID_PANEL = "ficha-proveedor";

interface Props {
  /** El proveedor que se consulta; `null` = cerrada. */
  proveedor: DbSupplier | null;
  /** `false` mientras se edita o se mira su estado de cuenta: la ficha espera detrás, sin cerrarse. */
  visible: boolean;
  seccion: SeccionFicha;
  onSeccion: (s: SeccionFicha) => void;
  onCerrar: () => void;
  onEditar: () => void;
  onEstadoDeCuenta: () => void;
  /** «Nueva orden» con este proveedor (lo pasa Compras; sin él no se muestra). */
  onNuevaOrden?: () => void;
}

/**
 * La ficha de CONSULTA del proveedor (C33): se abre para mirar, no para
 * escribir. Resumen (contacto, condiciones, documentación y cifras), cómo te
 * entrega, y su historial (órdenes con su comprobante, recepciones,
 * devoluciones y lo que le debes). Editar es un botón aparte que abre el
 * formulario; al cerrarlo se vuelve acá.
 */
export default function FichaProveedorModal({
  proveedor, visible, seccion, onSeccion, onCerrar, onEditar, onEstadoDeCuenta, onNuevaOrden,
}: Props) {
  const { ficha, error, cargando, recargar } = useFichaDeProveedor(proveedor?.id ?? null);
  const veDeuda = ficha?.veDeuda ?? false;

  const secciones: SeccionDeBarra<SeccionFicha>[] = [
    { clave: "resumen", rotulo: "Resumen" },
    { clave: "entrega", rotulo: "Cómo te entrega" },
    { clave: "ordenes", rotulo: "Órdenes", cuenta: ficha?.ordenes.length },
    { clave: "recepciones", rotulo: "Recepciones", cuenta: ficha?.recepciones.length },
    { clave: "devoluciones", rotulo: "Devoluciones", cuenta: ficha?.devoluciones.length },
    ...(veDeuda ? [{ clave: "cuentas" as const, rotulo: "Lo que le debes", cuenta: ficha?.resumen.cuentasAbiertas }] : []),
  ];
  // La sección «cuentas» pedida por quien no ve deuda cae al resumen.
  const activa: SeccionFicha = seccion === "cuentas" && ficha && !veDeuda ? "resumen" : seccion;

  const documento = proveedor ? (proveedor.documento || proveedor.ruc || "").trim() : "";
  const descripcion = proveedor
    ? [documento ? `${tipoDeDocumento(proveedor.tipoDocumento)} ${documento}` : "Sin documento", proveedor.estado === "inactivo" ? "Inactivo" : null]
        .filter(Boolean)
        .join(" · ")
    : undefined;

  return (
    <AdminModal
      open={!!proveedor && visible}
      onClose={onCerrar}
      title={proveedor?.name ?? "Proveedor"}
      description={descripcion}
      icon={Truck}
      size="xl"
      claveVentana="ficha-proveedor"
      footer={
        proveedor ? (
          <ModalFooter>
            {veDeuda && (ficha?.cuentas.length ?? 0) > 0 && (
              <button type="button" onClick={onEstadoDeCuenta} aria-haspopup="dialog" className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4" })}>
                <FileText className="h-4 w-4" aria-hidden />
                Estado de cuenta
              </button>
            )}
            <button type="button" onClick={onEditar} aria-haspopup="dialog" className={button({ variant: "secondary", className: "gap-1.5 rounded-xl px-4" })}>
              <Pencil className="h-4 w-4" aria-hidden />
              Editar
            </button>
            {onNuevaOrden && (
              <button type="button" onClick={onNuevaOrden} className={button({ variant: "primary", className: "gap-1.5 rounded-xl px-4" })}>
                <ShoppingCart className="h-4 w-4" aria-hidden />
                Nueva orden
              </button>
            )}
          </ModalFooter>
        ) : undefined
      }
    >
      {proveedor && (
        <div className={`${MODAL_BODY} space-y-4`}>
          <BarraDeSecciones<SeccionFicha>
            secciones={secciones}
            activa={activa}
            onCambiar={onSeccion}
            etiqueta={`Secciones de la ficha de ${proveedor.name}`}
            idPanel={ID_PANEL}
            tonoCuenta="neutro"
          />
          <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, activa)} aria-busy={cargando}>
            {activa === "entrega" ? (
              <SupplierScorecard supplierId={proveedor.id} />
            ) : error && !ficha ? (
              <ErrorAlert
                title="No se pudo abrir su historial"
                description={error}
                action={<button type="button" onClick={recargar} className={button({ variant: "secondary" })}>Reintentar</button>}
              />
            ) : activa === "resumen" ? (
              <FichaResumen proveedor={proveedor} ficha={ficha} />
            ) : (
              <FichaHistorial que={activa} ficha={ficha} />
            )}
          </div>
        </div>
      )}
    </AdminModal>
  );
}
