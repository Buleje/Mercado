"use client";

/**
 * Comprobantes › Seguimiento (N02 + N08): una vista con dos secciones
 * (ADR-489: una barra, se ve una cosa a la vez).
 *  - Pendientes: la bandeja de lo que quedó a medias (F56/M58).
 *  - Conciliación: lo vendido frente a lo facturado, por período (N08).
 * Al lado, «Expediente»: escribe el código de un pedido, venta o documento y
 * se abre su expediente (N03). Nada de esta vista emite ni guarda documentos.
 */
import { useState, type FormEvent } from "react";
import { SectionTitle } from "@buleje/design-system";
import { FolderOpen, RefreshCw } from "@buleje/design-system/icons";
import { BarraDeSecciones, idPestanaDeSeccion } from "@/components/admin/shared/BarraDeSecciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { button } from "@/components/ui-system/button-variants";
import { useSubvistaModulo } from "@/hooks/use-vista-modulo";
import { abrirExpediente } from "../expediente/expediente-url";
import { BandejaPendientes } from "./BandejaPendientes";
import { ConciliacionDocumental } from "./ConciliacionDocumental";
import { usePendientes } from "./use-pendientes";

export const SECCIONES_SEGUIMIENTO = ["pendientes", "conciliacion"] as const;
type Seccion = (typeof SECCIONES_SEGUIMIENTO)[number];

const ID_PANEL = "comprobantes-seguimiento-panel";

/** El código de una operación o documento → su expediente. Enter sólo ABRE (lectura). */
function BuscarExpediente() {
  const [ref, setRef] = useState("");
  const limpio = ref.trim();
  const abrir = (e: FormEvent) => {
    e.preventDefault();
    if (limpio.length >= 2) abrirExpediente(limpio);
  };
  return (
    <form onSubmit={abrir} className="flex min-w-0 items-center gap-1" role="search" aria-label="Abrir el expediente de una operación">
      <input
        value={ref}
        onChange={(e) => setRef(e.target.value)}
        placeholder="#pedido, venta o B001-12"
        aria-label="Código del pedido, la venta o el documento"
        data-qa="buscar-expediente"
        className="h-12 w-44 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] sm:w-56"
      />
      <button type="submit" disabled={limpio.length < 2} title="Abrir expediente" aria-label="Abrir expediente" className={button({ variant: "secondary", size: "icon", className: "rounded-xl" })}>
        <FolderOpen className="h-4 w-4" aria-hidden />
      </button>
    </form>
  );
}

export default function SeguimientoModule() {
  const { vista, irA } = useSubvistaModulo<Seccion>("comprobantes-seguimiento", SECCIONES_SEGUIMIENTO, "pendientes");
  const { carga, recargar } = usePendientes();
  const cuenta = carga.fase === "listo" ? carga.pendientes.length : undefined;
  /* «hace N días» contado desde que abriste la vista (estable entre recargas). */
  const [ahora] = useState(() => Date.now());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Seguimiento</SectionTitle>
        <InfoTip
          title="Seguimiento"
          what="Pendientes: lo que quedó a medias en tus papeles (rechazos, comprobantes sin respuesta, notas y guías en borrador, cotizaciones por vencer, pedidos entregados sin boleta). Conciliación: lo vendido frente a lo facturado en un período."
          affects="Cada pendiente se cierra solo cuando su origen se resuelve; aquí nada se emite ni se guarda."
          example="Boleta B001-40 sin respuesta de SUNAT desde ayer → no la reenvíes: consulta su estado; reenviarla la duplicaría."
          side="bottom"
        />
        <BarraDeSecciones
          secciones={[
            { clave: "pendientes", rotulo: "Pendientes", cuenta },
            { clave: "conciliacion", rotulo: "Conciliación" },
          ]}
          activa={vista}
          onCambiar={irA}
          etiqueta="Secciones de Seguimiento"
          idPanel={ID_PANEL}
        />
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <BuscarExpediente />
          {vista === "pendientes" && (
            <button
              type="button"
              onClick={recargar}
              disabled={carga.fase === "cargando"}
              aria-label="Actualizar la bandeja"
              title="Actualizar"
              className={button({ variant: "ghost", size: "icon", className: "rounded-xl" })}
            >
              <RefreshCw className="h-4 w-4" aria-hidden />
            </button>
          )}
        </div>
      </div>

      <div role="tabpanel" id={ID_PANEL} aria-labelledby={idPestanaDeSeccion(ID_PANEL, vista)}>
        {vista === "pendientes" ? <BandejaPendientes carga={carga} ahora={ahora} /> : <ConciliacionDocumental />}
      </div>
    </div>
  );
}
