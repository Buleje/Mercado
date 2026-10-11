"use client";

/**
 * Mi Plata › Impuestos y reportes › Impuestos del mes: CUÁNTO pagar a SUNAT y
 * CUÁNDO. El cálculo vive en `impuestos/impuestos-del-mes.ts` (misma regla de
 * IGV que el Resumen) y los totales salen de endpoints del servidor.
 *
 * Antes (medido 11-10): un «Libro tributario» armado en el navegador con
 * boletas inventadas (B001-00000001…) sólo de pedidos web, IGV = ×18/118 y un
 * botón «Declarar» por fila que no guardaba nada. El registro real de ventas y
 * compras está en «Para el contador» (formatos 14.1 y 8.1).
 */
import { useState } from "react";
import { toast } from "sonner";
import { SectionTitle } from "@buleje/design-system";
import { BookOpen, CheckCircle, FileText, MoreHorizontal, RefreshCw, Settings2 } from "@buleje/design-system/icons";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { irAEnlace } from "@/components/admin/shared/ir-a-enlace";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { limaDateKey } from "@/lib/utils";
import { REGIMEN_LABELS } from "@/lib/tax/obligaciones-peru";
import { nombreDelMes } from "./impuestos/impuestos-del-mes";
import { useConfigTributaria, useDeclaraciones, type EstadoDeclaracion } from "./impuestos/use-impuestos";
import { useImpuestosDelMes } from "./impuestos/use-impuestos-del-mes";
import ApagarDelMes from "./impuestos/APagarDelMes";
import RegimenModal from "./impuestos/RegimenModal";

const SIGUIENTE: Record<EstadoDeclaracion, { estado: EstadoDeclaracion; rotulo: string } | null> = {
  pendiente: { estado: "presentada", rotulo: "Marcar presentada" },
  presentada: { estado: "pagada", rotulo: "Marcar pagada" },
  pagada: null,
};

export default function TaxTab() {
  const hoy = limaDateKey().slice(0, 7);
  const [mes, setMes] = useState(hoy);
  const [tick, setTick] = useState(0);
  const [regimenAbierto, setRegimenAbierto] = useState(false);
  const config = useConfigTributaria();
  const declaraciones = useDeclaraciones(Number(mes.slice(0, 4)));
  const { calculo, cargando, error, kpis } = useImpuestosDelMes(mes, config.regimen, tick);
  const estado = declaraciones.estadoDe(mes);
  const siguiente = SIGUIENTE[estado];

  const marcar = (nuevo: EstadoDeclaracion) =>
    declaraciones.marcar(mes, nuevo, calculo?.total).catch(() => toast.error("No se pudo guardar. Intenta de nuevo."));

  const acciones: MenuAccion[] = [
    {
      id: "regimen",
      label: "Régimen y RUC",
      hint: "Cambian la tasa de la Renta y la semana en que vence",
      meta: config.regimen.toUpperCase(),
      icon: Settings2,
      onSelect: () => setRegimenAbierto(true),
    },
    { id: "libros", label: "Libros para el contador", hint: "Registro de ventas y de compras del mes, en Excel", icon: BookOpen, onSelect: () => irAEnlace("/admin?tab=plata&vista=contador"), seccion: "Ver" },
    { id: "hoja", label: "El mes en una hoja", hint: "Ingresos, gastos y utilidad en PDF", icon: FileText, onSelect: () => irAEnlace("/admin?tab=plata&vista=reportes"), seccion: "Ver" },
    ...(estado !== "pendiente"
      ? [{ id: "pendiente", label: "Volver a pendiente", hint: "Si la marcaste por error", icon: RefreshCw, onSelect: () => void marcar("pendiente") }]
      : []),
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => setTick((t) => t + 1) },
  ];

  return (
    <div className="space-y-4">
      {/* Una fila: título · mes · Indicadores · acción del mes · Más */}
      <div className="flex flex-wrap items-center gap-2 xl:flex-nowrap">
        <div className="flex shrink-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Impuestos</SectionTitle>
          <InfoTip
            title="Impuestos del mes"
            what="Cuánto le pagas a SUNAT por el mes y hasta cuándo: el IGV de lo que registraste (comprobantes electrónicos menos el IGV de tus gastos) y el pago a cuenta de la Renta según tu régimen."
            affects="Es una estimación con lo registrado: no reemplaza a tu contador. No incluye planilla (ESSALUD, ONP/AFP), detracciones, percepciones ni ITAN."
            example={`Régimen MYPE: 1 % de tus ingresos netos del mes. Vendiste S/ 10,000 sin comprobantes electrónicos → Renta S/ 100 e IGV sin registro.`}
          />
        </div>
        <label className="sr-only" htmlFor="impuestos-mes">Mes</label>
        <input
          id="impuestos-mes"
          type="month"
          value={mes}
          max={hoy}
          onChange={(e) => e.target.value && setMes(e.target.value)}
          className="h-12 shrink-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent)] focus:outline-none"
        />
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          {siguiente ? (
            <button
              type="button"
              onClick={() => void marcar(siguiente.estado)}
              className="inline-flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[var(--accent-dark)] px-4 text-sm font-bold text-white hover:brightness-110"
              title={`Formulario 621 de ${nombreDelMes(mes)}`}
            >
              <CheckCircle className="h-4 w-4" aria-hidden />
              {siguiente.rotulo}
            </button>
          ) : null}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Régimen y RUC, libros para el contador, el mes en una hoja" />
        </div>
      </div>

      {kpis.panel}

      <ApagarDelMes
        mes={mes}
        calculo={calculo}
        cargando={cargando || !config.lista}
        error={error}
        estado={estado}
        regimen={REGIMEN_LABELS[config.regimen]}
        ruc={config.ruc}
        onRuc={() => setRegimenAbierto(true)}
        onReintentar={() => setTick((t) => t + 1)}
      />

      {regimenAbierto && (
        <RegimenModal open onClose={() => setRegimenAbierto(false)} regimen={config.regimen} ruc={config.ruc} guardar={config.guardar} />
      )}
    </div>
  );
}
