"use client";

/**
 * Los indicadores de lo que está en marcha (Tablero y Lista), con el patrón
 * del panel (`useKpisPlegables`, alto md): el botón va en la fila del título y,
 * plegado, lleva el titular adentro.
 *
 * 10-10: reemplaza a la línea «18 en marcha · 2 entregados hoy» de la barra de
 * filtros. «En marcha» ya lo dice la pestaña Tablero (su cuenta) y lo
 * entregado es de Archivados (con su rango de fechas): acá va sólo lo que
 * nadie más dice — cuántos no avanzan, quién espera más y cuántos se cobran
 * al entregar. Cuenta lo que pasa los filtros de la barra (y lo dice).
 *
 * 17-10 (O04/P06): sin pedidos no hay nada que medir, y eso se dice («Sin
 * pedidos»), no «Ninguno · todo se mueve» ni «Todo al día», que sonaban a
 * buena noticia con el tablero vacío. «Con deuda» pasa a «Por cobrar», como
 * la plata de cada tarjeta y el chip del filtro.
 */
import { useEffect, useState } from "react";
import { StatCard } from "@buleje/design-system";
import { AlertTriangle, Banknote, Timer } from "@buleje/design-system/icons";
import { useKpisPlegables } from "@/components/admin/forestal/kpis-plegables";
import { InfoTip } from "@/components/superadmin/_shared/InfoTip";
import type { DbOrder } from "@/lib/jsondb";
import { COLUMNAS } from "../kanban/columnas";
import { cifrasDeEspera, textoDeEspera } from "../tiempo-en-estado";
import { STATUS_LABELS } from "../types";

interface Opciones {
  pedidos: readonly DbOrder[];
  cargando: boolean;
  filtrosActivos: number;
  conDeudaFiltrado: boolean;
  onVerPedido: (o: DbOrder) => void;
  onFiltrarDeuda: () => void;
}

const nombreDelPaso = (s: string) =>
  COLUMNAS.find((c) => c.id === s)?.label ?? STATUS_LABELS[s as keyof typeof STATUS_LABELS] ?? s;

/* El botón va DENTRO de la tarjeta (el ⓘ del rótulo es otro botón: no se anidan). */
const ZONA_BOTON =
  "-mx-1 block min-h-12 w-[calc(100%+0.5rem)] rounded-lg px-1 text-left transition-colors hover:bg-[var(--surface-sunken)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]";

export function useIndicadoresPedidos({
  pedidos,
  cargando,
  filtrosActivos,
  conDeudaFiltrado,
  onVerPedido,
  onFiltrarDeuda,
}: Opciones) {
  /* El reloj de la espera: un minuto, como las tarjetas del tablero. */
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const { sinAvanzar, elQueMasEspera } = cifrasDeEspera(pedidos, ahora);
  const conDeuda = pedidos.filter((o) => o.deuda === true).length;
  /* Sin pedidos (o ninguno pasa los filtros) no hay muestra: ni «todo se mueve» ni «0». */
  const sinMuestra = pedidos.length === 0;
  const vacio = filtrosActivos > 0 ? "con estos filtros" : "en marcha";

  const tarjetas = [
    <StatCard
      key="sin-avanzar"
      label="Sin avanzar"
      icon={AlertTriangle}
      info={<InfoTip what="Pedidos que llevan 1 hora o más en el mismo paso (por confirmar, confirmado, preparando o en camino)." />}
      emphasis={sinAvanzar > 0 ? "error" : "neutral"}
      value={
        sinMuestra
          ? "Sin pedidos"
          : sinAvanzar > 0
            ? `${sinAvanzar} ${sinAvanzar === 1 ? "pedido" : "pedidos"}`
            : "Ninguno"
      }
      subValue={sinMuestra ? vacio : sinAvanzar > 0 ? "1 h o más en su paso" : "todo se mueve"}
    />,
    <StatCard
      key="espera"
      label="El que más espera"
      icon={Timer}
      info={<InfoTip what="El pedido que lleva más tiempo sin pasar al paso siguiente. Tócalo para abrirlo." />}
      value={
        elQueMasEspera ? (
          <button type="button" className={ZONA_BOTON} onClick={() => onVerPedido(elQueMasEspera.pedido)}>
            <span className="block truncate">{elQueMasEspera.pedido.customer.name}</span>
            <span className="block text-sm font-normal tabular-nums text-[var(--text-secondary)]">
              {textoDeEspera(elQueMasEspera.ms)} en {nombreDelPaso(elQueMasEspera.pedido.status)}
            </span>
          </button>
        ) : sinMuestra ? (
          "Sin pedidos"
        ) : (
          "—"
        )
      }
    />,
    <StatCard
      key="deuda"
      label="Por cobrar"
      icon={Banknote}
      info={<InfoTip what="Pedidos en efectivo que se cobran al entregar. Tócalo para ver sólo esos (y otra vez para quitar el filtro)." />}
      value={
        <button type="button" className={ZONA_BOTON} aria-pressed={conDeudaFiltrado} onClick={onFiltrarDeuda}>
          <span className="block">
            {sinMuestra && !conDeudaFiltrado ? "Sin pedidos" : `${conDeuda} ${conDeuda === 1 ? "pedido" : "pedidos"}`}
          </span>
          <span className="block text-sm font-normal text-[var(--text-secondary)]">
            {conDeudaFiltrado ? "filtrando: sólo por cobrar" : "se cobran al entregar"}
          </span>
        </button>
      }
    />,
  ];

  return useKpisPlegables({
    claveMemoria: "pedidos-en-marcha",
    alto: "md",
    compactoEnMovil: true,
    soloIcono: true,
    anchoFijo: true,
    sinDatosAun: cargando,
    filtrosActivos,
    resumen: sinMuestra
      ? `Sin pedidos ${vacio}`
      : sinAvanzar > 0
        ? `${sinAvanzar} sin avanzar`
        : "Todo al día",
    tarjetas,
  });
}
