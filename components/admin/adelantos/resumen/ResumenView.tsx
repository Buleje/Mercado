"use client";

/**
 * Resumen de Adelantos — la primera sub-vista, ordenada por la pregunta que se
 * hace al abrirla (ley de orden, `.claude/rules/ui-components.md`):
 *
 *   1. ¿Cómo estoy? — título + ⓘ + las cuatro cifras (Te deben · Le debes ·
 *      Sin moverse o vencido · Te devolvieron este mes) + «⋯», en UNA fila.
 *   2. ¿Qué hago hoy? — «Hoy toca»: una tarea por fila con su botón (cobrar,
 *      poner fecha, firmar, anotar el celular) y lo que vence esta semana.
 *   3. ¿Con quién? — las 5 cuentas más grandes; la cuenta entera, en Personas.
 *
 * 25-10: el aviso «N adelantos sin control» se fundió en «Hoy toca» (decía
 * cuánto, no qué hacer) y la cuenta por persona quedó en corto, con su versión
 * completa a un toque (Liquidar vive ahí). Las cifras y las tareas las cuenta el
 * servidor (`/api/adelantos/resumen` → `hoyToca`); el aviso de los lunes al dueño
 * dice lo mismo («⋯ › Ver el aviso de esta semana»).
 *
 * Todo lo de esta vista es «lo que te deben» (sólo lo DADO, ADR-448); lo
 * RECIBIDO entra sólo en «Le debes».
 */

import { useState } from "react";
import { SectionTitle } from "@buleje/design-system";
import { BellRing, HandCoins, MoreHorizontal, RefreshCw, Wallet } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import { deudoresDeCobranza } from "@/lib/adelantos/urgencia-cobranza";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import ProximosVencimientos from "../cobranza/ProximosVencimientos";
import { EmptyState, SkeletonGrid } from "../shared";
import AvisoSemanalModal from "./AvisoSemanalModal";
import HoyToca from "./HoyToca";
import PersonasCompactas from "./PersonasCompactas";
import ResumenSinActividad from "./ResumenSinActividad";
import type { Resumen } from "./tipos";
import { useCifrasResumen } from "./use-cifras-resumen";

interface Props {
  resumen: Resumen | null;
  /** Sólo lo DADO: todo lo de esta vista es «lo que te deben». */
  adelantos: DbAdelanto[];
  /** Lo RECIBIDO. Ya no se usa acá («Le debes» lo cuenta el servidor); queda en el contrato del módulo. */
  recibidos?: DbAdelanto[];
  loading: boolean;
  onGoTab: (tab: string) => void;
  /** Recargar después de tocar un adelanto desde su ficha («Hoy toca › Cobrar»). */
  onChange: () => void;
}

export default function ResumenView({ resumen, loading, onGoTab, adelantos, onChange }: Props) {
  if (loading && !resumen) return <SkeletonGrid />;
  if (!resumen) return <EmptyState icon={Wallet} title="Sin datos aún" hint="Crea tu primer adelanto con «Entregar»." />;
  // Sin actividad todavía → guía de 2 pasos en vez del muro de ceros.
  if (resumen.beneficiarios === 0 && resumen.adelantosAbiertos === 0 && resumen.adelantosLiquidados === 0) {
    return <ResumenSinActividad onGoTab={onGoTab} />;
  }
  return <ResumenConDatos resumen={resumen} adelantos={adelantos} onGoTab={onGoTab} onChange={onChange} />;
}

function ResumenConDatos({
  resumen,
  adelantos,
  onGoTab,
  onChange,
}: Pick<Props, "adelantos" | "onGoTab" | "onChange"> & { resumen: Resumen }) {
  const [verAviso, setVerAviso] = useState(false);
  const kpis = useCifrasResumen(resumen);
  const abiertos = adelantos.filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0);
  const deudores = deudoresDeCobranza(abiertos).length;
  const tareas = resumen.hoyToca?.tareas ?? null;

  const acciones: MenuAccion[] = [
    { id: "cobrar", label: `Cobrar: ver ${deudores === 1 ? "al deudor" : `los ${deudores} deudores`}`, hint: "Adelantos › Cobranza, del más urgente al menos", icon: HandCoins, onSelect: () => onGoTab("cobranza"), disabled: deudores === 0 },
    {
      id: "aviso",
      label: "Ver el aviso de esta semana",
      hint: "Lo que te llega cada lunes a las 7:00 por WhatsApp, correo y la campana",
      icon: BellRing,
      onSelect: () => setVerAviso(true),
      disabled: !tareas,
    },
    { id: "todo", label: "Todo lo que te deben", hint: "Mi Plata › Lo que me deben: fiados, préstamos, adelantos y madera", icon: Wallet, onSelect: () => irAlOrigen({ tab: "plata", params: { vista: "por-cobrar" } }) },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: onChange },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <SectionTitle className="whitespace-nowrap text-[var(--text-primary)]">Saldo de adelantos</SectionTitle>
          <InfoTip
            title="Saldo de adelantos"
            what="Lo que te deben de los adelantos que diste, lo que tú debes, lo que lleva tiempo sin moverse y lo que te devolvieron este mes."
            affects="Abajo, «Hoy toca» dice qué hacer y te lleva a hacerlo. Lo mismo te llega cada lunes a las 7:00."
            example="Diste S/ 1,000 y te entregaron S/ 400 en madera: te deben S/ 600."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Cobrar, el aviso de los lunes, todo lo que te deben y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {/* Lo que hay que hacer, y lo que vence esta semana. */}
      <HoyToca tareas={tareas} onGoTab={onGoTab} onChange={onChange} />
      <ProximosVencimientos adelantos={adelantos} />

      {/* Con quién: las 5 cuentas más grandes; la entera, en Personas. */}
      <PersonasCompactas onGoTab={onGoTab} />

      {verAviso && tareas && <AvisoSemanalModal tareas={tareas} onClose={() => setVerAviso(false)} />}
    </div>
  );
}
