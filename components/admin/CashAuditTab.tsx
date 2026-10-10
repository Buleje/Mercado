"use client";

import { useId, useState, type ReactNode } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, ExternalLink, MoreHorizontal, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { exportToCSV } from "@/lib/utils";
import { STATUS_MAP, type CashAudit } from "@/components/admin/arqueo/arqueo-shared";
import { useArqueos } from "@/components/admin/arqueo/use-arqueos";
import KpisCuadre, { BotonIndicadores } from "@/components/admin/arqueo/KpisCuadre";
import TablaCuadres from "@/components/admin/arqueo/TablaCuadres";
import DetalleCuadre from "@/components/admin/arqueo/DetalleCuadre";

type Props = {
  /**
   * Lleva a «Caja de hoy»: ahí se abre y se cierra la caja (con el arqueo
   * guiado), que es de donde salen los cuadres. Desde la ola 3 del panel
   * unificado este módulo es la sección «Cuadrar» de Caja, así que es un salto
   * de sección, no de pestaña.
   */
  onIrACaja?: () => void;
  /**
   * Quién dibuja la cabecera. Dentro de Caja (sección «Cuadrar») la arma Caja
   * en UNA fila con sus secciones: recibe el título con su ⓘ, el botón
   * «Indicadores» y las acciones, que se suman a su menú «Más». Sin esto, la
   * fila propia de siempre.
   */
  cabecera?: (partes: PartesCabeceraCuadres) => ReactNode;
  /**
   * Abre el parte del día de esa caja (de dónde vino el efectivo y si cuadró
   * con las ventas). Lo tenía la tabla del Historial de cajas, que se fue
   * por repetir esta: ahora se llega desde el detalle de cada cuadre.
   */
  onVerParte?: (registerId: string) => void;
  /** La tolerancia de Caja: una diferencia de hasta ± esto sale «Dentro de tolerancia». */
  tolerancia?: number;
  /**
   * Dentro de Caja el cuerpo es el `tabpanel` de su barra de secciones (la
   * cabecera, con las pestañas, queda afuera del panel).
   */
  panel?: { role: "tabpanel"; id: string; "aria-labelledby": string };
};

export interface PartesCabeceraCuadres {
  titulo: ReactNode;
  indicadores: ReactNode;
  acciones: MenuAccion[];
}

/**
 * Los cuadres de caja, uno por caja: los indicadores (plegados y recordados)
 * y la tabla con sus filtros y su buscador. Es Caja › Historial › Por caja.
 * Hasta el 10-10 también traía el contador del efectivo arriba; el contador es
 * de la caja de HOY y se mudó a Caja › Hoy › Cuadrar (`caja/CajaContar`), con
 * el mismo hook.
 */
export default function CashAuditTab({ onIrACaja, cabecera, onVerParte, tolerancia, panel }: Props) {
  const { audits, resumen, loading, error, reload } = useArqueos();
  const [detail, setDetail] = useState<CashAudit | null>(null);
  const [kpisAbiertos, setKpisAbiertos] = useLocalStorage<boolean>("ventas-caja:arqueo:kpis-abiertos", false);
  const kpisId = useId();

  const descargar = () =>
    exportToCSV(
      audits.map((a) => ({
        fecha: a.fecha, turno: a.turno, cajero: a.cajero, cerro: a.cerro || "-",
        esperado: a.expectedAmount, contado: a.countedAmount, diferencia: a.difference,
        estado: STATUS_MAP[a.status].label, conteos_en_turno: a.conteos.length, nota: a.notes,
      })),
      "cuadres-de-caja",
    );

  const titulo = (
    <>
      <SectionTitle>Cuadres de caja</SectionTitle>
      <InfoTip
        title="Cuadrar la caja"
        what="Compara el dinero que debería haber (apertura + ventas en efectivo + ingresos − egresos) con el que cuentas. Cada fila es una caja: abierta o ya cerrada."
        affects="Los faltantes y sobrantes sólo suman los cuadres donde alguien contó. Una caja cerrada desde «Cerrar turno» sin contar queda como «Cerrada sin conteo»."
        example="Valentina abre con S/ 200 y vende S/ 350 en efectivo: se esperan S/ 550. Si cuenta S/ 540 → faltante de S/ 10."
      />
    </>
  );
  const indicadores = <BotonIndicadores abierto={kpisAbiertos} onAlternar={() => setKpisAbiertos((v) => !v)} controla={kpisId} />;
  /* Dentro de Caja, «Ir a Caja › Hoy» sobra en el menú: la sección «Hoy» está en la misma fila. */
  const acciones: MenuAccion[] = [
    { id: "cuadres-refrescar", seccion: "Cuadres", label: "Actualizar los cuadres", icon: RefreshCw, onSelect: reload, disabled: loading },
    { id: "cuadres-csv", seccion: "Cuadres", label: "Descargar CSV", hint: "Todos los cuadres", icon: Download, onSelect: descargar, disabled: audits.length === 0 },
    ...(onIrACaja && !cabecera ? [{ id: "cuadres-ir-a-caja", seccion: "Cuadres", label: "Ir a Caja › Hoy", hint: "Abrir o cerrar la caja", icon: ExternalLink, onSelect: onIrACaja }] : []),
  ];

  return (
    <div className="space-y-4">
      {cabecera ? (
        cabecera({ titulo, indicadores, acciones })
      ) : (
        <div className="flex items-center gap-2">
          {titulo}
          <div className="ml-auto flex items-center gap-2">
            {indicadores}
            <ActionMenu label="Más acciones" soloIcono size="md" className="w-12" icon={MoreHorizontal} actions={acciones} />
          </div>
        </div>
      )}

      <div {...panel} className="space-y-4">
        {error ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] py-1 pl-4 pr-1 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
            <button type="button" onClick={reload} className="ml-auto min-h-12 rounded-xl px-3 font-bold underline">Reintentar</button>
          </div>
        ) : loading && audits.length === 0 ? (
          <div className="flex justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8" role="status" aria-label="Cargando cuadres">
            <LoadingSpinner size={32} />
          </div>
        ) : (
          <>
            <KpisCuadre resumen={resumen} abierto={kpisAbiertos} id={kpisId} />
            <TablaCuadres audits={audits} onVer={setDetail} onIrACaja={onIrACaja} tolerancia={tolerancia} />
          </>
        )}
      </div>

      {detail && (
        <DetalleCuadre
          detail={detail}
          onClose={() => setDetail(null)}
          onVerParte={onVerParte ? () => { const id = detail.id; setDetail(null); onVerParte(id); } : undefined}
        />
      )}
    </div>
  );
}
