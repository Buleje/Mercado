"use client";

/**
 * Pedidos › Análisis (N06, 17-10): cómo anda la operación de pedidos en el
 * período elegido. Todo lo calcula el servidor; cada cifra dice de qué
 * pedidos sale (el número abre el pedido).
 *
 * Secciones: Tiempos (cuánto tarda cada paso) · Atascados (más de 2 h en el
 * mismo paso) · Cancelados (por motivo) · Reparto (por repartidor y zona) ·
 * Demanda (hora, día y canal).
 */

import { useState } from "react";
import { LoadingState, StatCard } from "@buleje/design-system";
import { AlertTriangle, Ban, CheckCircle2, ClipboardList, MoreHorizontal, RefreshCw, Timer } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones } from "@/components/admin/shared/BarraDeSecciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { ErrorCarga } from "@/components/admin/pedidos/preparacion/piezas";
import { formatCurrency, formatNumber } from "@/lib/format";
import { PERIODOS_ANALISIS, textoDuracion, type PeriodoAnalisis } from "@/lib/pedidos/analisis-operativo";
import { SeccionAtascados, SeccionTiempos } from "./SeccionTiempos";
import { SeccionCancelados, SeccionReparto } from "./SeccionReparto";
import { SeccionDemanda } from "./SeccionDemanda";
import { useAnalisisPedidos } from "./use-analisis-pedidos";

type Seccion = "tiempos" | "atascados" | "cancelados" | "reparto" | "demanda";
const ID_PANEL = "pedidos-analisis-panel";
const SELECT = "h-12 min-w-0 rounded-xl border border-[var(--rule-base)] bg-[var(--surface-raised)] px-3 text-sm text-[var(--text-primary)] focus:border-primary focus:outline-none";

export default function AnalisisPedidos() {
  const { periodo, setPeriodo, datos, cargando, error, recargar } = useAnalisisPedidos();
  const [seccion, setSeccion] = useState<Seccion>("tiempos");
  const a = datos?.analisis ?? null;
  const v = a?.volumen;

  const kpis = useKpisPlegables({
    claveMemoria: "pedidos-analisis",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    abiertoPorDefecto: true,
    sinDatosAun: !a,
    resumen: v ? `${v.pedidos} pedidos · ${v.entregados} entregados · ${v.cancelados} cancelados` : "Calculando…",
    tarjetas: [
      <StatCard density="compact" key="pedidos" highlight label="Pedidos" icon={ClipboardList} value={v?.pedidos ?? "—"} subValue={v ? `${v.enMarcha} siguen en marcha` : undefined} />,
      <StatCard density="compact" key="entregados" label="Entregados" icon={CheckCircle2} value={v?.entregados ?? "—"} subValue={v ? formatCurrency(v.montoEntregado) : undefined} />,
      <StatCard density="compact" key="cancelados" label="Cancelados" icon={Ban} value={v?.cancelados ?? "—"} subValue={v && v.pedidos ? `${Math.round((v.cancelados / v.pedidos) * 100)} % de los pedidos` : undefined} />,
      <StatCard
        density="compact"
        key="punta"
        label="De punta a punta"
        icon={Timer}
        value={a ? textoDuracion(a.hastaEntregar.medianaMs) : "—"}
        subValue={a ? `lo normal, en ${a.hastaEntregar.n} entregados` : undefined}
      />,
    ],
  });

  const acciones: MenuAccion[] = [{ id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void recargar() }];

  const secciones = [
    { clave: "tiempos" as const, rotulo: "Tiempos" },
    { clave: "atascados" as const, rotulo: "Atascados", cuenta: a?.atascados.length || undefined },
    { clave: "cancelados" as const, rotulo: "Cancelados" },
    { clave: "reparto" as const, rotulo: "Reparto" },
    { clave: "demanda" as const, rotulo: "Demanda" },
  ];

  return (
    <div className="space-y-3" data-qa="vista-analisis-pedidos">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
          <BarraDeSecciones secciones={secciones} activa={seccion} onCambiar={setSeccion} etiqueta="Secciones del análisis" idPanel={ID_PANEL} />
        </div>
        <InfoTip
          title="Análisis de pedidos"
          what="Cuánto tarda cada paso, qué pedidos están trabados, por qué se cancelan, quién reparte y cuándo entran los pedidos. Se calcula con el historial de cada pedido."
          affects="«Lo normal» es la mediana: la mitad de los pedidos tardó menos. Con menos de 5 pedidos medidos sale «muestra chica»."
          example="Si «Empezar a preparar» dice 40 min, la mitad de los confirmados esperó menos de 40 min para empezar."
        />
        <div className="ml-auto flex min-w-0 items-center gap-2">
          <select value={periodo} onChange={(e) => setPeriodo(e.target.value as PeriodoAnalisis)} aria-label="Período" className={SELECT}>
            {PERIODOS_ANALISIS.map((p) => (
              <option key={p.clave} value={p.clave}>
                {p.clave === "todo" ? "Desde el inicio" : `Últimos ${p.rotulo}`}
              </option>
            ))}
          </select>
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Actualizar" />
        </div>
      </div>

      {kpis.panel}

      {datos?.truncado && (
        <p className="flex items-center gap-2 text-sm text-[var(--data-warning-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Son más de {formatNumber(datos.tope)} pedidos: se cuentan los más recientes. Elige un período más corto.
        </p>
      )}

      <div role="tabpanel" id={ID_PANEL} aria-busy={cargando}>
        {error ? (
          <ErrorCarga texto={error} onReintentar={() => void recargar()} />
        ) : !a ? (
          <LoadingState message="Calculando el análisis…" />
        ) : seccion === "tiempos" ? (
          <SeccionTiempos etapas={a.etapas} hastaEntregar={a.hastaEntregar} />
        ) : seccion === "atascados" ? (
          <SeccionAtascados atascados={a.atascados} />
        ) : seccion === "cancelados" ? (
          <SeccionCancelados cancelados={a.cancelados} />
        ) : seccion === "reparto" ? (
          <SeccionReparto a={a} />
        ) : (
          <SeccionDemanda franjas={a.franjas} dias={a.dias} origenes={a.origenes} />
        )}
      </div>
    </div>
  );
}
