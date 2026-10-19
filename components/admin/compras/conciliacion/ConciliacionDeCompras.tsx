"use client";

/**
 * Mi Plata › Lo que debo › Conciliación (`?vista=por-pagar&sub=conciliacion`).
 * Hasta el 18-10 era una sección de Compras › Por pagar y se mudó con ella:
 * en el plan Pro, Compras sólo se abría por Por pagar (Comprobantes), así que
 * en Órdenes y recepción se perdía. Sólo mira: «Ver la cuenta» lleva a Lo que debo ›
 * Proveedores con ese proveedor buscado, y «Vincular a su orden» abre la misma
 * ventana de antes (pide confirmar; el servidor une).
 */
import { useState, type ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import VincularOrdenModal from "@/components/admin/cuentas-por-pagar/VincularOrdenModal";
import { useCuentasPorPagar } from "@/components/admin/cuentas-por-pagar/use-cuentas-por-pagar";
import type { CuentaPorPagar } from "@/components/admin/cuentas-por-pagar/resumen-cuentas";
import { hrefDeDestino } from "@/lib/admin/enlaces-panel";
import ConciliacionDocumentos from "./ConciliacionDocumentos";

export default function ConciliacionDeCompras({ barra }: { barra?: ReactNode }) {
  const { cuentas, saving, vincular, error } = useCuentasPorPagar();
  const [aVincular, setAVincular] = useState<CuentaPorPagar | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const verCuenta = (id: string) => {
    const cuenta = cuentas.find((c) => c.id === id);
    irAEnlace(hrefDeDestino({
      tab: "plata",
      params: { vista: "por-pagar", sub: "cuentas", ...(cuenta?.supplierName ? { q: cuenta.supplierName } : {}) },
    }));
  };
  const vincularCuenta = (id: string) => {
    const cuenta = cuentas.find((c) => c.id === id);
    if (cuenta) {
      setAviso(null);
      setAVincular(cuenta);
    } else setAviso("Esa cuenta ya no está en la lista: actualiza la conciliación.");
  };

  return (
    <div className="space-y-3">
      <ConciliacionDocumentos
        marca={cuentas}
        onVerCuenta={verCuenta}
        onVincular={vincularCuenta}
        cabecera={
          <>
            <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Lo que debo</SectionTitle>
            {barra && <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">{barra}</div>}
          </>
        }
      />
      {(aviso || error) && (
        <p role="status" className="text-sm font-semibold text-[var(--data-warning-700)] dark:text-[var(--data-warning-500)]">
          {aviso ?? error}
        </p>
      )}
      {aVincular && <VincularOrdenModal cuenta={aVincular} saving={saving} onVincular={vincular} onCerrar={() => setAVincular(null)} />}
    </div>
  );
}
