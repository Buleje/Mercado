"use client";

/**
 * Pedidos › Preparación (N02 + N01, 17-10): qué juntar para los pedidos
 * confirmados, de qué pedido sale cada cosa y cuáles ya están listos para
 * salir. Tres secciones:
 *  - Por producto: la lista de recojo sumada (se imprime en una hoja);
 *  - Por pedido: la lista de cada pedido para ir marcando, con «Marcar listo»;
 *  - Agenda: los pedidos con día y franja de entrega (N01 Programados).
 *
 * Lo juntado no cambia el estado del pedido (vive aparte); «Empezar a
 * preparar» usa la transición de siempre del Tablero.
 */

import { useEffect, useMemo, useState } from "react";
import { LoadingState, StatCard } from "@buleje/design-system";
import { AlertTriangle, ClipboardList, MoreHorizontal, PackageCheck, Printer, RefreshCw, Timer } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import ActionMenu, { type MenuAccion } from "@/components/admin/shared/action-menu";
import { BarraDeSecciones } from "@/components/admin/shared/BarraDeSecciones";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { intervaloVisible } from "@/lib/client-cache-fetch";
import { etapaDe } from "@/lib/pedidos/preparacion";
import { AgendaEntregas } from "./AgendaEntregas";
import { HojaPreparacion } from "./HojaPreparacion";
import { ErrorCarga } from "./piezas";
import { PorPedido } from "./PorPedido";
import { PorProducto } from "./PorProducto";
import { usePreparacion } from "./use-preparacion";

type Seccion = "producto" | "pedido" | "agenda";
const SECCIONES: readonly Seccion[] = ["producto", "pedido", "agenda"];
const ID_PANEL = "pedidos-preparacion-panel";

export default function PreparacionPedidos() {
  const prep = usePreparacion();
  const [guardada, setSeccion] = useLocalStorage<Seccion>("pedidos-preparacion-seccion", "pedido");
  const seccion: Seccion = SECCIONES.includes(guardada) ? guardada : "pedido";
  const [imprimiendo, setImprimiendo] = useState(false);
  /* Los «hace 20 min» avanzan solos con la pestaña a la vista. */
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => intervaloVisible(() => setAhora(Date.now()), 60_000), []);

  const cuenta = useMemo(() => {
    const c = { juntando: 0, listos: 0, faltante: 0 };
    for (const p of prep.pedidos) {
      const e = etapaDe(p);
      if (e === "en-curso") c.juntando++;
      if (e === "listo" || e === "listo-parcial") c.listos++;
      if (e === "listo-parcial") c.faltante++;
    }
    return c;
  }, [prep.pedidos]);
  const total = prep.pedidos.length;

  const kpis = useKpisPlegables({
    claveMemoria: "pedidos-preparacion",
    alto: "md",
    compactoEnMovil: true,
    anchoFijo: true,
    sinDatosAun: prep.cargando,
    resumen: total ? `${total} por preparar · ${cuenta.listos} listos` : "Nada por preparar",
    tarjetas: [
      <StatCard density="compact" key="por" highlight label="Por preparar" icon={ClipboardList} value={total} subValue="confirmados y preparando" />,
      <StatCard density="compact" key="juntando" label="Juntando" icon={Timer} value={cuenta.juntando} subValue="con algo ya marcado" />,
      <StatCard density="compact" key="listos" label="Listos para salir" icon={PackageCheck} value={cuenta.listos} subValue="esperan al repartidor" />,
      <StatCard density="compact" key="faltante" label="Con faltante" icon={AlertTriangle} value={cuenta.faltante} subValue="salen incompletos" />,
    ],
  });

  const acciones: MenuAccion[] = [
    {
      id: "imprimir",
      label: "Imprimir hoja de recojo",
      hint: `${total} ${total === 1 ? "pedido" : "pedidos"}: por producto y por pedido, sin teléfonos ni plata`,
      icon: Printer,
      disabled: total === 0,
      onSelect: () => setImprimiendo(true),
    },
    { id: "actualizar", label: "Actualizar", icon: RefreshCw, onSelect: () => void prep.recargar() },
  ];

  return (
    <div className="space-y-3" data-qa="vista-preparacion">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        <div className="order-last w-full min-w-0 sm:order-none sm:w-auto">
          <BarraDeSecciones
            secciones={[
              { clave: "pedido", rotulo: "Por pedido" },
              { clave: "producto", rotulo: "Por producto" },
              { clave: "agenda", rotulo: "Agenda", cuenta: prep.agenda.length || undefined },
            ]}
            activa={seccion}
            onCambiar={setSeccion}
            etiqueta="Secciones de Preparación"
            idPanel={ID_PANEL}
            tonoCuenta="neutro"
          />
        </div>
        <InfoTip
          title="Preparación"
          what="Lo que hay que juntar para los pedidos confirmados y en preparación: sumado por producto, o pedido por pedido para ir marcando. «Marcar listo» guarda quién lo armó y cuántos bultos salen."
          affects="Lo marcado no cambia el pedido. «Empezar a preparar» (o «Marcar listo» de un pedido confirmado) lo pasa a «Preparando», igual que en el Tablero, y le avisa al cliente."
          example="3 pedidos con Arroz Costeño 1 kg (2, 1 y 3) dan «Juntar 6» en Por producto."
        />
        <div className="ml-auto flex min-w-0 items-center gap-2">
          {kpis.boton}
          <ActionMenu label="Más" icon={MoreHorizontal} actions={acciones} soloIcono size="md" className="w-12 shrink-0" title="Imprimir la hoja de recojo y actualizar" />
        </div>
      </div>

      {kpis.panel}

      {prep.truncado && (
        <p className="flex items-center gap-2 text-sm text-[var(--data-warning-ink)]">
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden /> Son muchos: se ven los 200 más antiguos. Pasa a «En camino» los que ya salieron.
        </p>
      )}

      <div role="tabpanel" id={ID_PANEL}>
        {prep.cargando ? (
          <LoadingState message="Trayendo los pedidos por preparar…" />
        ) : prep.error ? (
          <ErrorCarga texto="No pudimos traer los pedidos por preparar. Revisa tu conexión e inténtalo otra vez." onReintentar={() => void prep.recargar()} />
        ) : seccion === "producto" ? (
          <PorProducto pedidos={prep.pedidos} />
        ) : seccion === "agenda" ? (
          <AgendaEntregas agenda={prep.agenda} ahora={ahora} />
        ) : (
          <PorPedido prep={prep} ahora={ahora} />
        )}
      </div>

      {imprimiendo && <HojaPreparacion pedidos={prep.pedidos} onCerrar={() => setImprimiendo(false)} />}
    </div>
  );
}
