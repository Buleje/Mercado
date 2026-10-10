"use client";

/**
 * Hoy en el reparto — la franja de indicadores de Pedidos y reparto › Reparto.
 *
 * `/api/delivery/kpis` se pedía desde siempre en el módulo de Delivery y su
 * respuesta se tiraba (`const [, setKpis]`): tres cifras calculadas en el
 * servidor que nadie veía. Ahora se muestran, plegables y recordadas (ley de
 * la vista, regla 3): plegada, la franja sigue diciendo las tres cifras en una
 * línea. Arranca plegada: el mapa de abajo ya trae sus propias cifras en vivo
 * y siete tarjetas apiladas tapaban el mapa.
 *
 * Las cifras son del servidor; acá no se suma nada.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { StatCard } from "@buleje/design-system";
import { Clock, RefreshCw, Truck, Users } from "@buleje/design-system/icons";
import Plegable from "@/components/admin/shared/Plegable";
import { IconAction } from "@/components/admin/shared/module-primitives";
import { formatNumber } from "@/lib/format";
import { tenantFetch } from "@/lib/tenant-fetch";

interface IndicadoresReparto {
  activePartners: number;
  deliveriesToday: number;
  pendingDeliveries: number;
}

function useIndicadoresReparto() {
  const [datos, setDatos] = useState<IndicadoresReparto | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(false);
  const ultimo = useRef(0);

  const recargar = useCallback(() => {
    const numero = ++ultimo.current;
    setCargando(true);
    tenantFetch("/api/delivery/kpis")
      .then((r) => (r.ok ? (r.json() as Promise<IndicadoresReparto>) : null))
      .then((d) => {
        if (numero !== ultimo.current) return;
        setDatos(d);
        setError(d === null);
      })
      .catch((err) => {
        console.warn("[FranjaReparto] /api/delivery/kpis failed:", err);
        if (numero === ultimo.current) setError(true);
      })
      .finally(() => {
        if (numero === ultimo.current) setCargando(false);
      });
  }, []);

  useEffect(() => {
    recargar();
  }, [recargar]);

  return { datos, cargando, error, recargar };
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

export default function FranjaReparto() {
  const { datos, cargando, error, recargar } = useIndicadoresReparto();
  const cifra = (n: number | undefined) => formatNumber(n);

  const resumen = datos
    ? [
        plural(datos.activePartners, "activo", "activos"),
        plural(datos.deliveriesToday, "entrega hoy", "entregas hoy"),
        `${datos.pendingDeliveries} por entregar`,
      ].join(" · ")
    : cargando
      ? "Cargando…"
      : "No pudimos traer las cifras";

  return (
    <Plegable
      clave="pedidos:reparto:indicadores"
      titulo="Hoy en el reparto"
      variante="franja"
      resumen={resumen}
      acciones={
        <IconAction icon={RefreshCw} label="Actualizar las cifras del reparto" onClick={recargar} busy={cargando} disabled={cargando} />
      }
    >
      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard
          label="Repartidores activos"
          value={cifra(datos?.activePartners)}
          subValue="Dados de alta y habilitados"
          icon={Users}
          density="compact"
        />
        <StatCard
          label="Entregas de hoy"
          value={cifra(datos?.deliveriesToday)}
          subValue="Entregadas desde la medianoche"
          icon={Truck}
          density="compact"
        />
        <StatCard
          label="Por entregar"
          value={cifra(datos?.pendingDeliveries)}
          subValue="Asignadas o en camino"
          icon={Clock}
          density="compact"
          emphasis={datos && datos.pendingDeliveries > 0 ? "warning" : undefined}
        />
      </div>
      {error && !cargando && (
        <p className="mt-2 text-sm text-[var(--data-error-ink)]" role="status">
          No pudimos traer las cifras del reparto. Toca actualizar para reintentar.
        </p>
      )}
    </Plegable>
  );
}
