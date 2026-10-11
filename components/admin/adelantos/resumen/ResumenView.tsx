"use client";

/**
 * Resumen de Adelantos — la primera sub-vista, ordenada por la pregunta que se
 * hace al abrirla (ley de orden, `.claude/rules/ui-components.md`):
 *
 *   1. ¿Cuánto me deben? — título + ⓘ + Indicadores plegables (plegados dicen
 *      «Te deben S/ X» en el botón) + «⋯», en UNA fila.
 *   2. ¿Qué se escapó o vence ya? — «sin control» en una línea que se
 *      despliega, y «vence esta semana».
 *   3. El detalle: la cuenta por persona (adelantos + cuenta forestal).
 *
 * 11-10 (patrón del panel): el saldo salía CINCO veces en la primera pantalla
 * (la cifra grande, «Te faltan … por recuperar», la línea de indicadores,
 * «Total por recuperar» y el aviso) y «Quién te debe» repetía los cinco
 * primeros deudores de Cobranza —misma regla, mismo orden, mismo WhatsApp—,
 * que a su vez están en Mi Plata › Lo que me deben. Ahora la cifra va una vez
 * (Indicadores), los deudores viven en Cobranza (en el «⋯») y lo propio de
 * esta vista es la cuenta de cada persona. La dona de % pasó a la tarjeta
 * «Recuperaste». Medido a 1280 en `main`: 2,10 pantallas antes.
 *
 * Todo lo de esta vista es «lo que te deben» (sólo lo DADO, ADR-448); lo
 * RECIBIDO entra sólo en «Le debes».
 */

import { SectionTitle } from "@buleje/design-system";
import { CheckCircle, Coins, HandCoins, MoreHorizontal, RefreshCw, TrendingUp, Wallet } from "@buleje/design-system/icons";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import TarjetaIndicador from "@/components/admin/por-cobrar/TarjetaIndicador";
import { irAlOrigen } from "@/components/admin/unified/finanzas/resultado/ir-al-origen";
import { deudoresDeCobranza } from "@/lib/adelantos/urgencia-cobranza";
import type { DbAdelanto } from "@/lib/db/adelantos.db";
import ProximosVencimientos from "../cobranza/ProximosVencimientos";
import SinControl from "../cobranza/SinControl";
import CuentasPorPersona from "../cuentas/CuentasPorPersona";
import { EmptyState, SkeletonGrid, fmtMonedas, sumByMoneda } from "../shared";
import ResumenSinActividad from "./ResumenSinActividad";
import type { Resumen } from "./tipos";

interface Props {
  resumen: Resumen | null;
  /** Sólo lo DADO: todo lo de esta vista es «lo que te deben». */
  adelantos: DbAdelanto[];
  /** Lo RECIBIDO, para «Le debes». */
  recibidos: DbAdelanto[];
  loading: boolean;
  onGoTab: (tab: string) => void;
  /** Recargar después de tocar un adelanto desde su ficha (aviso «sin control»). */
  onChange: () => void;
}

export default function ResumenView({ resumen, loading, onGoTab, ...resto }: Props) {
  if (loading && !resumen) return <SkeletonGrid />;
  if (!resumen) return <EmptyState icon={Wallet} title="Sin datos aún" hint="Crea tu primer adelanto con «Entregar»." />;
  // Sin actividad todavía → guía de 2 pasos en vez del muro de ceros.
  if (resumen.beneficiarios === 0 && resumen.adelantosAbiertos === 0 && resumen.adelantosLiquidados === 0) {
    return <ResumenSinActividad onGoTab={onGoTab} />;
  }
  return <ResumenConDatos resumen={resumen} onGoTab={onGoTab} {...resto} />;
}

function ResumenConDatos({
  resumen,
  adelantos,
  recibidos,
  onGoTab,
  onChange,
}: Omit<Props, "resumen" | "loading"> & { resumen: Resumen }) {
  const abiertos = adelantos.filter((a) => a.status === "ABIERTO" && a.saldoPendiente > 0);
  const deudores = deudoresDeCobranza(abiertos).length;

  // Cifras segmentadas por moneda (ADR-118) — desde el listado (que trae moneda)
  const activos = adelantos.filter((a) => a.status !== "CANCELADO");
  const saldoMap = sumByMoneda(abiertos.map((a) => ({ monto: a.saldoPendiente, moneda: a.moneda })));
  const adelantadoMap = sumByMoneda(activos.map((a) => ({ monto: a.montoAdelantado, moneda: a.moneda })));
  const liquidadoMap = sumByMoneda(activos.map((a) => ({ monto: Math.max(0, a.montoAdelantado - a.saldoPendiente), moneda: a.moneda })));
  const excedenteMap = sumByMoneda(adelantos.filter((a) => a.status === "EXCEDIDO").map((a) => ({ monto: -a.saldoPendiente, moneda: a.moneda })));
  const hayExcedente = Object.values(excedenteMap).some((v) => v > 0);
  /* «Le debes» = lo que te entregaron de más + lo que te dieron y todavía
     devuelves (ADR-448 §2.6: la misma cuenta que la ficha de la persona). */
  const porDevolverMap = sumByMoneda(recibidos.filter((a) => a.status === "ABIERTO").map((a) => ({ monto: a.saldoPendiente, moneda: a.moneda })));
  const leDebesMap = sumByMoneda([
    ...Object.entries(excedenteMap).map(([moneda, monto]) => ({ monto, moneda })),
    ...Object.entries(porDevolverMap).map(([moneda, monto]) => ({ monto, moneda })),
  ]);
  const hayLeDebes = Object.values(leDebesMap).some((v) => v > 0);
  const hayPorDevolver = Object.values(porDevolverMap).some((v) => v > 0);

  const adelantado = resumen.totalAdelantado;
  const pct = adelantado > 0 ? Math.min(100, Math.round((resumen.totalLiquidado / adelantado) * 100)) : 0;
  const saldoTexto = fmtMonedas(saldoMap);
  /* Sin saldo, el detalle dice por qué (al día o te entregaron de más). */
  const detalleSaldo =
    resumen.saldoPendiente > 0
      ? `${abiertos.length} adelanto${abiertos.length === 1 ? "" : "s"} abierto${abiertos.length === 1 ? "" : "s"} de ${deudores} persona${deudores === 1 ? "" : "s"}`
      : hayExcedente
        ? `Te entregaron ${fmtMonedas(excedenteMap)} de más`
        : "Todo al día: nadie te debe nada";

  const kpis = useKpisPlegables({
    claveMemoria: "adelantos-resumen",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    resumen: resumen.saldoPendiente > 0 ? `Te deben ${saldoTexto}` : "Nadie te debe",
    tarjetas: [
      <TarjetaIndicador key="saldo" rotulo="Saldo pendiente" valor={saldoTexto} detalle={detalleSaldo} icono={Wallet} tono="destacado"
        ayuda="Lo que te deben de los adelantos que diste y siguen abiertos, por moneda. Diste S/ 1,000 y te entregaron S/ 400 en madera: el saldo es S/ 600." />,
      <TarjetaIndicador key="recuperado" rotulo="Recuperaste" valor={`${pct} %`} detalle={`${fmtMonedas(liquidadoMap)} de ${fmtMonedas(adelantadoMap)} adelantados`} icono={TrendingUp} />,
      <TarjetaIndicador
        key="le-debes"
        rotulo="Le debes"
        valor={fmtMonedas(leDebesMap)}
        detalle={
          !hayLeDebes
            ? "Nadie te adelantó ni te entregó de más"
            : hayPorDevolver && hayExcedente
              ? `${fmtMonedas(porDevolverMap)} te pagaron antes · ${fmtMonedas(excedenteMap)} de más`
              : hayPorDevolver
                ? "Te pagaron antes o te prestaron"
                : "Te entregaron de más"
        }
        icono={Coins}
      />,
      <TarjetaIndicador key="cuantos" rotulo="Liquidados" valor={String(resumen.adelantosLiquidados)} detalle={`${resumen.beneficiarios} persona${resumen.beneficiarios === 1 ? "" : "s"} en la libreta`} icono={CheckCircle} />,
    ],
  });

  const acciones: MenuAccion[] = [
    { id: "cobrar", label: `Cobrar: ver ${deudores === 1 ? "al deudor" : `los ${deudores} deudores`}`, hint: "Adelantos › Cobranza, del más urgente al menos", icon: HandCoins, onSelect: () => onGoTab("cobranza"), disabled: deudores === 0 },
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
            what="Lo que te deben de los adelantos que diste y siguen abiertos. Abre Indicadores para ver cuánto recuperaste y cuánto le debes tú a alguien."
            affects="Lo que te dieron a ti (te pagaron antes o te prestaron) no entra en el saldo: está en «Le debes». La lista de deudores, del más urgente al menos, está en Cobranza."
            example="Diste S/ 1,000 y te entregaron S/ 400 en madera: te deben S/ 600."
          />
        </div>
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Cobrar, todo lo que te deben y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {/* Los dos avisos juntos: lo que ya se escapó y lo que vence esta semana. */}
      <SinControl datos={resumen.sinControl} onChange={onChange} />
      <ProximosVencimientos adelantos={adelantos} />

      {/* Lo propio de esta vista: la cuenta de cada persona (adelantos + forestal). */}
      <CuentasPorPersona onGoTab={onGoTab} />
    </div>
  );
}
