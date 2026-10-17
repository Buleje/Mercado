"use client";

/**
 * Reparto › En vivo: dónde está cada repartidor y qué hace, ahora.
 *
 *  - Indicadores (botón en la cabecera de Reparto): las cifras de hoy del
 *    servidor (`/api/delivery/kpis`, antes la franja «Hoy en el reparto») y las
 *    del sondeo en vivo (en línea, con oferta, atendiendo). Una sola fila de
 *    tarjetas: antes eran la franja + cuatro tarjetas grandes encima del mapa.
 *  - El mapa con la lista, lo primero de la pantalla.
 *  - Las rutas y paradas pasaron a su propia sección «Rutas» (17-10, P17):
 *    plegadas abajo del mapa nadie las encontraba.
 *
 * Un solo sondeo (`useDeliveryPartnersLive`, cada 10 s) alimenta el mapa y los
 * indicadores. Las cifras son del servidor; acá no se suma plata.
 */
import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, PackageCheck, Truck, Users } from "@buleje/design-system/icons";
import { useDeliveryPartnersLive } from "@/components/admin/OrdersTab/hooks/useDeliveryPartnersLive";
import { LoadingSpinner } from "@/components/ui-system/LoadingSpinner";
import { formatNumber } from "@/lib/format";
import { tenantFetch } from "@/lib/tenant-fetch";
import { useIndicadoresReparto, type Indicador } from "./reparto-indicadores";

// Leaflet usa `window`.
const DeliveryPartnersLiveMap = dynamic(() => import("./DeliveryPartnersLiveMap"), {
  ssr: false,
  loading: () => <LoadingSpinner className="mx-auto my-16" />,
});

interface CifrasDelDia {
  activePartners: number;
  deliveriesToday: number;
  pendingDeliveries: number;
}

/** `/api/delivery/kpis`: una respuesta vieja no pisa a la nueva. */
function useCifrasDelDia() {
  const [datos, setDatos] = useState<CifrasDelDia | null>(null);
  const ultimo = useRef(0);
  const recargar = useCallback(() => {
    const numero = ++ultimo.current;
    tenantFetch("/api/delivery/kpis")
      .then((r) => (r.ok ? (r.json() as Promise<CifrasDelDia>) : null))
      .then((d) => {
        if (numero === ultimo.current) setDatos(d);
      })
      .catch((err) => {
        console.warn("[RepartoEnVivo] /api/delivery/kpis failed:", err);
      });
  }, []);
  useEffect(() => {
    recargar();
  }, [recargar]);
  return { datos, recargar };
}

const plural = (n: number, uno: string, varios: string) => `${formatNumber(n)} ${n === 1 ? uno : varios}`;

export default function RepartoEnVivo() {
  const live = useDeliveryPartnersLive({ intervaloMs: 10_000 });
  const { datos: dia, recargar } = useCifrasDelDia();
  const { summary, lastUpdate, refresh } = live;
  const actualizar = () => {
    refresh();
    recargar();
  };

  const indicadores: Indicador[] = [
    {
      icono: CheckCircle,
      rotulo: "En línea",
      valor: formatNumber(summary.online),
      extra: `de ${plural(summary.total, "habilitado", "habilitados")}`,
      ayuda: "Con la app abierta ahora. Los demás no reciben pedidos hasta que la abran.",
      tono: summary.online > 0 ? "ok" : undefined,
    },
    {
      icono: Clock,
      rotulo: "Con oferta",
      valor: formatNumber(summary.withOffer),
      ayuda: "Les llegó un pedido y todavía no lo aceptan.",
      tono: summary.withOffer > 0 ? "alerta" : undefined,
    },
    { icono: Truck, rotulo: "Atendiendo", valor: formatNumber(summary.busy), ayuda: "Llevan un pedido ahora." },
    {
      icono: PackageCheck,
      rotulo: "Entregas de hoy",
      valor: dia ? formatNumber(dia.deliveriesToday) : "—",
      ayuda: "Entregadas desde la medianoche, de todos tus repartidores.",
    },
    {
      icono: Clock,
      rotulo: "Por entregar",
      valor: dia ? formatNumber(dia.pendingDeliveries) : "—",
      ayuda: "Asignadas o en camino, todavía sin entregar.",
      tono: dia && dia.pendingDeliveries > 0 ? "alerta" : undefined,
    },
    {
      icono: Users,
      rotulo: "Habilitados",
      valor: dia ? formatNumber(dia.activePartners) : "—",
      ayuda: "Repartidores dados de alta y activos en Equipo (aunque ahora estén sin conexión).",
    },
  ];
  const kpis = useIndicadoresReparto({
    clave: "en-vivo",
    cargando: !lastUpdate && !dia,
    // ~23 caracteres entran en el botón; los en línea ya se ven en la leyenda del mapa.
    resumen: dia ? `${formatNumber(dia.pendingDeliveries)} por entregar · ${formatNumber(dia.deliveriesToday)} hoy` : `${formatNumber(summary.online)} en línea`,
    indicadores,
  });

  return (
    <div className="space-y-4">
      {kpis.boton}
      {kpis.panel}
      <DeliveryPartnersLiveMap live={live} onActualizar={actualizar} />
    </div>
  );
}
