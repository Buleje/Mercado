"use client";

import { useId, useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { AlertTriangle, Download, ExternalLink, MoreHorizontal, RefreshCw } from "@buleje/design-system/icons";
import ActionMenu from "@/components/admin/shared/action-menu";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { exportToCSV } from "@/lib/utils";
import { STATUS_MAP, type CashAudit } from "@/components/admin/arqueo/arqueo-shared";
import { useArqueos } from "@/components/admin/arqueo/use-arqueos";
import ContadorEfectivo from "@/components/admin/arqueo/ContadorEfectivo";
import KpisCuadre, { BotonIndicadores } from "@/components/admin/arqueo/KpisCuadre";
import TablaCuadres from "@/components/admin/arqueo/TablaCuadres";
import DetalleCuadre from "@/components/admin/arqueo/DetalleCuadre";
import DesdeTurno from "@/components/admin/arqueo/DesdeTurno";

type Props = {
  /**
   * Lleva a Caja registradora: ahí se abre y se cierra la caja (con el arqueo
   * guiado), que es de donde salen los cuadres. Antes se llamaba
   * `onNavigateToTurnos` y el botón decía «Ir a Turnos», pero siempre llevó a
   * Caja registradora.
   */
  onIrACaja?: () => void;
};

/**
 * «Cuadrar caja»: arriba lo que se mira primero —cuánto debería haber en la
 * caja abierta y el contador—, después los indicadores (plegados y
 * recordados) y abajo el historial con sus filtros.
 */
export default function CashAuditTab({ onIrACaja }: Props) {
  const { audits, resumen, loading, error, reload, openRegister, openAudit, openExpectedAmount } = useArqueos();
  const [detail, setDetail] = useState<CashAudit | null>(null);
  const [contadorAbierto, setContadorAbierto] = useState(false);
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

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <SectionTitle>Cuadres de caja</SectionTitle>
        <InfoTip
          title="Cuadrar la caja"
          what="Compara el dinero que debería haber (apertura + ventas en efectivo + ingresos − egresos) con el que cuentas. Cada fila es una caja: abierta o ya cerrada."
          affects="Los faltantes y sobrantes sólo suman los cuadres donde alguien contó. Una caja cerrada desde «Cerrar turno» sin contar queda como «Cerrada sin conteo»."
          example="Valentina abre con S/ 200 y vende S/ 350 en efectivo: se esperan S/ 550. Si cuenta S/ 540 → faltante de S/ 10."
        />
        <div className="ml-auto flex items-center gap-2">
          <BotonIndicadores abierto={kpisAbiertos} onAlternar={() => setKpisAbiertos((v) => !v)} controla={kpisId} />
          <ActionMenu
            label="Más acciones"
            soloIcono
            icon={MoreHorizontal}
            actions={[
              { id: "refrescar", label: "Actualizar", icon: RefreshCw, onSelect: reload, busy: loading },
              { id: "descargar", label: "Descargar CSV", hint: "Todos los cuadres", icon: Download, onSelect: descargar, disabled: audits.length === 0 },
              ...(onIrACaja ? [{ id: "caja", label: "Ir a Caja registradora", hint: "Abrir o cerrar la caja", icon: ExternalLink, onSelect: onIrACaja }] : []),
            ]}
          />
        </div>
      </div>

      <DesdeTurno />

      <ContadorEfectivo
        expectedAmount={openExpectedAmount}
        registerId={openRegister?.id ?? null}
        abiertaDesde={openRegister?.openedAt ?? null}
        ultimoConteo={openAudit?.conteos[0] ?? null}
        abierto={contadorAbierto}
        onAlternar={() => setContadorAbierto((v) => !v)}
        onSaved={reload}
        onIrACaja={onIrACaja}
      />

      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--data-error-500)]/30 bg-[var(--data-error-50)] px-4 py-3 text-sm text-[var(--data-error-700)] dark:bg-[var(--data-error-500)]/15 dark:text-[var(--data-error-500)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> {error}
          <button type="button" onClick={reload} className="ml-auto min-h-10 px-2 font-bold underline">Reintentar</button>
        </div>
      ) : loading && audits.length === 0 ? (
        <div className="flex justify-center rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] p-8" role="status" aria-label="Cargando cuadres">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      ) : (
        <>
          <KpisCuadre resumen={resumen} abierto={kpisAbiertos} id={kpisId} />
          <TablaCuadres audits={audits} onVer={setDetail} onIrACaja={onIrACaja} />
        </>
      )}

      {detail && <DetalleCuadre detail={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}
